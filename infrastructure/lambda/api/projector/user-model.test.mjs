// Specifications for the user-model projector (docs/projection-store.md).
//
// The seed path uses a real crypto round-trip: the OnboardingCompleted
// fixture carries a genuinely encrypted extraction, and assertions decrypt
// the written items — proving the store is unreadable without the key.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createUserModelProjector, modelSlug } from './user-model.mjs';
import { generateDataKey, encryptValue, decryptValue } from '../lib/crypto-shred.mjs';

const TABLE = 'irl-user-model-test';

const EXTRACTION = {
  narrative: {
    selfDescription: 'Curious, likes small groups.',
    goal: 'Find a regular pottery circle.',
    stories: [{ prompt: 'q1', told: 'a story about pottery night' }],
  },
  doors: [
    { door: 'make-learn', weight: 0.8, provenance: 'stated', confidence: 'high' },
    { door: 'connect', weight: 0.4, provenance: 'inferred', confidence: 'low' },
  ],
  interests: [
    { tag: 'Pottery & Ceramics', weight: 0.9, storyRef: 0, provenance: 'stated', confidence: 'high' },
    { tag: 'trivia', provenance: 'inferred', confidence: 'low' },
  ],
  strengthsToOffer: [
    { what: 'Can teach wheel throwing', willingToFacilitate: true, provenance: 'stated', confidence: 'medium' },
  ],
  envelope: {
    groupSize: { comfort: 'small groups', growthEdge: 'larger rooms someday', provenance: 'stated', confidence: 'high' },
    structure: { comfort: 'structured', provenance: 'inferred', confidence: 'medium' },
    energy: { capacity: 'one evening a week', frequency: 'weekly', provenance: 'stated', confidence: 'high' },
  },
  constraints: { timeWindows: ['weekday evenings'], maxTravel: 'on-island' },
  barriers: [{ what: 'walking into rooms of strangers', provenance: 'stated' }],
  provisional: true,
};

let dataKey, writes, deletes, queryPages, keyStore, client, projector;

function makeEvent(overrides = {}) {
  return {
    aggregateId: 'user#abc',
    seq: 3,
    eventId: '01EVENT',
    eventType: 'OnboardingCompleted',
    simulatedTime: '2026-07-11T10:00:00.000Z',
    wallTime: '2026-07-01T10:00:00.000Z',
    data: {
      userId: 'abc',
      transcript: encryptValue([{ role: 'member', text: 'hi' }], dataKey),
      extraction: encryptValue(EXTRACTION, dataKey),
    },
    ...overrides,
  };
}

function buildClient() {
  return {
    send: async (cmd) => {
      const name = cmd.constructor.name;
      if (name === 'PutCommand') {
        if (cmd.input.ConditionExpression === 'attribute_not_exists(userId)'
          && writes.some((w) => w.sk === cmd.input.Item.sk)) {
          const err = new Error('exists');
          err.name = 'ConditionalCheckFailedException';
          throw err;
        }
        writes.push(cmd.input.Item);
        return {};
      }
      if (name === 'DeleteCommand') {
        deletes.push(cmd.input.Key);
        return {};
      }
      if (name === 'QueryCommand') {
        return queryPages.shift() ?? { Items: [] };
      }
      if (name === 'GetCommand') {
        const found = writes.find((w) => w.sk === cmd.input.Key.sk);
        return found ? { Item: found } : {};
      }
      throw new Error(`unexpected command ${name}`);
    },
  };
}

beforeEach(() => {
  dataKey = generateDataKey();
  writes = [];
  deletes = [];
  queryPages = [];
  keyStore = { getKey: async () => dataKey };
  client = buildClient();
  projector = createUserModelProjector({ client, userModelTable: TABLE, keyStore });
});

// ─── Onboarding seed ───

test('seeds profile#core with envelope, doors, constraints, growth edges', async () => {
  await projector.applyEvent(makeEvent());

  const core = writes.find((w) => w.sk === 'profile#core');
  assert.ok(core);
  assert.equal(core.userId, 'abc');
  assert.equal(core.version, 1);
  assert.equal(core.lastEventId, '01EVENT');
  assert.equal(core.asOf, '2026-07-11T10:00:00.000Z');

  const model = decryptValue(core.model, dataKey);
  assert.deepEqual(model.doors, EXTRACTION.doors);
  assert.deepEqual(model.envelope, EXTRACTION.envelope);
  assert.deepEqual(model.constraints, EXTRACTION.constraints);
  assert.equal(model.provisional, true);
  assert.deepEqual(model.growthEdges, [{
    dimension: 'groupSize',
    edge: 'larger rooms someday',
    provenance: 'stated',
    confidence: 'high',
  }]);
});

test('seeds one item per interest, strength, and barrier with slug keys', async () => {
  await projector.applyEvent(makeEvent());

  const keys = writes.map((w) => w.sk).sort();
  assert.deepEqual(keys, [
    'barrier#walking-into-rooms-of-strangers',
    'interest#pottery-ceramics',
    'interest#trivia',
    'profile#core',
    'strength#can-teach-wheel-throwing',
  ]);

  const interest = writes.find((w) => w.sk === 'interest#pottery-ceramics');
  assert.deepEqual(decryptValue(interest.model, dataKey), EXTRACTION.interests[0]);
  const strength = writes.find((w) => w.sk === 'strength#can-teach-wheel-throwing');
  assert.equal(decryptValue(strength.model, dataKey).willingToFacilitate, true);
});

test('model payloads are ciphertext, not cleartext', async () => {
  await projector.applyEvent(makeEvent());
  for (const item of writes) {
    assert.match(item.model, /^v1:/);
    assert.doesNotMatch(JSON.stringify(item), /pottery night|wheel throwing/i);
  }
});

test('asOf comes from simulatedTime, never wallTime', async () => {
  await projector.applyEvent(makeEvent());
  for (const item of writes) {
    assert.equal(item.asOf, '2026-07-11T10:00:00.000Z');
  }
});

test('duplicate delivery is a no-op (conditional writes swallow the retry)', async () => {
  await projector.applyEvent(makeEvent());
  const count = writes.length;
  await projector.applyEvent(makeEvent());
  assert.equal(writes.length, count);
});

test('skips a shredded user (no key) without throwing', async () => {
  keyStore = { getKey: async () => null };
  projector = createUserModelProjector({ client, userModelTable: TABLE, keyStore });

  await projector.applyEvent(makeEvent());
  assert.equal(writes.length, 0);
});

test('handles an extraction with only the required fields', async () => {
  const minimal = {
    narrative: { selfDescription: 's', goal: 'g', stories: [] },
    doors: [],
    envelope: {},
    provisional: true,
  };
  await projector.applyEvent(makeEvent({
    data: {
      userId: 'abc',
      transcript: encryptValue([], dataKey),
      extraction: encryptValue(minimal, dataKey),
    },
  }));

  assert.deepEqual(writes.map((w) => w.sk), ['profile#core']);
  const model = decryptValue(writes[0].model, dataKey);
  assert.deepEqual(model.constraints, {});
  assert.deepEqual(model.growthEdges, []);
});

// ─── Purge / tombstone ───

test('UserDeleted purges every item and leaves an empty tombstone', async () => {
  queryPages = [
    { Items: [{ sk: 'profile#core' }, { sk: 'interest#trivia' }], LastEvaluatedKey: { userId: 'abc', sk: 'interest#trivia' } },
    { Items: [{ sk: 'strength#x' }] },
  ];

  await projector.applyEvent({
    aggregateId: 'user#abc',
    eventId: '01DELETE',
    eventType: 'UserDeleted',
    simulatedTime: '2026-08-01T00:00:00.000Z',
    data: { userId: 'abc' },
  });

  assert.deepEqual(deletes, [
    { userId: 'abc', sk: 'profile#core' },
    { userId: 'abc', sk: 'interest#trivia' },
    { userId: 'abc', sk: 'strength#x' },
  ]);
  assert.deepEqual(writes, [{
    userId: 'abc',
    sk: 'tombstone',
    shreddedAt: '2026-08-01T00:00:00.000Z',
    lastEventId: '01DELETE',
  }]);
});

test('UserKeyShredded also purges (converges when either event arrives)', async () => {
  await projector.applyEvent({
    aggregateId: 'user#abc',
    eventId: '01SHRED',
    eventType: 'UserKeyShredded',
    simulatedTime: '2026-08-01T00:00:01.000Z',
    data: { userId: 'abc' },
  });
  assert.equal(writes.at(-1).sk, 'tombstone');
});

// ─── Routing ───

test('ignores non-user aggregates and non-model events', async () => {
  await projector.applyEvent({
    aggregateId: 'event#xyz',
    eventType: 'OnboardingCompleted',
    data: { userId: 'abc' },
  });
  await projector.applyEvent({
    aggregateId: 'user#abc',
    eventType: 'UserProfileCreated',
    data: { userId: 'abc', name: 'x' },
  });
  assert.equal(writes.length, 0);
  assert.equal(deletes.length, 0);
});

// ─── readFacet ───

test('readFacet returns the decrypted facet, null when missing or shredded', async () => {
  await projector.applyEvent(makeEvent());

  const core = await projector.readFacet('abc', 'profile#core');
  assert.equal(core.model.provisional, true);

  assert.equal(await projector.readFacet('abc', 'rating#core'), null);

  keyStore.getKey = async () => null;
  assert.equal(await projector.readFacet('abc', 'profile#core'), null);
});

// ─── modelSlug ───

test('modelSlug is deterministic, lowercase, bounded', () => {
  assert.equal(modelSlug('Pottery & Ceramics'), 'pottery-ceramics');
  assert.equal(modelSlug('  --Weird__input!!  '), 'weird-input');
  assert.equal(modelSlug(''), 'unnamed');
  assert.ok(modelSlug('x'.repeat(200)).length <= 48);
});
