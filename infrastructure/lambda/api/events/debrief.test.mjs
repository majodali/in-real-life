// Specifications for POST /events/:eventId/debrief — the tiered debrief
// (docs/debrief.md). Tier 0–1 deterministic; Tier 2 extraction only on
// free text; people step via opaque refs; conduct quarantine.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSubmitDebriefHandler } from './debrief.mjs';
import { attendeeRef } from './attendees.mjs';
import { createStubLlmProvider, STUB_DEBRIEF_EXTRACTION } from '../lib/llm.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims, body, eventId = 'evt-1' } = {}) {
  return {
    pathParams: { eventId },
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  };
}

const validClaims = { sub: 'user-me', email: 'me@x.y' };
const ROSTER_KEY = Buffer.alloc(32, 9).toString('base64');
const PAST = '2020-01-01T10:00:00.000Z';
const PAST_END = '2020-01-01T12:00:00.000Z';

let runner, llm, eventRow, interactionRow, rosterRows, handler;

function build(overrides = {}) {
  const client = {
    send: spy(async (cmd) => {
      if (cmd.input.IndexName === 'event-user-index') return { Items: rosterRows };
      const tn = cmd.input.TableName;
      if (tn.startsWith('irl-events')) return eventRow ? { Item: eventRow } : {};
      if (tn.startsWith('irl-interactions')) return interactionRow ? { Item: interactionRow } : {};
      return {};
    }),
  };
  return createSubmitDebriefHandler({
    runner,
    client,
    eventsTable: 'irl-events-test',
    interactionsTable: 'irl-interactions-test',
    getOffset: async () => ({ offsetMs: 0 }),
    llm,
    keyStore: { getOrCreateKey: async () => ROSTER_KEY },
    ...overrides,
  });
}

beforeEach(() => {
  runner = { runCommand: spy(async ({ result }) => ({ cached: false, events: [], result })) };
  llm = createStubLlmProvider();
  eventRow = {
    eventId: 'evt-1', title: 'Community dinner', lifecycleState: 'planned',
    startTime: PAST, endTime: PAST_END, location: 'Hall',
  };
  interactionRow = { userId: 'user-me', eventId: 'evt-1', level: 'confirmed', seq: 2 };
  rosterRows = [
    { userId: 'user-me', eventId: 'evt-1', level: 'confirmed', userName: 'Mat' },
    { userId: 'user-p', eventId: 'evt-1', level: 'confirmed', userName: 'Priya' },
    { userId: 'user-q', eventId: 'evt-1', level: 'interested', userName: 'Quinn' },
  ];
  handler = build();
});

const refOf = (userId) => attendeeRef(userId, ROSTER_KEY);

// ─── Tier 0–1: deterministic, no LLM ───

test('tap-only debrief emits DebriefSubmitted with no model call and no deltas', async () => {
  llm = { complete: spy(async () => { throw new Error('should not be called'); }) };
  handler = build();

  const res = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c1', attended: true, again: 'yes', outcomeTexture: ['great-company'] },
  }));

  assert.equal(res.statusCode, 201);
  assert.equal(llm.complete.calls.length, 0);
  const [input] = runner.runCommand.calls[0];
  assert.equal(input.aggregateId, 'interaction#user-me#evt-1');
  const data = input.events[0].data;
  assert.equal(data.attended, true);
  assert.equal(data.again, 'yes');
  assert.deepEqual(data.outcomeTexture, ['great-company']);
  assert.equal('deltas' in data, false);
  assert.equal(input.events[0].seq, 3);
});

test('no-show path captures the light reason and skips preference fields', async () => {
  const res = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c1', attended: false, noShowReason: 'nerves' },
  }));
  assert.equal(res.statusCode, 201);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.attended, false);
  assert.equal(data.noShowReason, 'nerves');
  assert.equal('again' in data, false);
});

// ─── People step: opaque refs resolved server-side ───

test('people refs resolve to userIds server-side; self-taps dropped', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', attended: true, again: 'yes',
      people: [
        { ref: refOf('user-p'), seeAgain: true },
        { ref: refOf('user-q') },
        { ref: refOf('user-me'), seeAgain: true }, // self — dropped
      ],
    },
  }));
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(data.people, [
    { userId: 'user-p', met: true, seeAgain: true },
    { userId: 'user-q', met: true, seeAgain: false },
  ]);
});

test('unknown attendee ref is a 400', async () => {
  const res = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c1', attended: true, again: 'yes', people: [{ ref: 'deadbeefdeadbeef' }] },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /unknown attendee ref/);
});

// ─── Avoidance capture (D49/D61): tucked-away, typed, never a rating ───

test('avoid rides on the resolved people entry, both tiers', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', attended: true, again: 'yes',
      people: [
        { ref: refOf('user-p'), avoid: 'didnt-click' },
        { ref: refOf('user-q'), avoid: 'do-not-interact' },
      ],
    },
  }));
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(data.people, [
    { userId: 'user-p', met: true, seeAgain: false, avoid: 'didnt-click' },
    { userId: 'user-q', met: true, seeAgain: false, avoid: 'do-not-interact' },
  ]);
});

test('avoid vocabulary is closed and contradicts seeAgain', async () => {
  const bad = await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', attended: true, again: 'yes',
      people: [{ ref: refOf('user-p'), avoid: 'hate' }],
    },
  }));
  assert.equal(bad.statusCode, 400);
  assert.match(JSON.parse(bad.body).error, /didnt-click or do-not-interact/);

  const contradictory = await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c2', attended: true, again: 'yes',
      people: [{ ref: refOf('user-p'), seeAgain: true, avoid: 'didnt-click' }],
    },
  }));
  assert.equal(contradictory.statusCode, 400);
  assert.match(JSON.parse(contradictory.body).error, /contradictory/);
});

// ─── Tier 2: extraction only on free text ───

test('free text triggers exactly one extraction call; deltas ride in the event', async () => {
  const seen = [];
  llm = { complete: spy(async (req) => { seen.push(req); return structuredClone(STUB_DEBRIEF_EXTRACTION); }) };
  handler = build();

  await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', attended: true, again: 'yes',
      surprise: 'figured it would be too much, but the food helped',
    },
  }));

  assert.equal(llm.complete.calls.length, 1);
  assert.equal(seen[0].task, 'debrief-extraction');
  assert.match(seen[0].messages[0].content, /Community dinner/);
  assert.match(seen[0].messages[0].content, /SURPRISE: figured/);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(data.deltas, STUB_DEBRIEF_EXTRACTION);
});

// ─── Conduct quarantine (open-risks #11) ───

test('conductConcern suppresses every preference field but keeps attendance', async () => {
  llm = { complete: spy(async () => { throw new Error('quarantine must skip extraction'); }) };
  handler = build();

  const res = await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', attended: true, again: 'yes',
      outcomeTexture: ['too-big'],
      people: [{ ref: refOf('user-p'), seeAgain: true }],
      reflection: 'someone made me uncomfortable',
      conductConcern: true, conductNote: 'details for the safety team',
    },
  }));

  assert.equal(res.statusCode, 201);
  assert.equal(llm.complete.calls.length, 0);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(Object.keys(data).sort(),
    ['attended', 'conductConcern', 'conductNote', 'eventId', 'suppressed', 'userId']);
  assert.equal(data.attended, true);
  assert.equal(JSON.parse(res.body).conductAcknowledged, true);
});

// ─── Validation + eligibility ───

test('validation: attended required; again required when attended (unless quarantined)', async () => {
  let res = await handler(makeEvent({ claims: validClaims, body: { commandId: 'c1' } }));
  assert.equal(res.statusCode, 400);
  res = await handler(makeEvent({ claims: validClaims, body: { commandId: 'c1', attended: true } }));
  assert.equal(res.statusCode, 400);
  res = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c1', attended: true, conductConcern: true },
  }));
  assert.equal(res.statusCode, 201, 'quarantined debrief needs no again');
});

test('eligibility unchanged: 401 / 404 / not-over 409 / non-confirmed 409 / cancelled 409', async () => {
  assert.equal((await handler(makeEvent({ body: { commandId: 'c' } }))).statusCode, 401);

  eventRow = null;
  assert.equal((await handler(makeEvent({
    claims: validClaims, body: { commandId: 'c', attended: true, again: 'yes' },
  }))).statusCode, 404);

  eventRow = {
    eventId: 'evt-1', title: 'T', lifecycleState: 'planned',
    startTime: '2099-01-01T10:00:00Z', endTime: '2099-01-01T12:00:00Z', location: 'x',
  };
  assert.equal((await handler(makeEvent({
    claims: validClaims, body: { commandId: 'c', attended: true, again: 'yes' },
  }))).statusCode, 409, 'not over yet');

  eventRow = {
    eventId: 'evt-1', title: 'T', lifecycleState: 'planned',
    startTime: PAST, endTime: PAST_END, location: 'x',
  };
  interactionRow = { userId: 'user-me', eventId: 'evt-1', level: 'interested', seq: 1 };
  assert.equal((await handler(makeEvent({
    claims: validClaims, body: { commandId: 'c', attended: true, again: 'yes' },
  }))).statusCode, 409, 'only confirmed attendees');

  eventRow = { ...eventRow, lifecycleState: 'cancelled' };
  interactionRow = { userId: 'user-me', eventId: 'evt-1', level: 'confirmed', seq: 1 };
  assert.equal((await handler(makeEvent({
    claims: validClaims, body: { commandId: 'c', attended: true, again: 'yes' },
  }))).statusCode, 409, 'cancelled');
});

// ─── Interactive Tier-2 follow-up (one invited question) ───

test('an answered follow-up triggers extraction and rides in the event', async () => {
  const seen = [];
  llm = { complete: spy(async (req) => { seen.push(req); return structuredClone(STUB_DEBRIEF_EXTRACTION); }) };
  handler = build();

  const res = await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', attended: true, again: 'maybe',
      followUp: { question: 'What would’ve made it easier?', answer: ' if I’d had a job to do ' },
    },
  }));

  assert.equal(res.statusCode, 201);
  assert.equal(llm.complete.calls.length, 1);
  assert.match(seen[0].messages[0].content, /FOLLOW-UP ASKED: What would/);
  assert.match(seen[0].messages[0].content, /FOLLOW-UP ANSWER: if I/);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(data.followUp, {
    question: 'What would’ve made it easier?',
    answer: 'if I’d had a job to do',
  });
  assert.deepEqual(data.deltas, STUB_DEBRIEF_EXTRACTION);
});

test('a skipped follow-up (blank answer) is dropped — no extraction, no field', async () => {
  llm = { complete: spy(async () => { throw new Error('no call expected'); }) };
  handler = build();

  const res = await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', attended: true, again: 'maybe',
      followUp: { question: 'What would’ve made it easier?', answer: '   ' },
    },
  }));

  assert.equal(res.statusCode, 201);
  assert.equal(llm.complete.calls.length, 0);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal('followUp' in data, false);
  assert.equal('deltas' in data, false);
});

test('malformed followUp shapes are 400', async () => {
  for (const followUp of ['text', { answer: 'x' }, { question: '', answer: 'x' }, { question: 'q' }]) {
    const res = await handler(makeEvent({
      claims: validClaims,
      body: { commandId: 'c1', attended: true, again: 'maybe', followUp },
    }));
    assert.equal(res.statusCode, 400, JSON.stringify(followUp));
  }
});

test('quarantine still suppresses a follow-up answer', async () => {
  const res = await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', attended: true, conductConcern: true,
      followUp: { question: 'q', answer: 'a' },
    },
  }));
  assert.equal(res.statusCode, 201);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal('followUp' in data, false);
});
