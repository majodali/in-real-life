// The recommender — orchestration for feed ranking v1
// (docs/matching-spec.md; philosophy in docs/matching.md).
//
// Given the caller's annotated feed rows, it:
//   1. filters to the feasible candidate set (hard constraints are the
//      only gate — joinable state, not full, not already committed, no
//      schedule overlap with a live confirmed commitment; protective
//      blocks apply here when they land, D50),
//   2. loads the member's interests + affinity edges from the user-model
//      store (decrypted under their key; a shredded or un-onboarded
//      member simply ranks on exploration noise alone),
//   3. counts tapped-people presence per candidate (outgoing affinity
//      only — a tap boosts the tapper's own feed, never anyone else's),
//   4. returns the ordered eventId list. No score leaves this module.
//
// Failure tolerance: the feed must never die because ranking did — the
// caller wraps recommend() and degrades to an empty recommendations list.

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { decryptValue } from '../lib/crypto-shred.mjs';
import { eventsOverlap } from '../events/overlap.mjs';
import { rankCandidates, generosityWeight } from './rank.mjs';
import { RANKING_TUNABLES } from './tunables.mjs';

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

  // Interests + affinity edges in one partition query. Missing key
  // (shredded / never onboarded) → empty model, exploration-only ranking.
  async function loadModel(userId) {
    const dataKey = await keyStore.getKey(`user#${userId}`);
    if (!dataKey) return { interests: [], affinities: [] };
    const rows = await queryAll({
      TableName: userModelTable,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    });
    const interests = [];
    const affinities = [];
    for (const row of rows) {
      if (!row.model || typeof row.sk !== 'string') continue;
      if (row.sk.startsWith('interest#')) {
        interests.push(decryptValue(row.model, dataKey));
      } else if (row.sk.startsWith('affinity#')) {
        affinities.push(decryptValue(row.model, dataKey));
      }
    }
    return { interests, affinities };
  }

  // For each positively-tapped person (strongest edges first, bounded),
  // find which candidate events they're interested/confirmed on.
  async function affinityPresence(affinities, candidateIds) {
    const positive = affinities
      .filter((a) => (a?.seeAgain ?? 0) > 0 && a.otherUserId)
      .sort((a, b) => b.seeAgain - a.seeAgain)
      .slice(0, tunables.affinityEdgeLimit);
    const counts = new Map();
    for (const edge of positive) {
      const rows = await queryAll({
        TableName: interactionsTable,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': edge.otherUserId },
      });
      for (const row of rows) {
        if (!candidateIds.has(row.eventId)) continue;
        if (row.level !== 'interested' && row.level !== 'confirmed') continue;
        counts.set(row.eventId, (counts.get(row.eventId) ?? 0) + 1);
      }
    }
    return counts;
  }

  // events: the feed rows already annotated with effectiveState, full,
  // and myLevel (events/list.mjs). nowIso: simulated now.
  async function recommend({ userId, events, nowIso }) {
    const myCommitted = events.filter((e) => e.myLevel === 'confirmed'
      && e.effectiveState !== 'cancelled' && e.effectiveState !== 'over');
    const candidates = events.filter((e) => JOINABLE.has(e.effectiveState)
      && !e.full
      && e.myLevel !== 'confirmed'
      && !myCommitted.some((c) => eventsOverlap(e, c)));
    if (candidates.length === 0) return [];

    const { interests, affinities } = await loadModel(userId);

    const totalTaps = affinities.reduce((sum, a) => sum + (a?.seeAgain ?? 0), 0);
    const generosity = generosityWeight(totalTaps, tunables.affinityGenerosityPivot);
    const wantAffinity = tunables.affinityPerPersonNudge > 0 && generosity > 0;
    const affinityCounts = wantAffinity
      ? await affinityPresence(affinities, new Set(candidates.map((e) => e.eventId)))
      : new Map();

    return rankCandidates({
      userId, candidates, interests, affinityCounts, generosity, nowIso, tunables,
    });
  }

  return { recommend };
}
