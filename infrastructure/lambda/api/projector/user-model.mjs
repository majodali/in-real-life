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

import { createHash } from 'node:crypto';
import { GetCommand, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { decryptValue, encryptValue, decryptPii } from '../lib/crypto-shred.mjs';
import { RANKING_TUNABLES } from '../matching/tunables.mjs';
import { ENVELOPE_DIMENSIONS, isValidPosition, isValidEdge, stepToward } from '../lib/envelope.mjs';
import { isValidReach, isValidAdjustment, isValidLocalityId } from '../lib/localities.mjs';
import { isValidTimeWindow } from '../lib/time-windows.mjs';

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
      case 'UserModelCorrected':
        return applyCorrection(event);
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

  // ── Member corrections (D59, docs/profile-and-legibility.md) ──
  //
  // A correction is the member's own word about themselves. Precedence,
  // made concrete: provenance `corrected` + `correctedAt` beat every
  // piece of evidence OLDER than the correction; evidence arriving
  // after resumes normal D7 precedence. No counters, no expiry clocks —
  // the correction is simply the newest word until life says otherwise.
  async function applyCorrection(event) {
    const d = event.data;
    const userId = d.userId;
    const dataKey = await keyStore.getKey(`user#${userId}`);
    if (!dataKey) return;
    const clear = decryptPii(d, ['correction'], dataKey);
    const correction = clear.correction;
    if (!correction || typeof correction !== 'object') return;
    const asOf = event.simulatedTime;

    if (correction.type === 'envelope' && correction.dimension in ENVELOPE_DIMENSIONS) {
      await applyDelta(userId, 'profile#core', dataKey, event.eventId, asOf, (current) => {
        const payload = current ?? { envelope: {}, doors: [], constraints: {}, growthEdges: [], provisional: true };
        const dim = { ...(payload.envelope[correction.dimension] ?? {}) };
        if (correction.position !== undefined && isValidPosition(correction.dimension, correction.position)) {
          dim.position = correction.position;
        }
        if (correction.edgeToward !== undefined) {
          if (correction.edgeToward === null) delete dim.edgeToward;
          else if (isValidEdge(correction.dimension, correction.edgeToward)) {
            dim.edgeToward = correction.edgeToward;
          }
        }
        dim.positionProvenance = 'corrected';
        dim.correctedAt = asOf;
        delete dim.pendingShift;
        payload.envelope[correction.dimension] = dim;
        return payload;
      });
      return;
    }

    if (correction.type === 'interest-add' && correction.tag) {
      await applyDelta(userId, `interest#${modelSlug(correction.tag)}`, dataKey, event.eventId, asOf, (current) => {
        const payload = current ?? { tag: correction.tag, weight: 0.6, observations: [] };
        payload.provenance = 'corrected';
        payload.correctedAt = asOf;
        return payload;
      });
      return;
    }

    // D62: structured-constraint corrections — the member's word about
    // their own reach, per-locality exceptions, and rhythm. Direct sets
    // on profile#core's constraints; null clears.
    if (correction.type === 'constraint') {
      await applyDelta(userId, 'profile#core', dataKey, event.eventId, asOf, (current) => {
        const payload = current ?? { envelope: {}, doors: [], constraints: {}, growthEdges: [], provisional: true };
        const constraints = { ...(payload.constraints ?? {}) };
        if (correction.travelReach === null) delete constraints.travelReach;
        else if (isValidReach(correction.travelReach)) {
          constraints.travelReach = correction.travelReach;
        }
        if (isValidLocalityId(correction.localityId)) {
          const adjustments = { ...(constraints.localityAdjustments ?? {}) };
          if (correction.feels === null) delete adjustments[correction.localityId];
          else if (isValidAdjustment(correction.feels)) {
            adjustments[correction.localityId] = correction.feels;
          }
          if (Object.keys(adjustments).length > 0) constraints.localityAdjustments = adjustments;
          else delete constraints.localityAdjustments;
        }
        if (isValidTimeWindow(correction.addTimeWindow)) {
          const windows = new Set(constraints.timeWindows ?? []);
          windows.add(correction.addTimeWindow);
          constraints.timeWindows = [...windows];
        }
        if (correction.removeTimeWindow !== undefined) {
          constraints.timeWindows = (constraints.timeWindows ?? [])
            .filter((w) => w !== correction.removeTimeWindow);
          if (constraints.timeWindows.length === 0) delete constraints.timeWindows;
        }
        constraints.correctedAt = asOf;
        payload.constraints = constraints;
        return payload;
      });
      return;
    }

    if ((correction.type === 'interest-remove' && correction.tag)
      || (correction.type === 'barrier-remove' && correction.what)) {
      const sk = correction.type === 'interest-remove'
        ? `interest#${modelSlug(correction.tag)}`
        : `barrier#${modelSlug(correction.what)}`;
      // Removal is a genuine delete — the event on the log is the record
      // (replay re-deletes); deleting an absent row is a no-op.
      await client.send(new DeleteCommand({
        TableName: userModelTable,
        Key: { userId, sk },
      }));
    }
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
      'surprise', 'reflection', 'followUp', 'deltas'];
    const clear = decryptPii(d, fields.filter((f) => d[f] !== undefined), dataKey);
    const asOf = event.simulatedTime;
    const source = { eventId: d.eventId, sourceEventId: event.eventId, asOf };
    const attended = !(clear.attended === false || d.attended === false);

    // Activity counter FIRST (spec v6, docs/evidence-decay.md): every
    // attended debrief increments the lived-events count on
    // stats#affinity — the axis all evidence decay runs on — plus the
    // running tap totals (the D47/H2 generosity input). The ordering is
    // deliberate: on a redelivered record this delta skips via
    // lastEventId but still returns the already-incremented payload, so
    // the edge snapshots below stamp the same value either way
    // (replay-exact). A no-show is not a lived event — no increment.
    let activityNow;
    if (attended) {
      const stats = await applyDelta(userId, 'stats#affinity', dataKey, event.eventId, asOf, (current) => {
        const payload = current ?? { debriefedEvents: 0, peopleMet: 0, tapsGiven: 0 };
        payload.debriefedEvents = (payload.debriefedEvents ?? 0) + 1;
        payload.peopleMet = (payload.peopleMet ?? 0) + (clear.people ?? []).length;
        payload.tapsGiven = (payload.tapsGiven ?? 0)
          + (clear.people ?? []).filter((p) => p.seeAgain === true).length;
        return payload;
      });
      activityNow = stats?.debriefedEvents;
    }

    // People step → affinity edges (met + positive-only see-again), each
    // stamped with the owner's activity snapshot at this evidence — the
    // decay anchors (activityAtLastMet / activityAtLastTap).
    //
    // Avoidance (D49/D61) rides the same edge: `avoid` is the member's
    // newest word about the pair — a later positive tap clears it, a
    // later avoidance replaces any tap's effect (D7: the newest grounded
    // word wins; consumption zeroes the pair while `avoid` is set).
    for (const p of clear.people ?? []) {
      await applyDelta(userId, `affinity#${p.userId}`, dataKey, event.eventId, asOf, (current) => {
        const payload = current ?? { otherUserId: p.userId, met: 0, seeAgain: 0, sources: [] };
        payload.met += 1;
        if (activityNow !== undefined) payload.activityAtLastMet = activityNow;
        if (p.seeAgain) {
          payload.seeAgain += 1;
          if (activityNow !== undefined) payload.activityAtLastTap = activityNow;
          delete payload.avoid;
          delete payload.avoidedAt;
        } else if (p.avoid === 'didnt-click' || p.avoid === 'do-not-interact') {
          payload.avoid = p.avoid;
          payload.avoidedAt = asOf;
        }
        payload.sources = [...payload.sources, {
          ...source,
          seeAgain: p.seeAgain === true,
          ...(p.avoid ? { avoid: p.avoid } : {}),
        }].slice(-10);
        return payload;
      });
    }

    // Crew detection (D47): a fresh positive tap can complete a triad
    // whose three pairs are all mutual-strong.
    const tappedNow = (clear.people ?? [])
      .filter((p) => p.seeAgain === true)
      .map((p) => p.userId);
    if (tappedNow.length > 0) {
      await detectCrews(userId, dataKey, tappedNow, asOf, event.eventId);
    }

    // Outcome row (D63): the member's history with this KIND of event.
    // ONE write per debrief (lastEventId idempotency forbids two calls
    // to the same sk for one event): lastAgain — the flagship
    // again-intent input, the member's newest word (D7, no clocks) —
    // plus tallies, the attribution context (§4 of the design note:
    // what the yes was about stays measurable), and the Tier-2
    // eventTypeOutcome / forecastError extractions when present.
    if (attended && typeof d.eventTypeId === 'string' && clear.again) {
      const typeDeltas = clear.deltas ?? {};
      await applyDelta(userId, `outcome#${d.eventTypeId}`, dataKey, event.eventId, asOf, (current) => {
        const payload = current ?? {
          eventTypeId: d.eventTypeId,
          attended: 0,
          again: { yes: 0, maybe: 0, no: 0 },
        };
        payload.attended += 1;
        if (payload.again[clear.again] !== undefined) payload.again[clear.again] += 1;
        payload.lastAgain = clear.again;
        payload.lastAgainAt = asOf;
        payload.lastContext = {
          peopleTapped: (clear.people ?? []).some((p) => p.seeAgain === true),
          ...(clear.outcomeTexture?.length ? { texture: clear.outcomeTexture } : {}),
        };
        if (typeDeltas.eventTypeOutcome) {
          payload.energized = payload.energized ?? { yes: 0, no: 0 };
          payload.energized[typeDeltas.eventTypeOutcome.energized ? 'yes' : 'no'] += 1;
          if (typeDeltas.eventTypeOutcome.condition) {
            payload.lastEnergizedCondition = typeDeltas.eventTypeOutcome.condition;
          }
        }
        if (typeDeltas.forecastError) {
          payload.forecastErrors = [
            ...(payload.forecastErrors ?? []),
            { ...typeDeltas.forecastError, ...source },
          ].slice(-5);
        }
        return payload;
      });
    }

    // No-show reason → situational barrier (observed).
    if (!attended) {
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
          // D58 position shift: a position moves one step only when
          // shifts REPEAT in the same direction — never on one story.
          // Correction precedence (D59): evidence older than the
          // member's correction is spent; only later evidence moves it.
          if (u.shiftToward !== undefined
            && isValidPosition(u.dimension, u.shiftToward)
            && !(dim.correctedAt && asOf <= dim.correctedAt)) {
            if (dim.pendingShift === u.shiftToward) {
              dim.position = dim.position !== undefined
                ? stepToward(u.dimension, dim.position, u.shiftToward)
                : u.shiftToward;
              dim.positionProvenance = 'observed';
              delete dim.pendingShift;
            } else {
              dim.pendingShift = u.shiftToward;
            }
          }
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

  // ── Crew detection (D47, docs/matching-spec.md → Crews) ──
  //
  // A crew is a triad whose three pairs are all MUTUAL-STRONG: both
  // directions tapped positive AND reciprocal met counts at the pivot —
  // weighted co-attendance, never tap counts or boolean mutuals. Detected
  // incrementally when a debrief lands a positive tap; each re-detection
  // re-affirms (continuity signal, decayed by consumers). Crew rows are
  // written to EVERY member's partition, each encrypted under that
  // member's own key — a shredded member simply stops carrying the crew.
  //
  // Deliberate v1 bounds, named in the spec: triads only (size-4 via
  // merge is future work); detection cost is O(strong partners) reverse
  // reads per tapped debrief — fine at community scale; the chance-rate
  // co-attendance baseline is shared H4 tuning work.

  function crewIdOf(members) {
    return createHash('sha256').update([...members].sort().join('|')).digest('hex').slice(0, 16);
  }

  // Avoidance in EITHER direction disqualifies the pair (D49: a boost
  // must never fight a de-weight — a crew is the strongest boost there is).
  function mutualStrong(edgeAtoB, edgeBtoA) {
    return (edgeAtoB?.seeAgain ?? 0) > 0
      && (edgeBtoA?.seeAgain ?? 0) > 0
      && !edgeAtoB?.avoid
      && !edgeBtoA?.avoid
      && Math.min(edgeAtoB?.met ?? 0, edgeBtoA?.met ?? 0) >= RANKING_TUNABLES.crewMutualMetPivot;
  }

  // One decrypted facet of a member's own partition; null for missing
  // rows (the caller supplies the owner's key).
  async function readOwnFacet(ownerId, sk, ownerKey) {
    const out = await client.send(new GetCommand({
      TableName: userModelTable,
      Key: { userId: ownerId, sk },
    }));
    if (!out.Item?.model) return null;
    return decryptValue(out.Item.model, ownerKey);
  }

  // One member's decrypted edge toward another; null for missing rows or
  // shredded owners.
  function readEdgeOf(ownerId, otherId, ownerKey) {
    return readOwnFacet(ownerId, `affinity#${otherId}`, ownerKey);
  }

  async function detectCrews(userId, myKey, tappedNow, asOf, eventId) {
    // My strong mutual partners: outgoing positive edges whose reverse
    // side is also strong.
    const rows = [];
    let lastKey;
    do {
      const page = await client.send(new QueryCommand({
        TableName: userModelTable,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }));
      rows.push(...(page.Items ?? []));
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    const partners = new Map(); // otherId → { key }
    for (const row of rows) {
      if (typeof row.sk !== 'string' || !row.sk.startsWith('affinity#') || !row.model) continue;
      const otherId = row.sk.slice('affinity#'.length);
      const myEdge = decryptValue(row.model, myKey);
      if ((myEdge?.seeAgain ?? 0) === 0) continue;
      const theirKey = await keyStore.getKey(`user#${otherId}`);
      if (!theirKey) continue;
      const reverse = await readEdgeOf(otherId, userId, theirKey);
      if (mutualStrong(myEdge, reverse)) partners.set(otherId, { key: theirKey });
    }

    for (const p of tappedNow) {
      if (!partners.has(p)) continue;
      for (const [q, { key: qKey }] of partners) {
        if (q === p) continue;
        const pToQ = await readEdgeOf(p, q, partners.get(p).key);
        const qToP = await readEdgeOf(q, p, qKey);
        if (!mutualStrong(pToQ, qToP)) continue;
        await affirmCrew({
          members: [userId, p, q],
          keys: { [userId]: myKey, [p]: partners.get(p).key, [q]: qKey },
          asOf,
          eventId,
        });
      }
    }
  }

  // Write/re-affirm the crew on every member's partition. lastEventId
  // idempotency also dedupes the symmetric double-detection when one
  // debrief taps two crew-mates (same crewId, same event → no-op).
  // Each member's copy stamps THAT member's own lived-events counter at
  // affirmation (spec v6): the crew fades — toward its floor, never
  // below — at the pace of each member's own lived experience.
  async function affirmCrew({ members, keys, asOf, eventId }) {
    const crewId = crewIdOf(members);
    const sorted = [...members].sort();
    for (const member of members) {
      const stats = await readOwnFacet(member, 'stats#affinity', keys[member]);
      const activityAtAffirmation = stats?.debriefedEvents ?? 0;
      await applyDelta(member, `crew#${crewId}`, keys[member], eventId, asOf, (current) => ({
        crewId,
        members: sorted,
        formedAt: current?.formedAt ?? asOf,
        lastAffirmedAt: asOf,
        affirmations: (current?.affirmations ?? 0) + 1,
        activityAtAffirmation,
      }));
    }
  }

  // Read → apply → conditional write on version, with lastEventId
  // idempotency (a redelivered stream record is a no-op) and one retry on
  // a concurrent-writer conflict. Returns the item's resulting payload —
  // on an idempotent skip that's the already-applied state, so callers
  // that chain deltas (the activity counter → edge snapshots) read the
  // same value on first delivery and on redelivery (replay-exact).
  async function applyDelta(userId, sk, dataKey, eventId, asOf, applyFn, attempt = 0) {
    const existing = await client.send(new GetCommand({
      TableName: userModelTable,
      Key: { userId, sk },
    }));
    const item = existing.Item;
    const currentPayload = item?.model ? decryptValue(item.model, dataKey) : null;
    if (item?.lastEventId === eventId) return currentPayload; // already applied

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
    return nextPayload;
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

  // D62: same restraint for structured constraints — an unrecognised
  // reach or adjustment is dropped, never guessed at. Free-text fields
  // (maxTravel, accessibility, legacy window phrasings) pass through
  // untouched: they're the story, not the structure.
  function sanitizeConstraints(constraints) {
    const clean = { ...(constraints ?? {}) };
    if (clean.travelReach !== undefined && !isValidReach(clean.travelReach)) {
      delete clean.travelReach;
    }
    if (clean.localityAdjustments !== undefined) {
      const adjustments = {};
      for (const [localityId, feels] of Object.entries(clean.localityAdjustments ?? {})) {
        if (isValidLocalityId(localityId) && isValidAdjustment(feels)) {
          adjustments[localityId] = feels;
        }
      }
      if (Object.keys(adjustments).length > 0) clean.localityAdjustments = adjustments;
      else delete clean.localityAdjustments;
    }
    return clean;
  }

  // D58: keep a dim's position/edgeToward only when the vocabulary
  // recognises them — the schema carries strings by convention and the
  // projector is the validator (restraint over coverage: an invalid
  // placement is dropped, never guessed at).
  function sanitizeEnvelope(envelope) {
    const out = {};
    for (const [dimension, dim] of Object.entries(envelope ?? {})) {
      const clean = { ...dim };
      if (clean.position !== undefined && !isValidPosition(dimension, clean.position)) {
        delete clean.position;
      }
      if (clean.edgeToward !== undefined && !isValidEdge(dimension, clean.edgeToward)) {
        delete clean.edgeToward;
      }
      out[dimension] = clean;
    }
    return out;
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
        envelope: sanitizeEnvelope(extraction.envelope),
        doors: extraction.doors ?? [],
        constraints: sanitizeConstraints(extraction.constraints),
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
