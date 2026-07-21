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
          && writes.some((w) => w.sk === cmd.input.Item.sk && w.userId === cmd.input.Item.userId)) {
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
        // Queued pages win (purge tests); otherwise serve the live
        // partition so crew detection sees what earlier deltas wrote.
        return queryPages.shift()
          ?? { Items: writes.filter((w) => w.userId === cmd.input.ExpressionAttributeValues[':u']) };
      }
      if (name === 'GetCommand') {
        // Latest write wins — the mock appends on update, so serve the tail.
        const found = writes.findLast(
          (w) => w.sk === cmd.input.Key.sk && w.userId === cmd.input.Key.userId,
        );
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
  assert.equal(model.debriefedEvents, 1);

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
  assert.equal(model.debriefedEvents, 2);
});

test('every attended debrief counts as lived activity — even tap-free (the D60 axis)', async () => {
  await projector.applyEvent(debriefEvent({ attended: true, again: 'yes' }));
  const stats = writes.find((w) => w.sk === 'stats#affinity');
  assert.ok(stats, 'the activity counter advances on a tap-free debrief');
  const model = decryptValue(stats.model, dataKey);
  assert.equal(model.debriefedEvents, 1);
  assert.equal(model.peopleMet, 0);
  assert.equal(model.tapsGiven, 0);
});

test('a no-show is not a lived event: no activity increment, no stats item', async () => {
  await projector.applyEvent(debriefEvent({ attended: false, noShowReason: 'nerves' }));
  assert.equal(writes.find((w) => w.sk === 'stats#affinity'), undefined);
});

test('edges carry activity snapshots: met stamps activityAtLastMet, taps also activityAtLastTap', async () => {
  // Two lived events first — the counter the snapshots must reference.
  await projector.applyEvent(debriefEvent({ attended: true, again: 'yes' }));
  await projector.applyEvent(debriefEvent({ attended: true, again: 'yes' },
    { eventId: '01LIVED-2', aggregateId: 'interaction#abc#evt-8' }));

  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [
      { userId: 'tapped', met: true, seeAgain: true },
      { userId: 'met-only', met: true, seeAgain: false },
    ],
  }, { eventId: '01LIVED-3', aggregateId: 'interaction#abc#evt-9' }));

  const tapped = decryptValue(writes.findLast((w) => w.sk === 'affinity#tapped').model, dataKey);
  assert.equal(tapped.activityAtLastMet, 3, 'the counter includes the stamping debrief');
  assert.equal(tapped.activityAtLastTap, 3);
  const metOnly = decryptValue(writes.findLast((w) => w.sk === 'affinity#met-only').model, dataKey);
  assert.equal(metOnly.activityAtLastMet, 3);
  assert.equal(metOnly.activityAtLastTap, undefined, 'no tap → no tap anchor');

  // Redelivery stamps identically: the stats delta skips via lastEventId
  // but still hands back the already-incremented counter (replay-exact).
  const count = writes.length;
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [
      { userId: 'tapped', met: true, seeAgain: true },
      { userId: 'met-only', met: true, seeAgain: false },
    ],
  }, { eventId: '01LIVED-3', aggregateId: 'interaction#abc#evt-9' }));
  assert.equal(writes.length, count, 'redelivered record is a no-op');
});

// ─── Outcome rows (D63): the member's history with a KIND ───

test('an attended debrief with a typed event grows the outcome row: lastAgain, tallies, context', async () => {
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    outcomeTexture: ['great-company', 'the-activity-itself'],
    people: [{ userId: 'other-1', met: true, seeAgain: true }],
    eventTypeId: 'board-game-night',
  }));

  const row = writes.findLast((w) => w.sk === 'outcome#board-game-night');
  assert.ok(row, 'outcome row written');
  let payload = decryptValue(row.model, dataKey);
  assert.equal(payload.lastAgain, 'yes');
  assert.equal(payload.attended, 1);
  assert.deepEqual(payload.again, { yes: 1, maybe: 0, no: 0 });
  assert.equal(payload.lastContext.peopleTapped, true, 'attribution context stored (§4)');
  assert.deepEqual(payload.lastContext.texture, ['great-company', 'the-activity-itself']);

  // The next debrief of the kind supersedes the word (D7, no clocks).
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'no', eventTypeId: 'board-game-night',
  }, { eventId: '01OUTCOME-2', aggregateId: 'interaction#abc#evt-10' }));
  payload = decryptValue(writes.findLast((w) => w.sk === 'outcome#board-game-night').model, dataKey);
  assert.equal(payload.lastAgain, 'no');
  assert.deepEqual(payload.again, { yes: 1, maybe: 0, no: 1 });
  assert.equal(payload.attended, 2);
  assert.equal(payload.lastContext.peopleTapped, false);
});

test('Tier-2 eventTypeOutcome and forecastError land on the same single write', async () => {
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes', surprise: 'left buzzing',
    eventTypeId: 'pottery-class',
    deltas: {
      envelopeUpdates: [], interestUpdates: [], barrierUpdates: [],
      eventTypeOutcome: { energized: true, condition: 'hands busy the whole time' },
      forecastError: { predicted: 'exhausting', actual: 'energizing' },
    },
  }));

  const payload = decryptValue(
    writes.findLast((w) => w.sk === 'outcome#pottery-class').model, dataKey,
  );
  assert.deepEqual(payload.energized, { yes: 1, no: 0 });
  assert.equal(payload.lastEnergizedCondition, 'hands busy the whole time');
  assert.equal(payload.forecastErrors.length, 1);
  assert.equal(payload.forecastErrors[0].predicted, 'exhausting');
  assert.equal(payload.forecastErrors[0].sourceEventId, '01DEBRIEF');
});

test('untyped events and no-shows write no outcome row; redelivery is a no-op', async () => {
  await projector.applyEvent(debriefEvent({ attended: true, again: 'yes' }));
  await projector.applyEvent(debriefEvent(
    { attended: false, noShowReason: 'nerves', eventTypeId: 'board-game-night' },
    { eventId: '01NOSHOW' },
  ));
  assert.equal(writes.find((w) => w.sk.startsWith('outcome#')), undefined);

  const typed = () => debriefEvent({
    attended: true, again: 'maybe', eventTypeId: 'trivia-night',
  }, { eventId: '01TYPED' });
  await projector.applyEvent(typed());
  const count = writes.length;
  await projector.applyEvent(typed());
  assert.equal(writes.length, count, 'redelivered record changes nothing');
  const payload = decryptValue(writes.findLast((w) => w.sk === 'outcome#trivia-night').model, dataKey);
  assert.deepEqual(payload.again, { yes: 0, maybe: 1, no: 0 });
  assert.equal(payload.lastAgain, 'maybe');
});

// ─── Avoidance (D49/D61): the newest word about a pair ───

test('avoid stamps the edge; a later positive tap clears it (newest word wins)', async () => {
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-1', met: true, seeAgain: false, avoid: 'do-not-interact' }],
  }));

  let edge = decryptValue(writes.findLast((w) => w.sk === 'affinity#other-1').model, dataKey);
  assert.equal(edge.avoid, 'do-not-interact');
  assert.equal(edge.avoidedAt, '2026-07-20T10:00:00.000Z');
  assert.equal(edge.sources.at(-1).avoid, 'do-not-interact', 'the act stays on the record');

  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-1', met: true, seeAgain: true }],
  }, { eventId: '01RECONNECT', aggregateId: 'interaction#abc#evt-10' }));

  edge = decryptValue(writes.findLast((w) => w.sk === 'affinity#other-1').model, dataKey);
  assert.equal(edge.avoid, undefined, 'a fresh tap is newer grounded word');
  assert.equal(edge.avoidedAt, undefined);
  assert.equal(edge.seeAgain, 1);
});

test('a later avoidance replaces an earlier tap\'s standing (both survive as history)', async () => {
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-1', met: true, seeAgain: true }],
  }));
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'other-1', met: true, seeAgain: false, avoid: 'didnt-click' }],
  }, { eventId: '01SOURED', aggregateId: 'interaction#abc#evt-10' }));

  const edge = decryptValue(writes.findLast((w) => w.sk === 'affinity#other-1').model, dataKey);
  assert.equal(edge.avoid, 'didnt-click');
  assert.equal(edge.seeAgain, 1, 'the historical tap count is never rewritten');
});

test('an avoided pair can never form or re-affirm a crew, either direction', async () => {
  // The exact mutual-strong triad from the formation test — except abc's
  // edge to p2 carries an avoid.
  seedEdge('abc', 'p1', { met: 3, seeAgain: 1 });
  seedEdge('abc', 'p2', { met: 3, seeAgain: 1, avoid: 'didnt-click' });
  seedEdge('p1', 'abc', { met: 3, seeAgain: 1 });
  seedEdge('p2', 'abc', { met: 3, seeAgain: 1 });
  seedEdge('p1', 'p2', { met: 3, seeAgain: 1 });
  seedEdge('p2', 'p1', { met: 3, seeAgain: 1 });

  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'p1', met: true, seeAgain: true }],
  }));

  assert.equal(writes.filter((w) => w.sk.startsWith('crew#')).length, 0,
    'a boost must never fight a de-weight — no crew through an avoided pair');
});

// ─── Crew detection (D47, spec v4) ───

// Pre-seed an encrypted edge row directly into the store mock.
function seedEdge(ownerId, otherId, payload) {
  writes.push({
    userId: ownerId,
    sk: `affinity#${otherId}`,
    model: encryptValue({ otherUserId: otherId, sources: [], ...payload }, dataKey),
    version: 1,
    lastEventId: 'SEED',
    asOf: '2026-07-01T00:00:00.000Z',
  });
}

test('a tap completing a triad of mutual-strong pairs forms a crew on all three partitions', async () => {
  // abc↔p1 and abc↔p2 both mutual-strong after this debrief; p1↔p2 too.
  seedEdge('abc', 'p1', { met: 2, seeAgain: 1 });   // becomes met 3 via this debrief
  seedEdge('abc', 'p2', { met: 2, seeAgain: 1 });
  seedEdge('p1', 'abc', { met: 2, seeAgain: 1 });
  seedEdge('p2', 'abc', { met: 2, seeAgain: 1 });
  seedEdge('p1', 'p2', { met: 2, seeAgain: 1 });
  seedEdge('p2', 'p1', { met: 2, seeAgain: 1 });

  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'p1', met: true, seeAgain: true }],
  }));

  const crewRows = writes.filter((w) => w.sk.startsWith('crew#'));
  assert.equal(crewRows.length, 3, 'crew written to every member partition');
  assert.deepEqual(crewRows.map((w) => w.userId).sort(), ['abc', 'p1', 'p2']);
  const crew = decryptValue(crewRows[0].model, dataKey);
  assert.deepEqual(crew.members, ['abc', 'p1', 'p2']);
  assert.equal(crew.affirmations, 1);
  assert.equal(crew.lastAffirmedAt, '2026-07-20T10:00:00.000Z');

  // Each member's copy stamps THEIR OWN lived-events counter (D60): the
  // debriefing member just lived one; the others have no stats yet.
  const byOwner = Object.fromEntries(crewRows.map((w) => [w.userId, decryptValue(w.model, dataKey)]));
  assert.equal(byOwner.abc.activityAtAffirmation, 1);
  assert.equal(byOwner.p1.activityAtAffirmation, 0);
  assert.equal(byOwner.p2.activityAtAffirmation, 0);
});

test('no crew when the third pair is not mutual-strong (one-sided or under the met pivot)', async () => {
  seedEdge('abc', 'p1', { met: 3, seeAgain: 1 });
  seedEdge('abc', 'p2', { met: 3, seeAgain: 1 });
  seedEdge('p1', 'abc', { met: 3, seeAgain: 1 });
  seedEdge('p2', 'abc', { met: 3, seeAgain: 1 });
  // p1↔p2: p2 never tapped back — the pair is one-sided.
  seedEdge('p1', 'p2', { met: 3, seeAgain: 1 });
  seedEdge('p2', 'p1', { met: 3, seeAgain: 0 });

  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'p1', met: true, seeAgain: true }],
  }));

  assert.equal(writes.filter((w) => w.sk.startsWith('crew#')).length, 0);
});

// ─── Envelope positions (D58): seed sanitization + shift repetition ───

function seedWithEnvelope(envelope) {
  return makeEvent({
    data: {
      userId: 'abc',
      transcript: encryptValue([], dataKey),
      extraction: encryptValue({ ...EXTRACTION, envelope }, dataKey),
    },
  });
}

function shiftDebrief(shiftToward, overrides = {}) {
  return debriefEvent({
    attended: true,
    again: 'yes',
    deltas: {
      envelopeUpdates: [{
        dimension: 'groupSize',
        observation: 'seemed at ease in the bigger room',
        direction: 'widen',
        confidence: 'medium',
        ...(shiftToward !== undefined ? { shiftToward } : {}),
      }],
      interestUpdates: [],
      barrierUpdates: [],
    },
  }, overrides);
}

async function coreEnvelope() {
  const core = writes.filter((w) => w.sk === 'profile#core').at(-1);
  return decryptValue(core.model, dataKey).envelope;
}

test('seed keeps valid positions/edges and drops unrecognised ones', async () => {
  await projector.applyEvent(seedWithEnvelope({
    groupSize: { comfort: 'small groups', position: 'small', provenance: 'stated' },
    structure: { comfort: 'likes a plan', position: 'sitting-down', provenance: 'inferred' },
    familiarity: { position: 'needs-known-face', edgeToward: 'easier-with-known-face' },
  }));

  const envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.position, 'small');
  assert.equal(envelope.structure.position, undefined, 'invalid position dropped');
  assert.equal(envelope.structure.comfort, 'likes a plan', 'story text survives');
  assert.equal(envelope.familiarity.position, 'needs-known-face');
  assert.equal(envelope.familiarity.edgeToward, undefined, 'middle is not a pole');
});

test('a position moves one step only when shifts repeat in the same direction', async () => {
  await projector.applyEvent(seedWithEnvelope({
    groupSize: { comfort: 'small groups', position: 'small', provenance: 'stated' },
  }));

  await projector.applyEvent(shiftDebrief('large', { eventId: '01SHIFT-1' }));
  let envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.position, 'small', 'one story never moves a position');
  assert.equal(envelope.groupSize.pendingShift, 'large');

  await projector.applyEvent(shiftDebrief('large', {
    eventId: '01SHIFT-2', aggregateId: 'interaction#abc#evt-10',
  }));
  envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.position, 'large');
  assert.equal(envelope.groupSize.positionProvenance, 'observed');
  assert.equal(envelope.groupSize.pendingShift, undefined, 'pending shift consumed');
});

test('a shift in the opposite direction resets the pending shift', async () => {
  await projector.applyEvent(seedWithEnvelope({
    groupSize: { position: 'small', provenance: 'stated' },
  }));

  await projector.applyEvent(shiftDebrief('large', { eventId: '01SHIFT-1' }));
  await projector.applyEvent(shiftDebrief('intimate', {
    eventId: '01SHIFT-2', aggregateId: 'interaction#abc#evt-10',
  }));
  const envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.position, 'small', 'direction change: no move');
  assert.equal(envelope.groupSize.pendingShift, 'intimate');
});

test('a dimension with no position adopts the repeated shift target directly', async () => {
  await projector.applyEvent(seedWithEnvelope({
    groupSize: { comfort: 'unsure', provenance: 'inferred' },
  }));

  await projector.applyEvent(shiftDebrief('large', { eventId: '01SHIFT-1' }));
  await projector.applyEvent(shiftDebrief('large', {
    eventId: '01SHIFT-2', aggregateId: 'interaction#abc#evt-10',
  }));
  const envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.position, 'large');
});

// ─── Member corrections (D59): precedence without counters or clocks ───

function correctionEvent(correction, overrides = {}) {
  return {
    aggregateId: 'user#abc',
    seq: 6,
    eventId: '01CORRECT',
    eventType: 'UserModelCorrected',
    simulatedTime: '2026-07-25T10:00:00.000Z',
    data: { userId: 'abc', ...encryptPii({ correction }, ['correction'], dataKey) },
    ...overrides,
  };
}

test('an envelope correction sets the position as corrected and clears any pending shift', async () => {
  await projector.applyEvent(seedWithEnvelope({
    groupSize: { position: 'large', provenance: 'inferred' },
  }));
  await projector.applyEvent(shiftDebrief('intimate', { eventId: '01SHIFT-1' }));

  await projector.applyEvent(correctionEvent({
    type: 'envelope', dimension: 'groupSize', position: 'small', edgeToward: 'large',
  }));

  const envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.position, 'small');
  assert.equal(envelope.groupSize.edgeToward, 'large');
  assert.equal(envelope.groupSize.positionProvenance, 'corrected');
  assert.equal(envelope.groupSize.correctedAt, '2026-07-25T10:00:00.000Z');
  assert.equal(envelope.groupSize.pendingShift, undefined);
});

test('a null edgeToward correction clears the growth edge', async () => {
  await projector.applyEvent(seedWithEnvelope({
    groupSize: { position: 'small', edgeToward: 'large', provenance: 'stated' },
  }));
  await projector.applyEvent(correctionEvent({
    type: 'envelope', dimension: 'groupSize', edgeToward: null,
  }));
  const envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.edgeToward, undefined);
  assert.equal(envelope.groupSize.position, 'small', 'position untouched');
});

test('evidence older than a correction never moves the position; later evidence resumes', async () => {
  await projector.applyEvent(seedWithEnvelope({
    groupSize: { position: 'large', provenance: 'inferred' },
  }));
  await projector.applyEvent(correctionEvent({
    type: 'envelope', dimension: 'groupSize', position: 'small',
  }));

  // Replayed/late evidence from BEFORE the correction: observations are
  // kept, but the corrected position stands — no counters, no clocks.
  await projector.applyEvent(shiftDebrief('large', {
    eventId: '01OLD-1', simulatedTime: '2026-07-20T10:00:00.000Z',
  }));
  await projector.applyEvent(shiftDebrief('large', {
    eventId: '01OLD-2', simulatedTime: '2026-07-21T10:00:00.000Z',
    aggregateId: 'interaction#abc#evt-10',
  }));
  let envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.position, 'small', 'older shifts are spent');
  assert.equal(envelope.groupSize.pendingShift, undefined);
  assert.equal(envelope.groupSize.observations.length, 2, 'stories still recorded');

  // New lived experience AFTER the correction moves it normally again.
  await projector.applyEvent(shiftDebrief('large', {
    eventId: '01NEW-1', simulatedTime: '2026-08-02T10:00:00.000Z',
    aggregateId: 'interaction#abc#evt-11',
  }));
  await projector.applyEvent(shiftDebrief('large', {
    eventId: '01NEW-2', simulatedTime: '2026-08-09T10:00:00.000Z',
    aggregateId: 'interaction#abc#evt-12',
  }));
  envelope = await coreEnvelope();
  assert.equal(envelope.groupSize.position, 'large', 'repeated later shifts move it');
  assert.equal(envelope.groupSize.positionProvenance, 'observed');
});

// ─── Structured constraints (D62): seed sanitization + corrections ───

test('seed keeps valid structured constraints, drops unrecognised, passes free text', async () => {
  await projector.applyEvent(makeEvent({
    data: {
      userId: 'abc',
      transcript: encryptValue([], dataKey),
      extraction: encryptValue({
        ...EXTRACTION,
        constraints: {
          maxTravel: 'on-island mostly',
          travelReach: 'nearby',
          localityAdjustments: { seattle: 'closer', atlantis: 'closer', poulsbo: 'sometimes' },
          timeWindows: ['weekday evenings'],
        },
      }, dataKey),
    },
  }));
  const core = decryptValue(writes.find((w) => w.sk === 'profile#core').model, dataKey);
  assert.equal(core.constraints.travelReach, 'nearby');
  assert.deepEqual(core.constraints.localityAdjustments, { seattle: 'closer' },
    'unknown locality and unknown feels dropped');
  assert.equal(core.constraints.maxTravel, 'on-island mostly', 'the story survives');
  assert.deepEqual(core.constraints.timeWindows, ['weekday evenings'],
    'legacy free-text windows pass through (never match a slug at consumption)');
});

test('constraint corrections: reach, locality adjustment, and windows — the member\'s word', async () => {
  await projector.applyEvent(makeEvent());

  await projector.applyEvent(correctionEvent({
    type: 'constraint', travelReach: 'here', localityId: 'seattle', feels: 'closer',
  }));
  let constraints = decryptValue(
    writes.filter((w) => w.sk === 'profile#core').at(-1).model, dataKey,
  ).constraints;
  assert.equal(constraints.travelReach, 'here');
  assert.deepEqual(constraints.localityAdjustments, { seattle: 'closer' });
  assert.equal(constraints.correctedAt, '2026-07-25T10:00:00.000Z');

  await projector.applyEvent(correctionEvent({
    type: 'constraint', travelReach: null, localityId: 'seattle', feels: null,
    addTimeWindow: 'weekend-daytime',
  }, { eventId: '01CORRECT-2' }));
  constraints = decryptValue(
    writes.filter((w) => w.sk === 'profile#core').at(-1).model, dataKey,
  ).constraints;
  assert.equal(constraints.travelReach, undefined, 'null clears back to anywhere');
  assert.equal(constraints.localityAdjustments, undefined, 'cleared adjustment map removed');
  assert.deepEqual(constraints.timeWindows.at(-1), 'weekend-daytime');
  assert.deepEqual(constraints.maxTravel, EXTRACTION.constraints.maxTravel, 'stories untouched');
});

test('an interest-add correction creates a corrected interest; removals delete rows', async () => {
  await projector.applyEvent(correctionEvent({ type: 'interest-add', tag: 'Chess Club' }));
  const interest = writes.find((w) => w.sk === 'interest#chess-club');
  assert.ok(interest, 'interest row written');
  const payload = decryptValue(interest.model, dataKey);
  assert.equal(payload.tag, 'Chess Club');
  assert.equal(payload.provenance, 'corrected');
  assert.equal(payload.correctedAt, '2026-07-25T10:00:00.000Z');

  await projector.applyEvent(correctionEvent(
    { type: 'interest-remove', tag: 'Chess Club' }, { eventId: '01CORRECT-2' },
  ));
  await projector.applyEvent(correctionEvent(
    { type: 'barrier-remove', what: 'walking into rooms of strangers' }, { eventId: '01CORRECT-3' },
  ));
  assert.deepEqual(deletes, [
    { userId: 'abc', sk: 'interest#chess-club' },
    { userId: 'abc', sk: 'barrier#walking-into-rooms-of-strangers' },
  ]);
});

test('re-detection re-affirms: lastAffirmedAt advances, affirmations count up', async () => {
  seedEdge('abc', 'p1', { met: 3, seeAgain: 2 });
  seedEdge('abc', 'p2', { met: 3, seeAgain: 1 });
  seedEdge('p1', 'abc', { met: 3, seeAgain: 1 });
  seedEdge('p2', 'abc', { met: 3, seeAgain: 1 });
  seedEdge('p1', 'p2', { met: 3, seeAgain: 1 });
  seedEdge('p2', 'p1', { met: 3, seeAgain: 1 });

  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'p1', met: true, seeAgain: true }],
  }));
  await projector.applyEvent(debriefEvent({
    attended: true, again: 'yes',
    people: [{ userId: 'p2', met: true, seeAgain: true }],
  }, { eventId: '01DEBRIEF-2', simulatedTime: '2026-08-01T10:00:00.000Z' }));

  const myCrew = writes.filter((w) => w.sk.startsWith('crew#') && w.userId === 'abc').at(-1);
  const crew = decryptValue(myCrew.model, dataKey);
  assert.equal(crew.affirmations, 2);
  assert.equal(crew.lastAffirmedAt, '2026-08-01T10:00:00.000Z');
  assert.equal(crew.formedAt, '2026-07-20T10:00:00.000Z');
});
