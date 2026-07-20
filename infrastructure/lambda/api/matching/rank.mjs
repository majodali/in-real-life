// Ranking mechanics v1 — pure functions (docs/matching-spec.md).
//
// score = fit + capped affinity nudge + deterministic exploration noise,
// then the ranked list is blended with a guaranteed exploratory share.
// All noise is a hash of (userId | eventId | specVersion | weekBucket):
// replayable and testable, varies per member/event, reshuffles weekly.
// No wall-clock randomness anywhere — the caller passes simulated now.

import { createHash } from 'node:crypto';
import { eventFit } from './fit.mjs';
import { RANKING_SPEC_VERSION } from './tunables.mjs';

export function hash01(...parts) {
  const digest = createHash('sha256').update(parts.join('|')).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

export function weekBucket(nowIso) {
  return Math.floor(Date.parse(nowIso) / (7 * 24 * 60 * 60 * 1000));
}

// Generosity now lives with the rest of the edge-strength math (D47);
// re-exported so existing consumers keep one import site.
export { generosityWeight } from './affinity.mjs';

// Fill every period-th slot from the noise ordering instead of the score
// ordering — the guaranteed exploratory share. Both inputs are arrays of
// eventIds; output is a permutation of byScore.
export function blendExploration(byScore, byExplore, share) {
  if (share <= 0 || byScore.length === 0) return [...byScore];
  const period = Math.max(2, Math.round(1 / share));
  const placed = new Set();
  const out = [];
  let si = 0;
  let xi = 0;
  const next = (list, from) => {
    let i = from;
    while (i < list.length && placed.has(list[i])) i += 1;
    return i;
  };
  for (let slot = 1; out.length < byScore.length; slot += 1) {
    const explore = slot % period === 0;
    let src = explore ? byExplore : byScore;
    let i = next(src, explore ? xi : si);
    if (i >= src.length) {
      src = explore ? byScore : byExplore;
      i = next(src, 0);
      if (i >= src.length) break;
    } else if (explore) {
      xi = i + 1;
    } else {
      si = i + 1;
    }
    placed.add(src[i]);
    out.push(src[i]);
  }
  return out;
}

// candidates: feasible events (already hard-constraint filtered).
// model: { interests, doors } — the member-side fit inputs.
// affinityNudges: Map eventId → soft-nudge NET for that event
// (recommend.mjs: capped affinity strength + capped crew bonus − capped
// avoidance de-weight, spec v7); the positive ceiling (affinityNudgeCap
// + crewNudgeCap) is re-applied here so no accumulation can outgrow it —
// negative nets pass through untouched (a de-weight is soft ordering
// pressure, bounded by its own cap upstream, never a gate).
// Returns an ordered array of eventIds. Deterministic for fixed inputs.
// fitBoosts: Map eventId → presence-dependent FIT additions (known-face
// comfort, spec v5) — applied inside fitCap, since they are fit, not nudge.
export function rankCandidates({
  userId, candidates, model, affinityNudges, fitBoosts, nowIso, tunables,
}) {
  const bucket = weekBucket(nowIso);
  const scored = candidates.map((event) => {
    const fit = Math.min(
      tunables.fitCap,
      eventFit(model ?? {}, event, tunables) + (fitBoosts?.get(event.eventId) ?? 0),
    );
    const nudge = Math.min(
      tunables.affinityNudgeCap + (tunables.crewNudgeCap ?? 0),
      affinityNudges?.get(event.eventId) ?? 0,
    );
    const noise = hash01(userId, event.eventId, RANKING_SPEC_VERSION, bucket);
    return {
      eventId: event.eventId,
      startTime: event.startTime ?? '',
      score: fit + nudge + tunables.explorationNoise * noise,
      noise,
    };
  });

  const byScore = [...scored].sort((a, b) => (
    b.score - a.score
    || (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0)
    || (a.eventId < b.eventId ? -1 : 1)
  )).map((s) => s.eventId);

  const byExplore = [...scored].sort((a, b) => (
    b.noise - a.noise || (a.eventId < b.eventId ? -1 : 1)
  )).map((s) => s.eventId);

  return blendExploration(byScore, byExplore, tunables.explorationShare);
}
