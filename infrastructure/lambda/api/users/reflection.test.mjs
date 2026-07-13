// Specifications for POST /me/reflection/turn and POST /me/reflection
// (docs/reflection-and-coaching.md, docs/reflection-prompt.md).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReflectionTurnHandler,
  createCompleteReflectionHandler,
} from './reflection.mjs';
import { createStubLlmProvider, STUB_DEBRIEF_EXTRACTION } from '../lib/llm.mjs';
import { projectReflectionRecorded } from './projections.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims, body } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    body: JSON.stringify(body ?? {}),
  };
}

const validClaims = { sub: 'abc', email: 'a@b.c', email_verified: 'true' };

let userRow, eventRow, interactionRow, client, llm, runner;

function buildClient() {
  return {
    send: spy(async (cmd) => {
      const tn = cmd.input.TableName;
      if (tn === 'users-t') return userRow ? { Item: userRow } : {};
      if (tn === 'events-t') return eventRow ? { Item: eventRow } : {};
      if (tn === 'interactions-t') return interactionRow ? { Item: interactionRow } : {};
      throw new Error(`unexpected table ${tn}`);
    }),
  };
}

function turnHandler(overrides = {}) {
  return createReflectionTurnHandler({
    client,
    usersTable: 'users-t',
    eventsTable: 'events-t',
    interactionsTable: 'interactions-t',
    llm,
    ...overrides,
  });
}

function closeHandler(overrides = {}) {
  return createCompleteReflectionHandler({
    runner,
    client,
    usersTable: 'users-t',
    interactionsTable: 'interactions-t',
    llm,
    ...overrides,
  });
}

beforeEach(() => {
  userRow = { userId: 'abc', seq: 4, name: 'Mat', offeredPerspectives: [] };
  eventRow = { eventId: 'evt-1', title: 'Community dinner' };
  interactionRow = {
    userId: 'abc', eventId: 'evt-1', level: 'confirmed', seq: 3,
    debrief: { attended: true, again: 'maybe', submittedAt: '2026-07-20T10:00:00Z' },
  };
  client = buildClient();
  llm = createStubLlmProvider();
  runner = { runCommand: spy(async ({ result }) => ({ cached: false, events: [], result })) };
});

// ─── Turn loop ───

test('first turn opens the space; context carries debrief summary and cap state', async () => {
  const seen = [];
  llm = { complete: spy(async (req) => { seen.push(req); return createStubLlmProvider().complete(req); }) };

  const res = await turnHandler()(makeEvent({
    claims: validClaims, body: { eventId: 'evt-1', transcript: [] },
  }));

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.done, false);
  assert.equal(typeof body.message, 'string');

  const [req] = seen;
  assert.equal(req.task, 'reflection-turn');
  assert.match(req.system, /Listen more than you talk/);
  assert.match(req.messages[0].content, /EVENT: Community dinner/);
  assert.match(req.messages[0].content, /worth another go=maybe/);
  assert.match(req.messages[0].content, /ALREADY OFFERED \(never repeat\): none/);
  assert.match(req.messages[0].content, /repetition-over-chemistry/);
});

test('a driven loop reaches done', async () => {
  const transcript = [
    { role: 'us', text: 'q1' }, { role: 'member', text: 'a1' },
    { role: 'us', text: 'q2' }, { role: 'member', text: 'a2' },
  ];
  const res = await turnHandler()(makeEvent({
    claims: validClaims, body: { eventId: 'evt-1', transcript },
  }));
  assert.equal(JSON.parse(res.body).done, true);
});

test('already-offered perspectives are excluded from context and a repeat is malformed', async () => {
  userRow = { ...userRow, offeredPerspectives: ['side-by-side', 'side-by-side'] };
  const seen = [];
  const bad = { message: 'try this', done: false, perspectiveOffered: 'side-by-side' };
  const good = { message: 'what stayed with you?', done: false, perspectiveOffered: 'none' };
  const outputs = [bad, good];
  llm = { complete: spy(async (req) => { seen.push(req); return outputs.shift(); }) };

  const res = await turnHandler()(makeEvent({
    claims: validClaims, body: { eventId: 'evt-1', transcript: [] },
  }));

  assert.match(seen[0].messages[0].content, /ALREADY OFFERED \(never repeat\): side-by-side/);
  assert.doesNotMatch(seen[0].messages[0].content, /AVAILABLE PERSPECTIVES:[\s\S]*  side-by-side:/);
  assert.equal(llm.complete.calls.length, 2, 'repeat treated as malformed → one retry');
  assert.deepEqual(JSON.parse(res.body), good);
});

test('two malformed turns fall back to a templated close', async () => {
  llm = { complete: spy(async () => ({ message: '', done: false, perspectiveOffered: 'none' })) };
  const res = await turnHandler()(makeEvent({
    claims: validClaims, body: { eventId: 'evt-1', transcript: [] },
  }));
  const body = JSON.parse(res.body);
  assert.equal(body.done, true);
  assert.ok(body.message.length > 0);
});

test('turn requires a debrief on the event (the door opens from the debrief)', async () => {
  interactionRow = { userId: 'abc', eventId: 'evt-1', level: 'confirmed', seq: 2 };
  const res = await turnHandler()(makeEvent({
    claims: validClaims, body: { eventId: 'evt-1', transcript: [] },
  }));
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /opens from a debrief/);
});

// ─── Close ───

test('close extracts deltas and emits ReflectionRecorded at the next user seq', async () => {
  const transcript = [
    { role: 'us', text: 'what stayed with you?' },
    { role: 'member', text: 'honestly the big table was fine once we were cooking' },
  ];
  const res = await closeHandler()(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', eventId: 'evt-1', transcript,
      perspectivesOffered: ['barriers-are-situational'],
      processFeedback: [' the suggestion came too late '],
      organizerFeedback: { text: 'great pacing', sharing: 'anonymous' },
    },
  }));

  assert.equal(res.statusCode, 201);
  const [input] = runner.runCommand.calls[0];
  assert.equal(input.aggregateId, 'user#abc');
  const ev = input.events[0];
  assert.equal(ev.eventType, 'ReflectionRecorded');
  assert.equal(ev.seq, 5);
  assert.deepEqual(ev.data.deltas, STUB_DEBRIEF_EXTRACTION);
  assert.deepEqual(ev.data.perspectivesOffered, ['barriers-are-situational']);
  assert.deepEqual(ev.data.processFeedback, ['the suggestion came too late']);
  assert.deepEqual(ev.data.organizerFeedback, { text: 'great pacing', sharing: 'anonymous' });
});

test('close on a conduct-quarantined debrief records transcript only — no extraction', async () => {
  interactionRow = {
    ...interactionRow,
    debrief: { attended: true, conductConcern: true, submittedAt: '2026-07-20T10:00:00Z' },
  };
  llm = { complete: spy(async () => { throw new Error('must not extract'); }) };

  const res = await closeHandler()(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'c1', eventId: 'evt-1',
      transcript: [{ role: 'member', text: 'processing it' }],
    },
  }));

  assert.equal(res.statusCode, 201);
  assert.equal(llm.complete.calls.length, 0);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.suppressed, true);
  assert.equal('deltas' in data, false);
});

test('close validation: unknown perspectives, bad feedback shapes, missing debrief', async () => {
  let res = await closeHandler()(makeEvent({
    claims: validClaims,
    body: { commandId: 'c', eventId: 'evt-1', transcript: [{ role: 'member', text: 'x' }], perspectivesOffered: ['made-up'] },
  }));
  assert.equal(res.statusCode, 400);

  res = await closeHandler()(makeEvent({
    claims: validClaims,
    body: { commandId: 'c', eventId: 'evt-1', transcript: [{ role: 'member', text: 'x' }], organizerFeedback: { text: 'hi', sharing: 'broadcast' } },
  }));
  assert.equal(res.statusCode, 400);

  interactionRow = null;
  res = await closeHandler()(makeEvent({
    claims: validClaims,
    body: { commandId: 'c', eventId: 'evt-1', transcript: [{ role: 'member', text: 'x' }] },
  }));
  assert.equal(res.statusCode, 409);
});

// ─── Projection: the coaching cap record ───

test('projectReflectionRecorded bumps seq and appends offered perspectives', () => {
  const write = projectReflectionRecorded({
    seq: 5,
    wallTime: '2026-07-21T10:00:00.000Z',
    data: { userId: 'abc', eventId: 'evt-1', perspectivesOffered: ['we-mispredict'] },
  }, { usersTable: 'users-t' });

  const u = write.Update;
  assert.match(u.UpdateExpression, /offeredPerspectives = list_append/);
  assert.deepEqual(u.ExpressionAttributeValues[':new'], ['we-mispredict']);
  assert.equal(u.ExpressionAttributeValues[':seq'], 5);
  assert.equal(u.ExpressionAttributeValues[':expectedSeq'], 4);
});
