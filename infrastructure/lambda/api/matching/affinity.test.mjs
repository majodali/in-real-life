// Specifications for affinity edge strength v1 (D47/H4,
// docs/matching-spec.md → Affinity). The D47 semantics ARE the spec:
// strength never boolean, weaker-side combiner, one-sided engagement
// caps confirmation, dual half-lives, tunable to zero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generosityWeight, decayFactor, latestTapAt, latestMetAt, edgeStrength, crewNudge,
} from './affinity.mjs';
import { RANKING_TUNABLES } from './tunables.mjs';

const NOW = '2026-07-15T00:00:00.000Z';
const t = RANKING_TUNABLES;

const edge = ({ met = 1, seeAgain = 1, sources = [] } = {}) => ({
  otherUserId: 'x', met, seeAgain, sources,
});

test('generosity: full weight to the pivot, then pivot/total; pivot 0 = off', () => {
  assert.equal(generosityWeight(0, 12), 1);
  assert.equal(generosityWeight(12, 12), 1);
  assert.equal(generosityWeight(48, 12), 0.25);
  assert.equal(generosityWeight(5, 0), 0);
});

test('decayFactor halves at one half-life, 1 with no timestamp or no half-life', () => {
  const ninetyDaysAgo = '2026-04-16T00:00:00.000Z';
  assert.ok(Math.abs(decayFactor(NOW, ninetyDaysAgo, 90) - 0.5) < 1e-6);
  assert.equal(decayFactor(NOW, undefined, 90), 1);
  assert.equal(decayFactor(NOW, ninetyDaysAgo, 0), 1);
  assert.equal(decayFactor(NOW, NOW, 90), 1); // fresh = full strength
});

test('latestTapAt only counts seeAgain sources; latestMetAt counts all', () => {
  const e = edge({
    sources: [
      { asOf: '2026-01-01T00:00:00Z', seeAgain: true },
      { asOf: '2026-03-01T00:00:00Z', seeAgain: false },
    ],
  });
  assert.equal(latestTapAt(e), '2026-01-01T00:00:00Z');
  assert.equal(latestMetAt(e), '2026-03-01T00:00:00Z');
});

test('one-sided edge: perPersonNudge × own weight, no mutual components', () => {
  const s = edgeStrength({
    myEdge: edge(), reverseEdge: null, myWeight: 1, theirWeight: 1,
    nowIso: NOW, tunables: t,
  });
  assert.ok(Math.abs(s - t.affinityPerPersonNudge) < 1e-9);
});

test('mutual amplification is gated by the weaker side (combiner = min)', () => {
  const base = {
    myEdge: edge(), reverseEdge: edge(), nowIso: NOW, tunables: t,
  };
  const selectivePair = edgeStrength({ ...base, myWeight: 1, theirWeight: 1 });
  const spammerPair = edgeStrength({ ...base, myWeight: 1, theirWeight: 0.01 });

  // Both get the one-sided component and (met 1/1) some confirmation;
  // the difference is the mutual bonus: full for the selective pair,
  // ≈ 0 when the other side taps everyone.
  const gap = selectivePair - spammerPair;
  assert.ok(Math.abs(gap - t.affinityMutualBonus * 0.99) < 1e-9);
});

test('one-sided engagement caps confirmation: their met 0 → no confirmed bonus', () => {
  // A follower co-present five times, but the other member never marked
  // them met: reciprocalMet = min(5, 0) = 0 — co-presence alone never
  // strengthens the edge (F13 guard).
  const withReciprocal = edgeStrength({
    myEdge: edge({ met: 5 }), reverseEdge: edge({ met: 5 }),
    myWeight: 1, theirWeight: 1, nowIso: NOW, tunables: t,
  });
  const follower = edgeStrength({
    myEdge: edge({ met: 5 }), reverseEdge: edge({ met: 0 }),
    myWeight: 1, theirWeight: 1, nowIso: NOW, tunables: t,
  });
  assert.ok(withReciprocal > follower);
  assert.ok(Math.abs(follower - (t.affinityPerPersonNudge + t.affinityMutualBonus)) < 1e-9);
});

test('confirmation scales to the pivot and is NOT weight-gated (observed beats inferred)', () => {
  // Two mutual spammers with real repeated reciprocal attendance: mutual
  // bonus ≈ 0 but the confirmed component pays in full.
  const s = edgeStrength({
    myEdge: edge({ met: 3 }), reverseEdge: edge({ met: 3 }),
    myWeight: 0.01, theirWeight: 0.01, nowIso: NOW, tunables: t,
  });
  const expected = t.affinityPerPersonNudge * 0.01
    + t.affinityMutualBonus * 0.01
    + t.affinityConfirmedBonus; // scale = min(1, 3/3) = 1, no decay
  assert.ok(Math.abs(s - expected) < 1e-9);
});

test('tap strength decays on the short half-life, confirmed on the long one', () => {
  const oldTap = [{ asOf: '2026-04-16T00:00:00Z', seeAgain: true }]; // 90d = 1 tap half-life
  const fresh = edgeStrength({
    myEdge: edge({ met: 3, sources: [{ asOf: NOW, seeAgain: true }] }),
    reverseEdge: edge({ met: 3, sources: [{ asOf: NOW, seeAgain: true }] }),
    myWeight: 1, theirWeight: 1, nowIso: NOW, tunables: t,
  });
  const aged = edgeStrength({
    myEdge: edge({ met: 3, sources: oldTap }),
    reverseEdge: edge({ met: 3, sources: oldTap }),
    myWeight: 1, theirWeight: 1, nowIso: NOW, tunables: t,
  });
  // Tap + mutual components halved (one tap half-life); confirmed only
  // dented (90d against a 270d half-life).
  const tapAndMutualFresh = t.affinityPerPersonNudge + t.affinityMutualBonus;
  const confirmedFresh = t.affinityConfirmedBonus;
  const expectedAged = tapAndMutualFresh * 0.5 + confirmedFresh * 2 ** (-90 / 270);
  assert.ok(Math.abs(fresh - (tapAndMutualFresh + confirmedFresh)) < 1e-6);
  assert.ok(Math.abs(aged - expectedAged) < 1e-6);
});

test('tunable to zero restores raw mutuals: huge pivot → all weights 1', () => {
  const raw = { ...t, affinityGenerosityPivot: Number.MAX_SAFE_INTEGER };
  const w = generosityWeight(100_000, raw.affinityGenerosityPivot);
  assert.equal(w, 1);
  const s = edgeStrength({
    myEdge: edge(), reverseEdge: edge(), myWeight: w, theirWeight: w,
    nowIso: NOW, tunables: raw,
  });
  assert.ok(s >= raw.affinityPerPersonNudge + raw.affinityMutualBonus);
});

// ─── Crew nudge (spec v4) ───

test('crew nudge fires only when the crew gathers (≥2 fellows present)', () => {
  const crews = [{ crewId: 'c1', members: ['me', 'p', 'q'], lastAffirmedAt: NOW }];
  const gathered = crewNudge({
    crews, userId: 'me', presentPeople: ['p', 'q'], nowIso: NOW, tunables: t,
  });
  assert.ok(Math.abs(gathered - t.crewBonus) < 1e-9);

  const lone = crewNudge({
    crews, userId: 'me', presentPeople: ['p'], nowIso: NOW, tunables: t,
  });
  assert.equal(lone, 0, 'a lone crew-mate is just an affinity edge');
});

test('crew nudge decays from lastAffirmedAt and caps across crews', () => {
  const halfLifeAgo = '2026-01-16T00:00:00.000Z'; // 180d before NOW
  const aged = crewNudge({
    crews: [{ crewId: 'c1', members: ['me', 'p', 'q'], lastAffirmedAt: halfLifeAgo }],
    userId: 'me', presentPeople: ['p', 'q'], nowIso: NOW, tunables: t,
  });
  assert.ok(Math.abs(aged - t.crewBonus * 0.5) < 1e-6);

  const many = crewNudge({
    crews: Array.from({ length: 5 }, (_, i) => ({
      crewId: `c${i}`, members: ['me', 'p', 'q'], lastAffirmedAt: NOW,
    })),
    userId: 'me', presentPeople: ['p', 'q'], nowIso: NOW, tunables: t,
  });
  assert.equal(many, t.crewNudgeCap);
});

test('structural invariant: total soft nudges stay below fitCap', () => {
  assert.ok(t.affinityNudgeCap + t.crewNudgeCap < t.fitCap);
});

test('crewBonus zero disables the crew signal entirely', () => {
  const out = crewNudge({
    crews: [{ crewId: 'c1', members: ['me', 'p', 'q'], lastAffirmedAt: NOW }],
    userId: 'me', presentPeople: ['p', 'q'], nowIso: NOW,
    tunables: { ...t, crewBonus: 0 },
  });
  assert.equal(out, 0);
});
