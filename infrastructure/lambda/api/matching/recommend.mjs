// The recommender — orchestration for feed ranking
// (docs/matching-spec.md; philosophy in docs/matching.md).
//
// Given the caller's annotated feed rows, it:
//   1. filters to the feasible candidate set (hard constraints are the
//      only gate — joinable state, not full, not already committed, no
//      schedule overlap with a live confirmed commitment; protective
//      blocks apply here when they land, D50),
//   2. loads the member's interests + doors + affinity edges + tap stats
//      from the user-model store (decrypted under their key; a shredded
//      or un-onboarded member simply ranks on exploration noise alone),
//   3. for each positively-tapped person present on a candidate event,
//      computes D47 edge STRENGTH (affinity.mjs): one-sided tap at the
//      member's own generosity weight, mutual amplification gated by the
//      weaker side (reverse edge read pointwise — the typed sort key
//      affinity#<otherUserId> makes this a GetItem; no GSI needed until
//      crew detection asks set-level questions), reciprocal-met
//      confirmation. Decay is evidence-based (spec v6): both sides'
//      lived-events counters ride on the same stats#affinity items
//      already read for generosity. All of it backstage: reverse edges
//      and stats are decrypted server-side and never leave this module,
//   4. returns the ordered eventId list. No score leaves this module.
//
// Failure tolerance: the feed must never die because ranking did — the
// caller wraps recommend() and degrades to an empty recommendations list.

import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { decryptValue } from '../lib/crypto-shred.mjs';
import { eventsOverlap } from '../events/overlap.mjs';
import { rankCandidates } from './rank.mjs';
import { generosityWeight, edgeStrength, crewNudge } from './affinity.mjs';
import { RANKING_TUNABLES } from './tunables.mjs';
import { COMMUNITY, effectiveBand, bandsBeyondReach } from '../lib/localities.mjs';

const JOINABLE = new Set(['idea', 'proposed', 'planned']);

export function createRecommender({
  client, userModelTable, interactionsTable, keyStore, tunables = RANKING_TUNABLES,
}) {
  async function queryAll(input) {
    const items = [];
    let lastKey;
    do {
      const out = await client.send(new QueryCommand({
        ...input,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }));
      items.push(...(out.Items ?? []));
      lastKey = out.LastEvaluatedKey;
    } while (lastKey);
    return items;
  }

  // Interests + doors + affinity edges + tap stats in one partition
  // query. Missing key (shredded / never onboarded) → empty model,
  // exploration-only ranking.
  async function loadModel(userId) {
    const dataKey = await keyStore.getKey(`user#${userId}`);
    if (!dataKey) {
      return {
        interests: [], doors: [], envelope: {}, constraints: {}, outcomes: {}, affinities: [], crews: [], stats: null,
      };
    }
    const rows = await queryAll({
      TableName: userModelTable,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    });
    const interests = [];
    const affinities = [];
    const crews = [];
    const outcomes = {};
    let doors = [];
    let envelope = {};
    let constraints = {};
    let stats = null;
    for (const row of rows) {
      if (!row.model || typeof row.sk !== 'string') continue;
      if (row.sk.startsWith('interest#')) {
        interests.push(decryptValue(row.model, dataKey));
      } else if (row.sk.startsWith('affinity#')) {
        affinities.push(decryptValue(row.model, dataKey));
      } else if (row.sk.startsWith('crew#')) {
        crews.push(decryptValue(row.model, dataKey));
      } else if (row.sk.startsWith('outcome#')) {
        outcomes[row.sk.slice('outcome#'.length)] = decryptValue(row.model, dataKey);
      } else if (row.sk === 'profile#core') {
        const core = decryptValue(row.model, dataKey);
        doors = core?.doors ?? [];
        envelope = core?.envelope ?? {};
        constraints = core?.constraints ?? {};
      } else if (row.sk === 'stats#affinity') {
        stats = decryptValue(row.model, dataKey);
      }
    }
    return { interests, doors, envelope, constraints, outcomes, affinities, crews, stats };
  }

  // Read one decrypted facet of ANOTHER member's model — backstage only.
  // Null for shredded members, missing rows, or missing keys.
  async function readFacetOf(otherUserId, sk) {
    const key = await keyStore.getKey(`user#${otherUserId}`);
    if (!key) return null;
    const out = await client.send(new GetCommand({
      TableName: userModelTable,
      Key: { userId: otherUserId, sk },
    }));
    if (!out.Item?.model) return null;
    return decryptValue(out.Item.model, key);
  }

  // For each positively-tapped person (strongest edges first, bounded)
  // plus every crew-mate, find which candidate events they're
  // interested/confirmed on. Crew-mates are by construction tapped, but
  // the edge limit could truncate them — the union keeps a gathering
  // visible regardless. Avoided people (D49) are excluded from the
  // positive set outright and instead watched for the de-weight — the
  // namer's feed gently steers away from rooms they're already in.
  async function affinityPresence(affinities, crews, userId, candidateIds, avoided) {
    const positive = affinities
      .filter((a) => (a?.seeAgain ?? 0) > 0 && a.otherUserId && !a.avoid)
      .sort((a, b) => b.seeAgain - a.seeAgain)
      .slice(0, tunables.affinityEdgeLimit);
    const edgeById = new Map(positive.map((a) => [a.otherUserId, a]));
    const watchIds = new Set(edgeById.keys());
    for (const crew of crews) {
      for (const m of crew.members ?? []) {
        if (m !== userId) watchIds.add(m);
      }
    }
    for (const otherUserId of avoided?.keys() ?? []) watchIds.add(otherUserId);
    const presentByEvent = new Map();
    const presentPeople = new Map(); // otherUserId → my edge (if within limit)
    for (const otherUserId of watchIds) {
      const rows = await queryAll({
        TableName: interactionsTable,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': otherUserId },
      });
      for (const row of rows) {
        if (!candidateIds.has(row.eventId)) continue;
        if (row.level !== 'interested' && row.level !== 'confirmed') continue;
        if (!presentByEvent.has(row.eventId)) presentByEvent.set(row.eventId, []);
        presentByEvent.get(row.eventId).push(otherUserId);
        const edge = edgeById.get(otherUserId);
        if (edge) presentPeople.set(otherUserId, edge);
      }
    }
    return { presentByEvent, presentPeople };
  }

  // events: the feed rows already annotated with effectiveState, full,
  // and myLevel (events/list.mjs). nowIso: simulated now.
  // homeLocalityId: the caller's verified locality (list.mjs resolves it
  // from the user row; absent → community home).
  async function recommend({ userId, events, nowIso, homeLocalityId }) {
    const myCommitted = events.filter((e) => e.myLevel === 'confirmed'
      && e.effectiveState !== 'cancelled' && e.effectiveState !== 'over');
    const candidates = events.filter((e) => JOINABLE.has(e.effectiveState)
      && !e.full
      && e.myLevel !== 'confirmed'
      && !myCommitted.some((c) => eventsOverlap(e, c)));
    if (candidates.length === 0) return [];

    const {
      interests, doors, envelope, constraints, outcomes, affinities, crews, stats,
    } = await loadModel(userId);

    // Known-face comfort (spec v5) needs presence too: for a
    // needs-known-face member, a familiar face is a FIT input.
    const needsKnownFace = envelope?.familiarity?.position === 'needs-known-face'
      && tunables.fitKnownFaceWeight > 0;

    // Named avoidance (D49): pair-level, comfort-tier, the member's own
    // edges only. Watched for the de-weight when the penalties are on.
    const avoided = new Map(affinities
      .filter((a) => a?.avoid && a.otherUserId)
      .map((a) => [a.otherUserId, a.avoid]));
    const avoidanceOn = avoided.size > 0
      && (tunables.avoidancePenalty > 0 || tunables.didntClickPenalty > 0);

    const affinityOn = tunables.affinityPerPersonNudge > 0
      || tunables.affinityMutualBonus > 0
      || tunables.affinityConfirmedBonus > 0
      || (tunables.crewBonus > 0 && crews.length > 0)
      || needsKnownFace
      || avoidanceOn;

    const affinityNudges = new Map();
    const fitBoosts = new Map();
    if (affinityOn) {
      // Own generosity from the projector-maintained stats item; fall
      // back to summing own edges when stats haven't landed (replay gap).
      const myTaps = stats?.tapsGiven
        ?? affinities.reduce((sum, a) => sum + (a?.seeAgain ?? 0), 0);
      const myWeight = generosityWeight(myTaps, tunables.affinityGenerosityPivot);
      // The evidence-decay axis (spec v6): my lived-events counter.
      // Missing stats → undefined → activityDelta treats every anchor as
      // fresh (no decay without grounded evidence).
      const myActivity = stats?.debriefedEvents;

      const { presentByEvent, presentPeople } = await affinityPresence(
        affinities, crews, userId, new Set(candidates.map((e) => e.eventId)),
        avoidanceOn ? avoided : null,
      );

      // Per-person strength once, then summed per event; rank applies
      // the cap so accumulation can never outgrow it.
      const strengthByPerson = new Map();
      for (const [otherUserId, myEdge] of presentPeople) {
        const [reverseEdge, theirStats] = await Promise.all([
          readFacetOf(otherUserId, `affinity#${userId}`),
          readFacetOf(otherUserId, 'stats#affinity'),
        ]);
        // Missing stats → weight 1 (a replay/backfill gap, not evidence
        // of selectivity); a real spammer always has stats.
        const theirWeight = generosityWeight(
          theirStats?.tapsGiven ?? 0, tunables.affinityGenerosityPivot,
        );
        strengthByPerson.set(otherUserId, edgeStrength({
          myEdge,
          reverseEdge,
          myWeight,
          theirWeight,
          myActivity,
          theirActivity: theirStats?.debriefedEvents,
          tunables,
        }));
      }
      // Per-event nudge = capped affinity strength + capped crew-gathering
      // bonus − capped avoidance de-weight; the positive ceiling
      // (affinityNudgeCap + crewNudgeCap) is applied in rank.mjs and
      // stays below fitCap by invariant. Avoided people never count as
      // fellows, known faces, or strength — only toward the de-weight.
      for (const [eventId, people] of presentByEvent) {
        const friendly = people.filter((p) => !avoided.has(p));
        const affinity = Math.min(
          tunables.affinityNudgeCap,
          friendly.reduce((sum, p) => sum + (strengthByPerson.get(p) ?? 0), 0),
        );
        const crew = crewNudge({
          crews, userId, presentPeople: friendly, myActivity, tunables,
        });
        const deweight = Math.min(
          tunables.avoidanceDeweightCap,
          people.reduce((sum, p) => {
            const tier = avoided.get(p);
            if (tier === 'do-not-interact') return sum + tunables.avoidancePenalty;
            if (tier === 'didnt-click') return sum + tunables.didntClickPenalty;
            return sum;
          }, 0),
        );
        affinityNudges.set(eventId, affinity + crew - deweight);
        // A known face = someone this member positively tapped, present.
        if (needsKnownFace && friendly.some((p) => presentPeople.has(p))) {
          fitBoosts.set(eventId, tunables.fitKnownFaceWeight);
        }
      }
    }

    // Travel de-weight (D62, spec v8) — prioritization, never filtering:
    // events beyond the member's stated reach (over their own effective
    // bands, adjustments included) sink by band of excess, capped. The
    // exploratory share ignores this entirely; nothing leaves the list.
    if (constraints.travelReach !== undefined && tunables.travelPenaltyPerBand > 0) {
      const home = homeLocalityId ?? COMMUNITY.homeLocalityId;
      for (const candidate of candidates) {
        const band = effectiveBand(
          home,
          candidate.localityId ?? COMMUNITY.homeLocalityId,
          constraints.localityAdjustments,
        );
        const excess = bandsBeyondReach(band, constraints.travelReach);
        if (excess > 0) {
          const penalty = Math.min(
            tunables.travelDeweightCap,
            tunables.travelPenaltyPerBand * excess,
          );
          affinityNudges.set(
            candidate.eventId,
            (affinityNudges.get(candidate.eventId) ?? 0) - penalty,
          );
        }
      }
    }

    return rankCandidates({
      userId,
      candidates,
      model: { interests, doors, envelope, constraints, outcomes },
      affinityNudges,
      fitBoosts,
      nowIso,
      tunables,
    });
  }

  return { recommend };
}
