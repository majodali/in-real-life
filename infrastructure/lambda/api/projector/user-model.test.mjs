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

// ─── Debrief deltas (second source; D7 read→apply→conditional write) ───

import { encryptPii } from '../lib/crypto-shred.mjs';
import { STUB_DEBRIEF_EXTRACTION } from '../lib/llm.mjs';

function debriefEvent(data, overrides = {}) {
  const piiFields = ['again', 'noShowReason', 'outcomeTexture', 'people',
    'surprise', 'reflection', 'deltas'].filter((f) => data[f] !== undefined);
  return {
    aggregateId: 'interaction#abc#evt-9',
    seq: 3,
    eventId: overrides.eventId ?? '01DEBRIEF',
    eventType: 'DebriefSubmitted',
    simulatedTime: '2026-07-20T10:00:00.000Z',
    data: { userId: 'abc', eventId: 'evt-9', ...encryptPii(data, piiFields, dataKey), attended: data.attended },
    ...overrides,
  };
}

test('people taps grow affinity items: met counts, positive-only seeAgain, sources', async () => {
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-1', met: true, seeAgain: true }],
  }));

  const item = writes.find((w) => w.sk === 'affinity#other-1');
  assert.ok(item, 'affinity item written');
  const model = decryptValue(item.model, dataKey);
  assert.equal(model.met, 1);
  assert.equal(model.seeAgain, 1);
  assert.equal(model.sources[0].eventId, 'evt-9');
  assert.equal(item.version, 1);
  assert.equal(item.lastEventId, '01DEBRIEF');

  // A second debrief (different event) merges into the same edge.
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-1', met: true, seeAgain: false }],
  }, { eventId: '01DEBRIEF2', aggregateId: 'interaction#abc#evt-10' }));

  const merged = writes.filter((w) => w.sk === 'affinity#other-1').at(-1);
  const mergedModel = decryptValue(merged.model, dataKey);
  assert.equal(mergedModel.met, 2);
  assert.equal(mergedModel.seeAgain, 1, 'seeAgain only on the positive tap');
  assert.equal(merged.version, 2);
});

test('redelivered debrief is a no-op (lastEventId idempotency)', async () => {
  const ev = debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-1', met: true, seeAgain: true }],
  });
  await projector.applyEvent(ev);
  const count = writes.length;
  await projector.applyEvent(ev);
  assert.equal(writes.length, count);
});

test('conduct-quarantined debriefs are non-model-bearing (defence in depth)', async () => {
  await projector.applyEvent(debriefEvent({ attended: true, suppressed: true, conductConcern: true }));
  assert.equal(writes.length, 0);
});

test('LLM deltas apply: envelope observation lands on profile#core as observed', async () => {
  await projector.applyEvent(makeEvent()); // onboarding seed first
  const before = writes.filter((w) => w.sk === 'profile#core').length;

  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes', surprise: 'big room was fine',
    deltas: STUB_DEBRIEF_EXTRACTION,
  }));

  const cores = writes.filter((w) => w.sk === 'profile#core');
  assert.equal(cores.length, before + 1);
  const model = decryptValue(cores.at(-1).model, dataKey);
  const dim = model.envelope.groupSize;
  assert.equal(dim.provenance, 'observed', 'observed outranks the seeded annotation');
  assert.equal(dim.observations.length, 1);
  assert.equal(dim.observations[0].condition, 'a shared activity gave everyone something to do');
  assert.equal(dim.observations[0].sourceEventId, '01DEBRIEF');
  assert.equal(dim.comfort, 'small groups', 'seeded comfort text preserved');
});

test('no-show reason becomes an observed barrier item', async () => {
  await projector.applyEvent(debriefEvent({ attended: false, noShowReason: 'nerves on the day' }));
  const item = writes.find((w) => w.sk === 'barrier#nerves-on-the-day');
  assert.ok(item);
  const model = decryptValue(item.model, dataKey);
  assert.equal(model.provenance, 'observed');
  assert.equal(model.observations.length, 1);
});

test('a shredded member\'s debrief is skipped cleanly', async () => {
  keyStore.getKey = async () => null;
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-1', met: true, seeAgain: true }],
  }));
  assert.equal(writes.length, 0);
});

// ─── Reflection deltas ───

test('ReflectionRecorded applies extracted deltas through the shared path', async () => {
  await projector.applyEvent(makeEvent()); // seed
  await projector.applyEvent({
    aggregateId: 'user#abc',
    seq: 5,
    eventId: '01REFL',
    eventType: 'ReflectionRecorded',
    simulatedTime: '2026-07-22T10:00:00.000Z',
    data: {
      userId: 'abc',
      eventId: 'evt-9',
      transcript: encryptValue([{ role: 'member', text: 'it was fine once we were cooking' }], dataKey),
      deltas: encryptValue(STUB_DEBRIEF_EXTRACTION, dataKey),
      perspectivesOffered: ['barriers-are-situational'],
    },
  });

  const core = writes.filter((w) => w.sk === 'profile#core').at(-1);
  const model = decryptValue(core.model, dataKey);
  assert.equal(model.envelope.groupSize.provenance, 'observed');
  assert.equal(model.envelope.groupSize.observations[0].sourceEventId, '01REFL');
});

test('a suppressed reflection is non-model-bearing', async () => {
  await projector.applyEvent({
    aggregateId: 'user#abc',
    seq: 5,
    eventId: '01REFL',
    eventType: 'ReflectionRecorded',
    simulatedTime: '2026-07-22T10:00:00.000Z',
    data: {
      userId: 'abc', eventId: 'evt-9', suppressed: true,
      transcript: encryptValue([], dataKey),
    },
  });
  assert.equal(writes.length, 0);
});

test('people taps maintain stats#affinity running totals (the generosity input, D47)', async () => {
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [
      { userId: 'other-1', met: true, seeAgain: true },
      { userId: 'other-2', met: true, seeAgain: false },
    ],
  }));

  const stats = writes.find((w) => w.sk === 'stats#affinity');
  assert.ok(stats, 'stats item written');
  let model = decryptValue(stats.model, dataKey);
  assert.equal(model.peopleMet, 2);
  assert.equal(model.tapsGiven, 1);

  // A second debrief accumulates; redelivery of the same event is a no-op.
  const second = () => debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-3', met: true, seeAgain: true }],
  }, { eventId: '01DEBRIEF-2' });
  await projector.applyEvent(second());
  await projector.applyEvent(second());

  const after = writes.filter((w) => w.sk === 'stats#affinity').at(-1);
  model = decryptValue(after.model, dataKey);
  assert.equal(model.peopleMet, 3);
  assert.equal(model.tapsGiven, 2);
});

test('a tap-free debrief (no people) writes no stats item', async () => {
  await projector.applyEvent(debriefEvent({ attended: true, again: 'yes' }));
  assert.equal(writes.find((w) => w.sk === 'stats#affinity'), undefined);
});
