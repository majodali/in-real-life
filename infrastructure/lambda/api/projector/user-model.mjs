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
import { decryptValue, encryptValue, decryptPii } from '../lib/crypto-shred.mjs';

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
    if (typeof event?.aggregateId !== 'string') return;
    if (event.aggregateId.startsWith('interaction#')
      && event.eventType === 'DebriefSubmitted') {
      return applyDebrief(event);
    }
    if (!event.aggregateId.startsWith('user#')) return;
    switch (event.eventType) {
      case 'OnboardingCompleted':
        return seedFromOnboarding(event);
      case 'ReflectionRecorded':
        return applyReflection(event);
      case 'UserDeleted':
      case 'UserKeyShredded':
        return purge(event);
      default:
        return;
    }
  }

  // ── Reflection deltas (docs/reflection-and-coaching.md) ──
  //
  // Same observed evidence as a Tier-2 debrief, applied through the same
  // shared delta logic. A suppressed reflection (conduct-quarantined
  // debrief upstream) is non-model-bearing: the narrative stays on the
  // log; nothing reaches the model.
  async function applyReflection(event) {
    const d = event.data;
    if (d.suppressed) return;
    const userId = d.userId;
    const dataKey = await keyStore.getKey(`user#${userId}`);
    if (!dataKey) return;
    if (d.deltas === undefined) return;
    const clear = decryptPii(d, ['deltas'], dataKey);
    const asOf = event.simulatedTime;
    const source = { eventId: d.eventId, sourceEventId: event.eventId, asOf };
    await applyExtractedDeltas(userId, dataKey, clear.deltas, source, asOf, event.eventId);
  }

  // ── Debrief deltas (docs/debrief.md → Projection-update mechanism) ──
  //
  // The second delta source: applied read → apply → conditional write on
  // `version` (D7 lives here; conflict resolution starts as
  // per-contribution judgment calls). All recency is the event's
  // simulatedTime. Conduct-quarantined debriefs are non-model-bearing
  // (open-risks #11) — the command already suppressed the preference
  // fields; the flag check here is defence in depth.

  async function applyDebrief(event) {
    const d = event.data;
    if (d.suppressed || d.conductConcern) return;

    const userId = d.userId;
    const dataKey = await keyStore.getKey(`user#${userId}`);
    if (!dataKey) return; // shredded member — nothing to grow

    const fields = ['again', 'noShowReason', 'outcomeTexture', 'people',
      'surprise', 'reflection', 'deltas'];
    const clear = decryptPii(d, fields.filter((f) => d[f] !== undefined), dataKey);
    const asOf = event.simulatedTime;
    const source = { eventId: d.eventId, sourceEventId: event.eventId, asOf };

    // People step → affinity edges (met + positive-only see-again).
    for (const p of clear.people ?? []) {
      await applyDelta(userId, `affinity#${p.userId}`, dataKey, event.eventId, asOf, (current) => {
        const payload = current ?? { otherUserId: p.userId, met: 0, seeAgain: 0, sources: [] };
        payload.met += 1;
        if (p.seeAgain) payload.seeAgain += 1;
        payload.sources = [...payload.sources, { ...source, seeAgain: p.seeAgain === true }].slice(-10);
        return payload;
      });
    }

    // No-show reason → situational barrier (observed).
    if (clear.attended === false || d.attended === false) {
      if (clear.noShowReason) {
        await applyDelta(userId, `barrier#${modelSlug(clear.noShowReason)}`, dataKey, event.eventId, asOf, (current) => {
          const payload = current ?? { what: clear.noShowReason, provenance: 'observed', observations: [] };
          payload.provenance = 'observed';
          payload.observations = [...(payload.observations ?? []), source].slice(-10);
          return payload;
        });
      }
      return;
    }

    const deltas = clear.deltas;
    if (!deltas) return;
    await applyExtractedDeltas(userId, dataKey, deltas, source, asOf, event.eventId);
  }

  // Shared by debrief and reflection — both produce the same observed
  // delta shapes (docs/debrief-prompt.md schema).
  async function applyExtractedDeltas(userId, dataKey, deltas, source, asOf, eventId) {
    // Envelope updates → profile#core, observed evidence appended per
    // dimension; observed outranks the seeded stated/inferred annotation.
    if (deltas.envelopeUpdates?.length) {
      await applyDelta(userId, 'profile#core', dataKey, eventId, asOf, (current) => {
        const payload = current ?? { envelope: {}, doors: [], constraints: {}, growthEdges: [], provisional: true };
        for (const u of deltas.envelopeUpdates) {
          const dim = { ...(payload.envelope[u.dimension] ?? {}) };
          dim.observations = [...(dim.observations ?? []), {
            observation: u.observation,
            ...(u.condition ? { condition: u.condition } : {}),
            direction: u.direction,
            confidence: u.confidence,
            ...source,
          }].slice(-5);
          dim.provenance = 'observed';
          payload.envelope[u.dimension] = dim;
        }
        return payload;
      });
    }

    for (const u of deltas.interestUpdates ?? []) {
      await applyDelta(userId, `interest#${modelSlug(u.tag)}`, dataKey, eventId, asOf, (current) => {
        const payload = current ?? { tag: u.tag, weight: 0.6, provenance: 'observed', confidence: u.confidence };
        if (u.direction === 'strengthen') payload.weight = Math.min(1, (payload.weight ?? 0.5) + 0.1);
        if (u.direction === 'weaken') payload.weight = Math.max(0, (payload.weight ?? 0.5) - 0.1);
        payload.provenance = 'observed';
        payload.observations = [...(payload.observations ?? []), { observation: u.observation, ...source }].slice(-10);
        return payload;
      });
    }

    for (const u of deltas.barrierUpdates ?? []) {
      await applyDelta(userId, `barrier#${modelSlug(u.what)}`, dataKey, eventId, asOf, (current) => {
        const payload = current ?? { what: u.what, provenance: 'observed', observations: [] };
        if (u.direction === 'easing') payload.easing = true;
        payload.provenance = 'observed';
        payload.observations = [...(payload.observations ?? []), { observation: u.observation, ...source }].slice(-10);
        return payload;
      });
    }
    // forecastError: storage waits for outcome#{eventType} (Group 3 —
    // event-type register); the frozen delta stays on the log for replay.
  }

  // Read → apply → conditional write on version, with lastEventId
  // idempotency (a redelivered stream record is a no-op) and one retry on
  // a concurrent-writer conflict.
  async function applyDelta(userId, sk, dataKey, eventId, asOf, applyFn, attempt = 0) {
    const existing = await client.send(new GetCommand({
      TableName: userModelTable,
      Key: { userId, sk },
    }));
    const item = existing.Item;
    if (item?.lastEventId === eventId) return; // already applied

    const currentPayload = item?.model ? decryptValue(item.model, dataKey) : null;
    const nextPayload = applyFn(currentPayload);
    const version = (item?.version ?? 0) + 1;

    try {
      await client.send(new PutCommand({
        TableName: userModelTable,
        Item: {
          userId,
          sk,
          model: encryptValue(nextPayload, dataKey),
          version,
          lastEventId: eventId,
          asOf: item?.asOf ?? asOf, // seed time survives; per-delta recency lives in the payload sources
        },
        ConditionExpression: item
          ? '#v = :expected'
          : 'attribute_not_exists(userId)',
        ...(item ? {
          ExpressionAttributeNames: { '#v': 'version' },
          ExpressionAttributeValues: { ':expected': item.version },
        } : {}),
      }));
    } catch (err) {
      if (err?.name === 'ConditionalCheckFailedException' && attempt < 2) {
        return applyDelta(userId, sk, dataKey, eventId, asOf, applyFn, attempt + 1);
      }
      throw err;
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
