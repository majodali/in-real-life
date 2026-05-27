// Specifications for PUT /events/:eventId/interaction and
// DELETE /events/:eventId/interaction.
//
// The set-level handler reads the current interaction state row, computes
// previousLevel, and emits the right event (InterestExpressed /
// AttendanceConfirmed) on interaction#<userId>#<eventId>. The withdraw
// handler emits AttendanceWithdrawn — or 200 no-op if there's nothing to
// withdraw.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSetInteractionHandler,
  createWithdrawInteractionHandler,
} from './interaction.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims, body, pathParams } = {}) {
  return {
    pathParams: pathParams ?? { eventId: 'evt-1' },
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  };
}

const validClaims = { sub: 'user-a', email: 'a@b.c' };
const validBody = { commandId: 'cmd-1', level: 'interested' };

let runner, client, handler, withdrawHandler;
let eventRow, interactionRow;

beforeEach(() => {
  eventRow = { eventId: 'evt-1', seq: 1, lifecycleState: 'proposed' };
  interactionRow = null;
  client = {
    send: spy(async (cmd) => {
      const tn = cmd.input.TableName;
      const key = cmd.input.Key || {};
      if (tn.startsWith('irl-events') && key.eventId === 'evt-1') return { Item: eventRow };
      if (tn.startsWith('irl-interactions') && key.userId === 'user-a') {
        return { Item: interactionRow };
      }
      return { Item: null };
    }),
  };
  runner = {
    runCommand: spy(async ({ result }) => ({ cached: false, events: [], result })),
  };
  handler = createSetInteractionHandler({
    runner, client,
    eventsTable: 'irl-events-test',
    interactionsTable: 'irl-interactions-test',
  });
  withdrawHandler = createWithdrawInteractionHandler({
    runner, client,
    eventsTable: 'irl-events-test',
    interactionsTable: 'irl-interactions-test',
  });
});

// ─── Auth / validation ───

test('PUT: 401 when no claims', async () => {
  const res = await handler(makeEvent({ body: validBody }));
  assert.equal(res.statusCode, 401);
});

test('PUT: 400 when commandId missing', async () => {
  const res = await handler(makeEvent({ claims: validClaims, body: { level: 'interested' } }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /commandId/);
});

test('PUT: 400 when level is not interested or confirmed', async () => {
  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'c', level: 'going' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /level/);
});

test('PUT: 404 when event row is missing', async () => {
  eventRow = null;
  const res = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(res.statusCode, 404);
});

// ─── Set level: happy paths ───

test('PUT level=interested first time: emits InterestExpressed with previousLevel=null', async () => {
  const res = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(res.statusCode, 201);

  const [args] = runner.runCommand.calls[0];
  assert.equal(args.commandId, 'cmd-1');
  assert.equal(args.aggregateId, 'interaction#user-a#evt-1');
  assert.equal(args.actorId, 'user#user-a');
  assert.equal(args.events[0].eventType, 'InterestExpressed');
  assert.equal(args.events[0].seq, 1);
  assert.equal(args.events[0].data.previousLevel, null);
  assert.equal(args.events[0].data.userId, 'user-a');
  assert.equal(args.events[0].data.eventId, 'evt-1');
});

test('PUT level=interested when already interested: 200 no-op, no event emitted', async () => {
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'interested', seq: 1 };
  const res = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(res.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('PUT level=confirmed first time: emits AttendanceConfirmed with previousLevel=null', async () => {
  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].eventType, 'AttendanceConfirmed');
  assert.equal(args.events[0].data.previousLevel, null);
});

test('PUT level=confirmed after interested: emits AttendanceConfirmed with previousLevel=interested, seq=2', async () => {
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'interested', seq: 1 };
  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].seq, 2);
  assert.equal(args.events[0].data.previousLevel, 'interested');
});

test('PUT downgrade confirmed → interested: previousLevel=confirmed', async () => {
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'confirmed', seq: 1 };
  await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'interested' },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].eventType, 'InterestExpressed');
  assert.equal(args.events[0].data.previousLevel, 'confirmed');
  assert.equal(args.events[0].seq, 2);
});

test('PUT stamps userName from claims (email-prefix fallback)', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.userName, 'a');
});

test('PUT accepts userName from body when provided', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: { ...validBody, userName: 'Alex' },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.userName, 'Alex');
});

// ─── Withdraw ───

test('DELETE: 401 when no claims', async () => {
  const res = await withdrawHandler(makeEvent({ body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 401);
});

test('DELETE: 400 when commandId missing', async () => {
  const res = await withdrawHandler(makeEvent({ claims: validClaims, body: {} }));
  assert.equal(res.statusCode, 400);
});

test('DELETE: 200 no-op when nothing to withdraw', async () => {
  const res = await withdrawHandler(makeEvent({ claims: validClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('DELETE from interested: emits AttendanceWithdrawn seq=2 previousLevel=interested', async () => {
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'interested', seq: 1 };
  const res = await withdrawHandler(makeEvent({ claims: validClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.aggregateId, 'interaction#user-a#evt-1');
  assert.equal(args.events[0].eventType, 'AttendanceWithdrawn');
  assert.equal(args.events[0].seq, 2);
  assert.equal(args.events[0].data.previousLevel, 'interested');
});

test('DELETE from confirmed: previousLevel=confirmed', async () => {
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'confirmed', seq: 1 };
  await withdrawHandler(makeEvent({ claims: validClaims, body: { commandId: 'c' } }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.previousLevel, 'confirmed');
});
