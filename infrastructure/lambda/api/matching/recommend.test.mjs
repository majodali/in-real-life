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

let dataKey, modelRows, interactionsByUser, queries, keyStore, client;

function modelRow(sk, payload) {
  return { userId: 'me', sk, model: encryptValue(payload, dataKey), version: 1 };
}

function buildClient() {
  return {
    send: async (cmd) => {
      assert.equal(cmd.constructor.name, 'QueryCommand');
      queries.push(cmd.input);
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
  modelRows = [];
  interactionsByUser = {};
  queries = [];
  keyStore = { getKey: async (id) => (id === 'user#me' ? dataKey : null) };
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

test('zeroing affinityPerPersonNudge skips the interaction reads entirely', async () => {
  modelRows = [modelRow('affinity#p1', { otherUserId: 'p1', met: 1, seeAgain: 1 })];
  const tunables = { ...NO_NOISE, affinityPerPersonNudge: 0 };
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
