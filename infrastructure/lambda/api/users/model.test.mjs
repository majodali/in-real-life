// Specifications for GET /me/model and POST /me/model/correction
// (D59, docs/profile-and-legibility.md).
//
// The load-bearing assertions here are the NEVER-SHOWN rules: no Layer 3
// (affinity, crews, tap stats), no contributor rating, no weights or
// scores of any kind — enforced server-side, proven by these tests.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGetModelHandler, createCorrectModelHandler } from './model.mjs';
import { generateDataKey, encryptValue } from '../lib/crypto-shred.mjs';

function makeEvent({ claims, body } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

const validClaims = { sub: 'abc', email: 'a@b.c', email_verified: 'true' };

// ─── GET /me/model ───

let dataKey, rows, keyStore, getClient, getHandler;

function modelRow(sk, payload) {
  return { userId: 'abc', sk, model: encryptValue(payload, dataKey), version: 1 };
}

beforeEach(() => {
  dataKey = generateDataKey();
  rows = [
    modelRow('profile#core', {
      envelope: {
        groupSize: {
          comfort: 'small groups',
          position: 'small',
          provenance: 'stated',
          observations: [
            { observation: 'first one', asOf: '2026-07-01T00:00:00.000Z' },
            { observation: 'the bigger room worked', asOf: '2026-07-10T00:00:00.000Z' },
          ],
        },
        structure: {
          position: 'activity-anchored',
          positionProvenance: 'corrected',
          correctedAt: '2026-07-12T00:00:00.000Z',
          provenance: 'inferred',
        },
        familiarity: { comfort: 'warms up slowly', provenance: 'inferred' },
      },
      doors: [{ door: 'connect', weight: 0.7, provenance: 'stated' }],
      constraints: { timeWindows: ['weekday-evenings'] },
      growthEdges: [],
      provisional: true,
    }),
    modelRow('interest#pottery', { tag: 'pottery', weight: 0.8, provenance: 'stated' }),
    modelRow('interest#trivia', { tag: 'trivia', weight: 0.4, provenance: 'observed' }),
    modelRow('strength#wheel', { what: 'wheel throwing', willingToFacilitate: true, provenance: 'stated' }),
    modelRow('barrier#strangers', { what: 'rooms of strangers', easing: true, provenance: 'observed' }),
    // Layer 3 + backstage rows — must never surface.
    modelRow('affinity#other-1', { otherUserId: 'other-1', met: 3, seeAgain: 2 }),
    modelRow('crew#abcd1234', { crewId: 'abcd1234', members: ['abc', 'p1', 'p2'] }),
    modelRow('stats#affinity', { peopleMet: 9, tapsGiven: 4 }),
    modelRow('rating#contributor', { score: 0.9 }),
  ];
  keyStore = { getKey: async () => dataKey };
  getClient = { send: async () => ({ Items: rows }) };
  getHandler = createGetModelHandler({
    client: getClient, userModelTable: 'irl-user-model-test', keyStore,
  });
});

test('GET requires auth', async () => {
  const res = await getHandler(makeEvent());
  assert.equal(res.statusCode, 401);
});

test('GET returns model null for a shredded or never-onboarded member', async () => {
  keyStore.getKey = async () => null;
  const res = await getHandler(makeEvent({ claims: validClaims }));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).model, null);

  keyStore.getKey = async () => dataKey;
  rows = [];
  const empty = await getHandler(makeEvent({ claims: validClaims }));
  assert.equal(JSON.parse(empty.body).model, null);
});

test('GET translates the model member-facing: positions, stories, provenance language', async () => {
  const res = await getHandler(makeEvent({ claims: validClaims }));
  assert.equal(res.statusCode, 200);
  const { model } = JSON.parse(res.body);

  assert.equal(model.envelope.groupSize.position, 'small');
  assert.equal(model.envelope.groupSize.source, 'you told us');
  assert.equal(model.envelope.groupSize.latestObservation, 'the bigger room worked');
  assert.equal(model.envelope.structure.source, 'you told us', 'corrected reads as their own word');
  assert.equal(model.envelope.structure.correctedAt, '2026-07-12T00:00:00.000Z');
  assert.equal(model.envelope.familiarity.source, "we've noticed");
  assert.equal(model.envelope.familiarity.comfort, 'warms up slowly');

  assert.deepEqual(model.doors, [{ door: 'connect', source: 'you told us' }]);
  assert.deepEqual(model.interests.map((i) => i.source).sort(), ["we've noticed", 'you told us']);
  assert.equal(model.strengths[0].willingToFacilitate, true);
  assert.equal(model.barriers[0].easing, true);
  assert.deepEqual(model.constraints, { timeWindows: ['weekday-evenings'] });
  assert.equal(model.provisional, true);
});

test('GET never leaks Layer 3, ratings, weights, or scores', async () => {
  const res = await getHandler(makeEvent({ claims: validClaims }));
  const body = res.body;
  assert.doesNotMatch(body, /affinity|crew|stats|rating|tapsGiven|seeAgain|other-1/);
  assert.doesNotMatch(body, /"weight"|"score"/);
});

// ─── POST /me/model/correction ───

let runnerCalls, runner, userItem, correctClient, correctHandler;

beforeEach(() => {
  runnerCalls = [];
  runner = {
    runCommand: async (input) => {
      runnerCalls.push(input);
      return { cached: false, result: { status: 'correction-recorded', type: input.events[0].data.correction.type } };
    },
  };
  userItem = { userId: 'abc', seq: 4, onboardingCompletedAt: '2026-07-01T00:00:00.000Z' };
  correctClient = { send: async () => ({ Item: userItem }) };
  correctHandler = createCorrectModelHandler({
    runner, client: correctClient, usersTable: 'irl-users-test',
  });
});

const correctionBody = (correction) => ({ commandId: 'cmd-1', correction });

test('POST requires auth, a commandId, and a correction object', async () => {
  assert.equal((await correctHandler(makeEvent({ body: {} }))).statusCode, 401);
  assert.equal((await correctHandler(makeEvent({
    claims: validClaims, body: { correction: { type: 'interest-add', tag: 'x' } },
  }))).statusCode, 400);
  assert.equal((await correctHandler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1' },
  }))).statusCode, 400);
});

test('POST validates corrections against the vocabulary', async () => {
  const cases = [
    { type: 'envelope', dimension: 'shoeSize', position: 'small' },
    { type: 'envelope', dimension: 'groupSize' }, // neither position nor edge
    { type: 'envelope', dimension: 'groupSize', position: 'enormous' },
    { type: 'envelope', dimension: 'groupSize', edgeToward: 'small' }, // middle, not a pole
    { type: 'interest-add', tag: '' },
    { type: 'interest-add', tag: 'x'.repeat(61) },
    { type: 'barrier-remove' },
    { type: 'rewrite-everything' },
  ];
  for (const correction of cases) {
    const res = await correctHandler(makeEvent({ claims: validClaims, body: correctionBody(correction) }));
    assert.equal(res.statusCode, 400, JSON.stringify(correction));
  }
  assert.equal(runnerCalls.length, 0);
});

test('POST 404s for an unregistered user', async () => {
  userItem = undefined;
  const res = await correctHandler(makeEvent({
    claims: validClaims, body: correctionBody({ type: 'interest-add', tag: 'chess' }),
  }));
  assert.equal(res.statusCode, 404);
});

test('POST emits UserModelCorrected at the next seq on the user aggregate', async () => {
  const res = await correctHandler(makeEvent({
    claims: validClaims,
    body: correctionBody({ type: 'envelope', dimension: 'groupSize', position: 'small', edgeToward: 'large' }),
  }));
  assert.equal(res.statusCode, 201);

  assert.equal(runnerCalls.length, 1);
  const cmd = runnerCalls[0];
  assert.equal(cmd.commandId, 'cmd-1');
  assert.equal(cmd.aggregateId, 'user#abc');
  assert.equal(cmd.actorId, 'user#abc');
  const event = cmd.events[0];
  assert.equal(event.eventType, 'UserModelCorrected');
  assert.equal(event.seq, 5);
  assert.deepEqual(event.data.correction, {
    type: 'envelope', dimension: 'groupSize', position: 'small', edgeToward: 'large',
  });
});

test('POST clearing a growth edge (edgeToward null) is valid', async () => {
  const res = await correctHandler(makeEvent({
    claims: validClaims,
    body: correctionBody({ type: 'envelope', dimension: 'groupSize', edgeToward: null }),
  }));
  assert.equal(res.statusCode, 201);
});

test('POST replays cached (200) and maps a seq conflict to 409', async () => {
  runner.runCommand = async () => ({ cached: true, result: { status: 'correction-recorded' } });
  const cached = await correctHandler(makeEvent({
    claims: validClaims, body: correctionBody({ type: 'interest-add', tag: 'chess' }),
  }));
  assert.equal(cached.statusCode, 200);

  runner.runCommand = async () => {
    const err = new Error('conflict');
    err.name = 'TransactionCanceledException';
    throw err;
  };
  const conflict = await correctHandler(makeEvent({
    claims: validClaims, body: correctionBody({ type: 'interest-add', tag: 'chess' }),
  }));
  assert.equal(conflict.statusCode, 409);
});
