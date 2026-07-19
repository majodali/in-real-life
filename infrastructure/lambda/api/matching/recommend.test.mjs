// Specifications for the recommender orchestration (docs/matching-spec.md).
//
// Real crypto round-trip on the model rows — the store is encrypted under
// the member's key, and a missing key (shredded / never onboarded) must
// degrade to exploration-only ranking, never an error.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRecommender } from './recommend.mjs';
import { RANKING_TUNABLES } from './tunables.mjs';
import { generateDataKey, encryptValue } from '../lib/crypto-shred.mjs';

const MODEL_TABLE = 'irl-user-model-test';
const INTERACTIONS_TABLE = 'irl-interactions-test';
const NOW = '2026-07-15T10:00:00.000Z';

let dataKey, keysById, modelRows, otherRows, interactionsByUser, queries, keyStore, client;

function modelRow(sk, payload) {
  return { userId: 'me', sk, model: encryptValue(payload, dataKey), version: 1 };
}

// Another member's encrypted model row, addressable by GetItem.
function otherRow(userId, sk, payload, key) {
  otherRows[`${userId}|${sk}`] = { userId, sk, model: encryptValue(payload, key), version: 1 };
}

function buildClient() {
  return {
    send: async (cmd) => {
      queries.push(cmd.input);
      if (cmd.constructor.name === 'GetCommand') {
        assert.equal(cmd.input.TableName, MODEL_TABLE);
        const item = otherRows[`${cmd.input.Key.userId}|${cmd.input.Key.sk}`];
        return item ? { Item: item } : {};
      }
      assert.equal(cmd.constructor.name, 'QueryCommand');
      if (cmd.input.TableName === MODEL_TABLE) return { Items: modelRows };
      if (cmd.input.TableName === INTERACTIONS_TABLE) {
        const userId = cmd.input.ExpressionAttributeValues[':u'];
        return { Items: interactionsByUser[userId] ?? [] };
      }
      throw new Error(`unexpected table ${cmd.input.TableName}`);
    },
  };
}

function recommender(tunables = RANKING_TUNABLES) {
  return createRecommender({
    client,
    userModelTable: MODEL_TABLE,
    interactionsTable: INTERACTIONS_TABLE,
    keyStore,
    tunables,
  });
}

function evt(eventId, overrides = {}) {
  return {
    eventId,
    title: overrides.title ?? `Event ${eventId}`,
    effectiveState: 'planned',
    startTime: '2026-07-20T10:00:00.000Z',
    endTime: '2026-07-20T12:00:00.000Z',
    myLevel: null,
    ...overrides,
  };
}

const NO_NOISE = { ...RANKING_TUNABLES, explorationNoise: 0, explorationShare: 0 };

beforeEach(() => {
  dataKey = generateDataKey();
  keysById = { 'user#me': dataKey };
  modelRows = [];
  otherRows = {};
  interactionsByUser = {};
  queries = [];
  keyStore = { getKey: async (id) => keysById[id] ?? null };
  client = buildClient();
});

// ─── Hard constraints: the only gate ───

test('infeasible events never appear: full, committed, conflicting, not joinable', async () => {
  const committed = evt('e-mine', { myLevel: 'confirmed' });
  const events = [
    committed,
    evt('e-full', { full: true }),
    evt('e-conflict', {
      startTime: '2026-07-20T11:00:00.000Z', endTime: '2026-07-20T13:00:00.000Z',
    }), // overlaps e-mine
    evt('e-over', { effectiveState: 'over' }),
    evt('e-cancelled', { effectiveState: 'cancelled' }),
    evt('e-ok', {
      startTime: '2026-07-21T10:00:00.000Z', endTime: '2026-07-21T12:00:00.000Z',
    }),
    evt('e-idea', { effectiveState: 'idea', startTime: undefined, endTime: undefined }),
  ];
  const out = await recommender().recommend({ userId: 'me', events, nowIso: NOW });
  assert.deepEqual([...out].sort(), ['e-idea', 'e-ok']);
});

test('an interested event is still a candidate — interest is not commitment', async () => {
  const out = await recommender().recommend({
    userId: 'me',
    events: [evt('e-int', { myLevel: 'interested' })],
    nowIso: NOW,
  });
  assert.deepEqual(out, ['e-int']);
});

// ─── Model loading ───

test('interests from the encrypted store drive fit ordering', async () => {
  modelRows = [modelRow('interest#pottery', { tag: 'pottery', weight: 0.9 })];
  const events = [
    evt('e-run', { title: 'Morning run' }),
    evt('e-pot', { title: 'Pottery wheel intro' }),
  ];
  const out = await recommender(NO_NOISE).recommend({ userId: 'me', events, nowIso: NOW });
  assert.deepEqual(out, ['e-pot', 'e-run']);
});

test('a member with no key (shredded / not onboarded) still gets an ordering', async () => {
  keyStore = { getKey: async () => null };
  client = buildClient();
  const events = [evt('e1'), evt('e2')];
  const out = await recommender().recommend({ userId: 'me', events, nowIso: NOW });
  assert.equal(out.length, 2);
  // No model or interactions queries were made — nothing to read
  assert.deepEqual(queries, []);
});

// ─── Affinity: outgoing-only, positive taps, generosity-discounted ───

test('a tapped person being in nudges that event up; negative-only edges never queried', async () => {
  modelRows = [
    modelRow('affinity#p1', { otherUserId: 'p1', met: 2, seeAgain: 2 }),
    modelRow('affinity#p2', { otherUserId: 'p2', met: 3, seeAgain: 0 }), // met, never tapped
  ];
  interactionsByUser.p1 = [
    { userId: 'p1', eventId: 'e-b', level: 'confirmed' },
    { userId: 'p1', eventId: 'e-elsewhere', level: 'confirmed' },
  ];
  const events = [evt('e-a'), evt('e-b', { startTime: '2026-07-21T10:00:00.000Z', endTime: '2026-07-21T12:00:00.000Z' })];
  const out = await recommender(NO_NOISE).recommend({ userId: 'me', events, nowIso: NOW });
  assert.deepEqual(out, ['e-b', 'e-a']);
  // p2 (seeAgain 0) must never be consulted
  const consulted = queries
    .filter((q) => q.TableName === INTERACTIONS_TABLE)
    .map((q) => q.ExpressionAttributeValues[':u']);
  assert.deepEqual(consulted, ['p1']);
});

test('zeroing every affinity tunable skips the interaction reads entirely', async () => {
  modelRows = [modelRow('affinity#p1', { otherUserId: 'p1', met: 1, seeAgain: 1 })];
  const tunables = {
    ...NO_NOISE, affinityPerPersonNudge: 0, affinityMutualBonus: 0, affinityConfirmedBonus: 0,
  };
  await recommender(tunables).recommend({ userId: 'me', events: [evt('e1')], nowIso: NOW });
  assert.deepEqual(queries.filter((q) => q.TableName === INTERACTIONS_TABLE), []);
});

test('empty candidate set short-circuits with no reads', async () => {
  const out = await recommender().recommend({
    userId: 'me',
    events: [evt('e-full', { full: true })],
    nowIso: NOW,
  });
  assert.deepEqual(out, []);
  assert.deepEqual(queries, []);
});

test('doors from profile#core drive door fit against event shape', async () => {
  modelRows = [modelRow('profile#core', {
    envelope: {}, constraints: {},
    doors: [{ door: 'make-learn', weight: 0.9, provenance: 'stated', confidence: 'high' }],
  })];
  const events = [
    evt('e-plain'),
    evt('e-class', {
      shape: {
        activityTags: ['pottery'], structure: 'structured',
        doors: ['make-learn'], source: 'extracted',
      },
    }),
  ];
  const out = await recommender(NO_NOISE).recommend({ userId: 'me', events, nowIso: NOW });
  assert.deepEqual(out, ['e-class', 'e-plain']);
});

// ─── D47: strength-weighted mutuals ───

test('a mutual edge outranks a one-sided edge; a spam tapper\'s mutual amplifies toward the one-sided floor', async () => {
  const p1Key = generateDataKey();
  const p2Key = generateDataKey();
  const p3Key = generateDataKey();
  keysById['user#p1'] = p1Key;
  keysById['user#p2'] = p2Key;
  keysById['user#p3'] = p3Key;

  modelRows = [
    modelRow('affinity#p1', { otherUserId: 'p1', met: 1, seeAgain: 1, sources: [] }),
    modelRow('affinity#p2', { otherUserId: 'p2', met: 1, seeAgain: 1, sources: [] }),
    modelRow('affinity#p3', { otherUserId: 'p3', met: 1, seeAgain: 1, sources: [] }),
  ];
  // p1: selective mutual (tapped me back, few taps overall).
  otherRow('p1', 'affinity#me', { otherUserId: 'me', met: 0, seeAgain: 1, sources: [] }, p1Key);
  otherRow('p1', 'stats#affinity', { peopleMet: 4, tapsGiven: 2 }, p1Key);
  // p2: spam mutual (tapped me back — along with everyone else).
  otherRow('p2', 'affinity#me', { otherUserId: 'me', met: 0, seeAgain: 1, sources: [] }, p2Key);
  otherRow('p2', 'stats#affinity', { peopleMet: 1300, tapsGiven: 1200 }, p2Key);
  // p3: never tapped back — one-sided only.

  interactionsByUser.p1 = [{ userId: 'p1', eventId: 'e-selective', level: 'confirmed' }];
  interactionsByUser.p2 = [{ userId: 'p2', eventId: 'e-spam', level: 'confirmed' }];
  interactionsByUser.p3 = [{ userId: 'p3', eventId: 'e-oneside', level: 'confirmed' }];

  const events = [evt('e-oneside'), evt('e-spam'), evt('e-selective')];
  const out = await recommender(NO_NOISE).recommend({ userId: 'me', events, nowIso: NOW });
  // Selective mutual carries the full bonus; the spammer's mutual is
  // weaker-side-gated to ≈ the one-sided floor (but never below it).
  assert.deepEqual(out, ['e-selective', 'e-spam', 'e-oneside']);
});

test('reciprocal met counts add confirmed strength; one-sided met does not', async () => {
  const p1Key = generateDataKey();
  const p2Key = generateDataKey();
  keysById['user#p1'] = p1Key;
  keysById['user#p2'] = p2Key;

  modelRows = [
    modelRow('affinity#p1', { otherUserId: 'p1', met: 3, seeAgain: 1, sources: [] }),
    modelRow('affinity#p2', { otherUserId: 'p2', met: 3, seeAgain: 1, sources: [] }),
  ];
  // p1: both sides keep marking each other met (confirmed pair).
  otherRow('p1', 'affinity#me', { otherUserId: 'me', met: 3, seeAgain: 1, sources: [] }, p1Key);
  // p2: mutual tap once, but p2 never marked me met — a follower pattern
  // gains no confirmation (F13 guard).
  otherRow('p2', 'affinity#me', { otherUserId: 'me', met: 0, seeAgain: 1, sources: [] }, p2Key);

  interactionsByUser.p1 = [{ userId: 'p1', eventId: 'e-confirmed', level: 'confirmed' }];
  interactionsByUser.p2 = [{ userId: 'p2', eventId: 'e-unconfirmed', level: 'confirmed' }];

  const events = [evt('e-unconfirmed'), evt('e-confirmed')];
  const out = await recommender(NO_NOISE).recommend({ userId: 'me', events, nowIso: NOW });
  assert.deepEqual(out, ['e-confirmed', 'e-unconfirmed']);
});

test('own stats#affinity discounts a heavy tapper\'s one-sided nudges', async () => {
  const heavy = { ...NO_NOISE };
  modelRows = [
    modelRow('stats#affinity', { peopleMet: 500, tapsGiven: 480 }),
    modelRow('affinity#p1', { otherUserId: 'p1', met: 1, seeAgain: 1, sources: [] }),
    modelRow('interest#running', { tag: 'running', weight: 0.5 }),
  ];
  interactionsByUser.p1 = [{ userId: 'p1', eventId: 'e-tapped', level: 'confirmed' }];
  const events = [
    evt('e-tapped', { title: 'Quiet hall gathering' }),
    // Modest fit beats a self-discounted tap: 0.4×0.5 = 0.2 fit vs
    // 0.12×(12/480) = 0.003 nudge.
    evt('e-run', { title: 'Morning running club' }),
  ];
  const out = await recommender(heavy).recommend({ userId: 'me', events, nowIso: NOW });
  assert.deepEqual(out, ['e-run', 'e-tapped']);
});

// ─── Crews (spec v4) ───

test('a crew gathering outranks the same people as mere affinity edges', async () => {
  const p1Key = generateDataKey();
  const p2Key = generateDataKey();
  keysById['user#p1'] = p1Key;
  keysById['user#p2'] = p2Key;

  modelRows = [
    modelRow('affinity#p1', { otherUserId: 'p1', met: 3, seeAgain: 1, sources: [] }),
    modelRow('affinity#p2', { otherUserId: 'p2', met: 3, seeAgain: 1, sources: [] }),
    modelRow('crew#abc123', {
      crewId: 'abc123', members: ['me', 'p1', 'p2'],
      formedAt: NOW, lastAffirmedAt: NOW, affirmations: 3,
    }),
  ];
  // Both crew-mates on e-gathering; both ALSO on e-split — but split
  // across nothing: use one mate each so only e-gathering is a gathering.
  interactionsByUser.p1 = [
    { userId: 'p1', eventId: 'e-gathering', level: 'confirmed' },
    { userId: 'p1', eventId: 'e-split', level: 'confirmed' },
  ];
  interactionsByUser.p2 = [
    { userId: 'p2', eventId: 'e-gathering', level: 'confirmed' },
  ];

  const events = [evt('e-split'), evt('e-gathering')];
  const out = await recommender(NO_NOISE).recommend({ userId: 'me', events, nowIso: NOW });
  assert.deepEqual(out, ['e-gathering', 'e-split']);
});

test('crew-mates beyond the affinity edge limit still register a gathering', async () => {
  const tunables = { ...NO_NOISE, affinityEdgeLimit: 1 };
  const p1Key = generateDataKey();
  const p2Key = generateDataKey();
  keysById['user#p1'] = p1Key;
  keysById['user#p2'] = p2Key;

  modelRows = [
    // p3 has the most taps and hogs the single edge slot.
    modelRow('affinity#p3', { otherUserId: 'p3', met: 9, seeAgain: 9, sources: [] }),
    modelRow('affinity#p1', { otherUserId: 'p1', met: 3, seeAgain: 1, sources: [] }),
    modelRow('affinity#p2', { otherUserId: 'p2', met: 3, seeAgain: 1, sources: [] }),
    modelRow('crew#abc123', {
      crewId: 'abc123', members: ['me', 'p1', 'p2'],
      formedAt: NOW, lastAffirmedAt: NOW, affirmations: 2,
    }),
  ];
  interactionsByUser.p1 = [{ userId: 'p1', eventId: 'e-gathering', level: 'confirmed' }];
  interactionsByUser.p2 = [{ userId: 'p2', eventId: 'e-gathering', level: 'confirmed' }];

  const events = [evt('e-plain'), evt('e-gathering')];
  const out = await recommender(tunables).recommend({ userId: 'me', events, nowIso: NOW });
  assert.deepEqual(out, ['e-gathering', 'e-plain']);
});
