// Specifications for the ranking mechanics v1 (docs/matching-spec.md).
//
// The structural invariants matter more than any particular order:
// fit dominance (nudges capped below fitCap), determinism, tunable-to-zero,
// and the guaranteed exploratory share.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hash01, weekBucket, generosityWeight, blendExploration, rankCandidates,
} from './rank.mjs';
import { RANKING_TUNABLES } from './tunables.mjs';

const NOW = '2026-07-15T10:00:00.000Z';

function noNoise(overrides = {}) {
  return { ...RANKING_TUNABLES, explorationNoise: 0, explorationShare: 0, ...overrides };
}

test('structural invariant: all soft nudges together stay below fitCap', () => {
  assert.ok(RANKING_TUNABLES.affinityNudgeCap < RANKING_TUNABLES.fitCap);
});

test('hash01 is deterministic, bounded, and input-sensitive', () => {
  const a = hash01('u1', 'e1', 1, 2950);
  assert.equal(a, hash01('u1', 'e1', 1, 2950));
  assert.ok(a >= 0 && a <= 1);
  assert.notEqual(a, hash01('u1', 'e2', 1, 2950));
  assert.notEqual(a, hash01('u1', 'e1', 1, 2951)); // week bucket reshuffles
});

test('weekBucket changes weekly under simulated time', () => {
  // Buckets are epoch-anchored 7-day windows — same window, same bucket
  assert.equal(weekBucket('2026-07-16T00:00:00Z'), weekBucket('2026-07-17T00:00:00Z'));
  assert.notEqual(weekBucket('2026-07-16T00:00:00Z'), weekBucket('2026-07-24T00:00:00Z'));
});

test('generosity: full weight up to the pivot, then discounts toward zero', () => {
  assert.equal(generosityWeight(0, 12), 1);
  assert.equal(generosityWeight(12, 12), 1);
  assert.equal(generosityWeight(24, 12), 0.5);
  assert.equal(generosityWeight(120, 12), 0.1);
  assert.equal(generosityWeight(5, 0), 0); // pivot 0 = affinity off
});

test('blendExploration reserves every k-th slot for the noise ordering', () => {
  const byScore = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const byExplore = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  const out = blendExploration(byScore, byExplore, 0.25); // period 4
  assert.deepEqual([...out].sort(), [...byScore].sort()); // a permutation
  assert.equal(out[3], 'h'); // slot 4 comes from the exploration ordering
  assert.equal(out[7], 'g'); // slot 8 too
  assert.deepEqual(out.slice(0, 3), ['a', 'b', 'c']);
});

test('blendExploration with share 0 returns pure score order', () => {
  assert.deepEqual(blendExploration(['a', 'b'], ['b', 'a'], 0), ['a', 'b']);
});

test('fit orders candidates when noise and affinity are zeroed', () => {
  const candidates = [
    { eventId: 'e-pottery', title: 'Pottery wheel intro', startTime: '2026-07-20T10:00:00Z' },
    { eventId: 'e-run', title: 'Morning run', startTime: '2026-07-19T10:00:00Z' },
  ];
  const out = rankCandidates({
    userId: 'u1',
    candidates,
    model: { interests: [{ tag: 'pottery', weight: 0.9 }] },
    affinityNudges: new Map(),
    nowIso: NOW,
    tunables: noNoise(),
  });
  assert.deepEqual(out, ['e-pottery', 'e-run']);
});

test('affinity nudges an otherwise-tied event up, but stays capped below a fit gap', () => {
  const candidates = [
    { eventId: 'e-a', title: 'Walk', startTime: '2026-07-20T10:00:00Z' },
    { eventId: 'e-b', title: 'Walk too', startTime: '2026-07-21T10:00:00Z' },
    { eventId: 'e-fit', title: 'Pottery night', startTime: '2026-07-22T10:00:00Z' },
  ];
  const tunables = noNoise();
  const out = rankCandidates({
    userId: 'u1',
    candidates,
    model: { interests: [{ tag: 'pottery', weight: 1 }] },
    // A huge summed strength on e-b saturates at affinityNudgeCap (0.24),
    // still below e-fit's fit (0.4) — fit dominance is structural.
    affinityNudges: new Map([['e-b', 10]]),
    nowIso: NOW,
    tunables,
  });
  assert.deepEqual(out, ['e-fit', 'e-b', 'e-a']);
});

test('ranking is deterministic for fixed inputs, including noise', () => {
  const candidates = Array.from({ length: 9 }, (_, i) => ({
    eventId: `e${i}`, title: `Event ${i}`, startTime: `2026-07-2${i % 9}T10:00:00Z`,
  }));
  const args = {
    userId: 'u1',
    candidates,
    model: { interests: [] },
    affinityNudges: new Map(),
    nowIso: NOW,
    tunables: RANKING_TUNABLES,
  };
  assert.deepEqual(rankCandidates(args), rankCandidates(args));
});

test('with an empty model the ordering is exploration, and differs per member', () => {
  const candidates = Array.from({ length: 12 }, (_, i) => ({
    eventId: `e${i}`, title: `Event ${i}`, startTime: '2026-07-20T10:00:00Z',
  }));
  const base = {
    candidates, model: { interests: [] }, affinityNudges: new Map(),
    nowIso: NOW, tunables: RANKING_TUNABLES,
  };
  const u1 = rankCandidates({ ...base, userId: 'u1' });
  const u2 = rankCandidates({ ...base, userId: 'u2' });
  assert.deepEqual([...u1].sort(), [...u2].sort());
  assert.notDeepEqual(u1, u2); // soft and noisy: no two members see one canonical order
});
