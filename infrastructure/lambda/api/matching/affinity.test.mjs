// Specifications for affinity edge strength v2 (D47/D60,
// docs/matching-spec.md → Affinity; decay per docs/evidence-decay.md).
// The D47 semantics ARE the spec: strength never boolean, weaker-side
// combiner, one-sided engagement caps confirmation, tunable to zero.
// The D60 semantics too: decay runs on lived events (never clock time),
// toward a floor (never zero), and silence alone never decays anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generosityWeight, activityDelta, flooredDecay, edgeStrength, crewNudge,
} from './affinity.mjs';
import { RANKING_TUNABLES } from './tunables.mjs';

const t = RANKING_TUNABLES;

const edge = ({ met = 1, seeAgain = 1, sources = [], ...anchors } = {}) => ({
  otherUserId: 'x', met, seeAgain, sources, ...anchors,
});

// Fresh evidence on both sides: anchors at the current counters.
const fresh = (over = {}) => ({
  myEdge: edge({ met: 3, activityAtLastTap: 10, activityAtLastMet: 10 }),
  reverseEdge: edge({ met: 3, activityAtLastTap: 7, activityAtLastMet: 7 }),
  myWeight: 1,
  theirWeight: 1,
  myActivity: 10,
  theirActivity: 7,
  tunables: t,
  ...over,
});

test('generosity: full weight to the pivot, then pivot/total; pivot 0 = off', () => {
  assert.equal(generosityWeight(0, 12), 1);
  assert.equal(generosityWeight(12, 12), 1);
  assert.equal(generosityWeight(48, 12), 0.25);
  assert.equal(generosityWeight(5, 0), 0);
});

test('activityDelta: lived events since the anchor; missing either side = no evidence', () => {
  assert.equal(activityDelta(10, 4), 6);
  assert.equal(activityDelta(4, 10), 0, 'never negative');
  assert.equal(activityDelta(undefined, 4), 0);
  assert.equal(activityDelta(10, undefined), 0, 'unanchored = never aged');
});

test('flooredDecay: halves toward the floor per half-life; both ends reachable', () => {
  assert.equal(flooredDecay(0, 12, 0), 1);
  assert.ok(Math.abs(flooredDecay(12, 12, 0) - 0.5) < 1e-9);
  // Floored: one half-life covers half the distance DOWN TO the floor.
  assert.ok(Math.abs(flooredDecay(36, 36, 0.5) - 0.75) < 1e-9);
  // Silence is never conclusive: the asymptote is the floor, not zero.
  assert.ok(flooredDecay(10_000, 12, 0.5) >= 0.5);
  assert.equal(flooredDecay(10_000, 12, 1), 1, 'floor 1 disables decay');
  assert.equal(flooredDecay(10_000, 0, 0), 1, 'half-life 0 disables decay');
});

test('one-sided edge: perPersonNudge × own weight, no mutual components', () => {
  const s = edgeStrength(fresh({ reverseEdge: null, myEdge: edge({ activityAtLastTap: 10 }) }));
  assert.ok(Math.abs(s - t.affinityPerPersonNudge) < 1e-9);
});

test('mutual amplification is gated by the weaker side (combiner = min)', () => {
  const selectivePair = edgeStrength(fresh());
  const spammerPair = edgeStrength(fresh({ theirWeight: 0.01 }));
  // Both get the one-sided component and confirmation; the difference is
  // the mutual bonus: full for the selective pair, ≈ 0 when the other
  // side taps everyone.
  const gap = selectivePair - spammerPair;
  assert.ok(Math.abs(gap - t.affinityMutualBonus * 0.99) < 1e-9);
});

test('one-sided engagement caps confirmation: their met 0 → no confirmed bonus', () => {
  // A follower co-present five times, but the other member never marked
  // them met: reciprocalMet = min(5, 0) = 0 — co-presence alone never
  // strengthens the edge (F13 guard).
  const withReciprocal = edgeStrength(fresh({
    myEdge: edge({ met: 5, activityAtLastTap: 10, activityAtLastMet: 10 }),
    reverseEdge: edge({ met: 5, activityAtLastMet: 7 }),
  }));
  const follower = edgeStrength(fresh({
    myEdge: edge({ met: 5, activityAtLastTap: 10, activityAtLastMet: 10 }),
    reverseEdge: edge({ met: 0 }),
  }));
  assert.ok(withReciprocal > follower);
  assert.ok(Math.abs(follower - (t.affinityPerPersonNudge + t.affinityMutualBonus)) < 1e-9);
});

test('confirmation scales to the pivot and is NOT weight-gated (observed beats inferred)', () => {
  // Two mutual spammers with real repeated reciprocal attendance: mutual
  // bonus ≈ 0 but the confirmed component pays in full.
  const s = edgeStrength(fresh({ myWeight: 0.01, theirWeight: 0.01 }));
  const expected = t.affinityPerPersonNudge * 0.01
    + t.affinityMutualBonus * 0.01
    + t.affinityConfirmedBonus; // scale = min(1, 3/3) = 1, no decay
  assert.ok(Math.abs(s - expected) < 1e-9);
});

// ─── Evidence decay (D60): activity axis, floors, no clock anywhere ───

test('tap strength halves per tap half-life of MY lived events since MY last tap', () => {
  const aged = edgeStrength(fresh({
    myEdge: edge({
      met: 3,
      activityAtLastTap: 10 - t.affinityTapHalfLifeEvents,
      activityAtLastMet: 10,
    }),
  }));
  const freshStrength = edgeStrength(fresh());
  const expected = (t.affinityPerPersonNudge + t.affinityMutualBonus) * 0.5
    + t.affinityConfirmedBonus;
  assert.ok(Math.abs(aged - expected) < 1e-9);
  assert.ok(aged < freshStrength);
});

test('confirmed divergence needs BOTH sides living without each other (min of deltas)', () => {
  // I have lived a full confirmed half-life since our last met — but my
  // friend has lived nothing (broken leg, hard season): no divergence.
  const friendQuiet = edgeStrength(fresh({
    myEdge: edge({ met: 3, activityAtLastTap: 10, activityAtLastMet: 10 }),
    myActivity: 46,
    reverseEdge: edge({ met: 3, activityAtLastMet: 7 }),
    theirActivity: 7,
  }));
  // The tap component aged (my own axis ran), but confirmed did not.
  const expected = (t.affinityPerPersonNudge + t.affinityMutualBonus)
    * flooredDecay(36, t.affinityTapHalfLifeEvents, t.affinityTapDecayFloor)
    + t.affinityConfirmedBonus;
  assert.ok(Math.abs(friendQuiet - expected) < 1e-9);

  // When BOTH sides diverge a full half-life, confirmed covers half the
  // distance to its floor.
  const bothDiverged = edgeStrength(fresh({
    myEdge: edge({ met: 3, activityAtLastTap: 10, activityAtLastMet: 10 }),
    myActivity: 10 + t.affinityConfirmedHalfLifeEvents,
    reverseEdge: edge({ met: 3, activityAtLastMet: 7 }),
    theirActivity: 7 + t.affinityConfirmedHalfLifeEvents,
  }));
  const confirmedFactor = t.affinityConfirmedDecayFloor
    + (1 - t.affinityConfirmedDecayFloor) * 0.5;
  const tapFactor = flooredDecay(36, t.affinityTapHalfLifeEvents, t.affinityTapDecayFloor);
  const expectedBoth = (t.affinityPerPersonNudge + t.affinityMutualBonus) * tapFactor
    + t.affinityConfirmedBonus * confirmedFactor;
  assert.ok(Math.abs(bothDiverged - expectedBoth) < 1e-9);
});

test('the away-and-return member keeps their graph: zero activity → zero decay', () => {
  // Anchors far in the "past" — but the member lived nothing since.
  // Under clock decay this edge would have rotted; under evidence decay
  // it is exactly as strong as the day it was made.
  const s = edgeStrength(fresh({
    myEdge: edge({ met: 3, activityAtLastTap: 4, activityAtLastMet: 4 }),
    myActivity: 4,
    reverseEdge: edge({ met: 3, activityAtLastMet: 2 }),
    theirActivity: 2,
  }));
  const full = t.affinityPerPersonNudge + t.affinityMutualBonus + t.affinityConfirmedBonus;
  assert.ok(Math.abs(s - full) < 1e-9);
});

test('confirmed strength never falls below its floor on silence alone', () => {
  const longSilence = edgeStrength(fresh({
    myEdge: edge({ met: 3, activityAtLastTap: 0, activityAtLastMet: 0 }),
    myActivity: 10_000,
    reverseEdge: edge({ met: 3, activityAtLastMet: 0 }),
    theirActivity: 10_000,
  }));
  assert.ok(longSilence >= t.affinityConfirmedBonus * t.affinityConfirmedDecayFloor);
});

test('recovery is instant and total: a fresh anchor restores full strength', () => {
  const recovered = edgeStrength(fresh({
    myEdge: edge({ met: 3, activityAtLastTap: 10_000, activityAtLastMet: 10_000 }),
    myActivity: 10_000,
    reverseEdge: edge({ met: 3, activityAtLastMet: 500 }),
    theirActivity: 500,
  }));
  const full = t.affinityPerPersonNudge + t.affinityMutualBonus + t.affinityConfirmedBonus;
  assert.ok(Math.abs(recovered - full) < 1e-9);
});

test('unanchored edges (pre-v6 or replay gap) never decay — restraint over guessing', () => {
  const s = edgeStrength({
    myEdge: edge({ met: 3 }),
    reverseEdge: edge({ met: 3 }),
    myWeight: 1,
    theirWeight: 1,
    myActivity: 10_000,
    theirActivity: 10_000,
    tunables: t,
  });
  const full = t.affinityPerPersonNudge + t.affinityMutualBonus + t.affinityConfirmedBonus;
  assert.ok(Math.abs(s - full) < 1e-9);
});

test('tunable to zero restores raw mutuals: huge pivot → all weights 1', () => {
  const raw = { ...t, affinityGenerosityPivot: Number.MAX_SAFE_INTEGER };
  const w = generosityWeight(100_000, raw.affinityGenerosityPivot);
  assert.equal(w, 1);
  const s = edgeStrength(fresh({ myWeight: w, theirWeight: w, tunables: raw }));
  assert.ok(s >= raw.affinityPerPersonNudge + raw.affinityMutualBonus);
});

// ─── Crew nudge (spec v6: own-activity axis, floored) ───

const crew = (over = {}) => ({
  crewId: 'c1', members: ['me', 'p', 'q'], lastAffirmedAt: '2026-07-15T00:00:00.000Z',
  activityAtAffirmation: 10, ...over,
});

test('crew nudge fires only when the crew gathers (≥2 fellows present)', () => {
  const gathered = crewNudge({
    crews: [crew()], userId: 'me', presentPeople: ['p', 'q'], myActivity: 10, tunables: t,
  });
  assert.ok(Math.abs(gathered - t.crewBonus) < 1e-9);

  const lone = crewNudge({
    crews: [crew()], userId: 'me', presentPeople: ['p'], myActivity: 10, tunables: t,
  });
  assert.equal(lone, 0, 'a lone crew-mate is just an affinity edge');
});

test('crew nudge decays per MY lived events since affirmation, toward its floor', () => {
  const aged = crewNudge({
    crews: [crew()], userId: 'me', presentPeople: ['p', 'q'],
    myActivity: 10 + t.crewHalfLifeEvents, tunables: t,
  });
  const factor = t.crewDecayFloor + (1 - t.crewDecayFloor) * 0.5;
  assert.ok(Math.abs(aged - t.crewBonus * factor) < 1e-9);

  const dormant = crewNudge({
    crews: [crew()], userId: 'me', presentPeople: ['p', 'q'],
    myActivity: 10_000, tunables: t,
  });
  assert.ok(dormant >= t.crewBonus * t.crewDecayFloor, 'never below the floor on silence');

  const away = crewNudge({
    crews: [crew()], userId: 'me', presentPeople: ['p', 'q'],
    myActivity: 10, tunables: t,
  });
  assert.ok(Math.abs(away - t.crewBonus) < 1e-9, 'no lived events → no decay');
});

test('crew nudge caps across crews; crewBonus zero disables it', () => {
  const many = crewNudge({
    crews: Array.from({ length: 5 }, (_, i) => crew({ crewId: `c${i}` })),
    userId: 'me', presentPeople: ['p', 'q'], myActivity: 10, tunables: t,
  });
  assert.equal(many, t.crewNudgeCap);

  const off = crewNudge({
    crews: [crew()], userId: 'me', presentPeople: ['p', 'q'], myActivity: 10,
    tunables: { ...t, crewBonus: 0 },
  });
  assert.equal(off, 0);
});

test('structural invariant: total soft nudges stay below fitCap', () => {
  assert.ok(t.affinityNudgeCap + t.crewNudgeCap < t.fitCap);
});

test('met-without-tap is captured, not used: the tunable exists, no consumption path', () => {
  assert.equal(t.metWithoutTapMultiplier, 1.0);
  // Sources carrying met-without-tap history change nothing today —
  // promoting this signal is a spec bump, not a silent code path.
  const plain = edgeStrength(fresh());
  const withHistory = edgeStrength(fresh({
    myEdge: edge({
      met: 3, activityAtLastTap: 10, activityAtLastMet: 10,
      sources: [{ asOf: '2026-07-01T00:00:00Z', seeAgain: false }],
    }),
  }));
  assert.equal(plain, withHistory);
});
