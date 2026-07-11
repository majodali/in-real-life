// The user-model projector — the first async Streams consumer
// (docs/projection-store.md, D36).
//
// Consumes enriched event records from the irl-events-log stream and
// maintains the derived read store `irl-user-model` (PK userId, SK typed).
// v1 handles the onboarding seed and shredding:
//
//   OnboardingCompleted  → decrypt the extraction with the per-user key and
//                          seed profile#core + interest#/strength#/barrier#
//                          items. A missing key means the user was already
//                          shredded — skip, never choke the stream.
//   UserDeleted /        → purge the partition and leave an empty tombstone.
//   UserKeyShredded        Both handled so the purge lands even if the
//                          best-effort shred-audit event never did.
//
// Debrief/reflection deltas are future work: DebriefSubmitted carries no
// extracted deltas yet, and precedence/decay (D7) only becomes real once a
// second source can touch an existing value. When that lands, the apply
// step becomes read → precedence/decay → conditional write on `version`;
// today every write is a first-write seed (conditional on the item not
// existing, which also makes duplicate stream delivery a no-op).
//
// Determinism rules (the doc's hard constraints):
//   - All recency (`asOf`) comes from the event's simulatedTime — never
//     wall-clock now — so replay is deterministic and a workshop
//     time-advance can't silently age the model.
//   - No LLM calls here: deltas ride in the events, frozen at command time.
//
// Every model payload is encrypted under the same per-user key as the log
// (shredding the key makes this store unreadable even before the purge);
// only structural metadata (sk, version, lastEventId, asOf) stays clear.

import { GetCommand, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { decryptValue, encryptValue } from '../lib/crypto-shred.mjs';

// Deterministic sort-key slug for variable-set items. Collisions merge,
// which is the semantics we want (two mentions of "pottery" are one
// interest, not two).
export function modelSlug(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug || 'unnamed';
}

export function createUserModelProjector({ client, userModelTable, keyStore }) {
  async function applyEvent(event) {
    if (typeof event?.aggregateId !== 'string' || !event.aggregateId.startsWith('user#')) {
      return;
    }
    switch (event.eventType) {
      case 'OnboardingCompleted':
        return seedFromOnboarding(event);
      case 'UserDeleted':
      case 'UserKeyShredded':
        return purge(event);
      default:
        return;
    }
  }

  async function seedFromOnboarding(event) {
    const userId = event.data.userId;
    const dataKey = await keyStore.getKey(event.aggregateId);
    if (!dataKey) {
      // Already shredded — the purge from UserDeleted later in this
      // partition (or a previous run) owns the tombstone.
      return;
    }
    const extraction = decryptValue(event.data.extraction, dataKey);

    const items = [coreItem(extraction), ...collectionItems(extraction)];
    for (const { sk, payload } of items) {
      await put({
        userId,
        sk,
        model: encryptValue(payload, dataKey),
        version: 1,
        lastEventId: event.eventId,
        asOf: event.simulatedTime,
      });
    }
  }

  function coreItem(extraction) {
    // Growth edges live on the envelope dims in the extraction; surface
    // them as their own facet of profile#core per the store design.
    const growthEdges = Object.entries(extraction.envelope ?? {})
      .filter(([, dim]) => dim?.growthEdge)
      .map(([dimension, dim]) => ({
        dimension,
        edge: dim.growthEdge,
        provenance: dim.provenance,
        confidence: dim.confidence,
      }));
    return {
      sk: 'profile#core',
      payload: {
        envelope: extraction.envelope ?? {},
        doors: extraction.doors ?? [],
        constraints: extraction.constraints ?? {},
        growthEdges,
        provisional: extraction.provisional !== false,
      },
    };
  }

  function collectionItems(extraction) {
    return [
      ...(extraction.interests ?? []).map((interest) => ({
        sk: `interest#${modelSlug(interest.tag)}`,
        payload: interest,
      })),
      ...(extraction.strengthsToOffer ?? []).map((strength) => ({
        sk: `strength#${modelSlug(strength.what)}`,
        payload: strength,
      })),
      ...(extraction.barriers ?? []).map((barrier) => ({
        sk: `barrier#${modelSlug(barrier.what)}`,
        payload: barrier,
      })),
    ];
  }

  async function put(item) {
    try {
      await client.send(new PutCommand({
        TableName: userModelTable,
        Item: item,
        // First-write seed: an existing item means either a duplicate
        // stream delivery or a later delta already landed — never clobber.
        ConditionExpression: 'attribute_not_exists(userId)',
      }));
    } catch (err) {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
    }
  }

  async function purge(event) {
    const userId = event.data.userId;
    let lastKey;
    do {
      const page = await client.send(new QueryCommand({
        TableName: userModelTable,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ProjectionExpression: 'sk',
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      }));
      for (const item of page.Items ?? []) {
        await client.send(new DeleteCommand({
          TableName: userModelTable,
          Key: { userId, sk: item.sk },
        }));
      }
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    // Empty tombstone (open-risks #3): the PII-derived model can't — and
    // shouldn't — be rebuilt for a shredded user; replay lands here too.
    await client.send(new PutCommand({
      TableName: userModelTable,
      Item: {
        userId,
        sk: 'tombstone',
        shreddedAt: event.simulatedTime,
        lastEventId: event.eventId,
      },
    }));
  }

  // Read-side helper for future consumers (matching, backstage review):
  // fetch and decrypt one facet. Returns null for missing items and for
  // shredded users (no key → the ciphertext is dead).
  async function readFacet(userId, sk) {
    const [row, dataKey] = await Promise.all([
      client.send(new GetCommand({
        TableName: userModelTable,
        Key: { userId, sk },
      })),
      keyStore.getKey(`user#${userId}`),
    ]);
    if (!row.Item?.model || !dataKey) return null;
    return {
      ...row.Item,
      model: decryptValue(row.Item.model, dataKey),
    };
  }

  return { applyEvent, readFacet };
}
