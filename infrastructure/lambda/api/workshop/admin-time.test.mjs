// Specifications for POST /admin/time.
//
// Workshop-only admin endpoint. Computes a new workshop-time offset based on
// the requested action and emits a WorkshopTimeAdvanced event on the
// system#workshop-time aggregate. The seq is the next one after the current
// state row's seq (0 + 1 = 1 on first invocation).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAdvanceTimeHandler } from './admin-time.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims, body } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  };
}

const adminClaims = { sub: 'admin-1', 'custom:role': 'admin', email: 'admin@x.test' };

let runner, getOffset, handler;
let runCommandResult;
let currentState;

beforeEach(() => {
  runCommandResult = { cached: false, events: [], result: { offsetMs: 0, description: 'real time' } };
  currentState = { offsetMs: 0, description: 'real time', updatedAt: null, seq: 0 };
  runner = { runCommand: spy(async () => runCommandResult) };
  getOffset = spy(async () => currentState);
  handler = createAdvanceTimeHandler({ runner, getOffset });
});

// ─── action: advance ───

test('action=advance with hours adds (hours * 3600000) ms to the current offset', async () => {
  currentState = { offsetMs: 1000, description: 'x', updatedAt: null, seq: 1 };
  getOffset = spy(async () => currentState);
  handler = createAdvanceTimeHandler({ runner, getOffset });

  await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'advance', hours: 2 },
  }));

  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.action, 'advance');
  assert.equal(args.events[0].data.newOffsetMs, 1000 + 2 * 3600000);
});

test('action=advance with days adds (days * 86400000) ms to the current offset', async () => {
  await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'advance', days: 1 },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.newOffsetMs, 86400000);
});

test('action=advance with both hours and days sums them', async () => {
  await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'advance', hours: 3, days: 1 },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.newOffsetMs, 86400000 + 3 * 3600000);
});

test('action=advance without hours or days returns 400', async () => {
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'advance' },
  }));
  assert.equal(response.statusCode, 400);
  assert.equal(runner.runCommand.calls.length, 0);
});

// ─── action: reset ───

test('action=reset sets newOffsetMs to 0 regardless of current offset', async () => {
  currentState = { offsetMs: 99999, description: 'x', updatedAt: null, seq: 5 };
  getOffset = spy(async () => currentState);
  handler = createAdvanceTimeHandler({ runner, getOffset });

  await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'reset' },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.action, 'reset');
  assert.equal(args.events[0].data.newOffsetMs, 0);
});

// ─── action: set ───

test('action=set computes offset as (datetime - now)', async () => {
  // Pick a datetime ~2h in the future
  const futureMs = Date.now() + 2 * 3600000;
  const datetime = new Date(futureMs).toISOString();

  await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'set', datetime },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.action, 'set');
  // The handler computes (target - Date.now()); Date.now() advances slightly between
  // request creation and handler execution, so accept a small tolerance.
  const offset = args.events[0].data.newOffsetMs;
  assert.ok(Math.abs(offset - 2 * 3600000) < 5000, `offset ${offset} not within 5s of 2h`);
});

test('action=set without datetime returns 400', async () => {
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'set' },
  }));
  assert.equal(response.statusCode, 400);
});

test('action=set with invalid datetime returns 400', async () => {
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'set', datetime: 'not-a-date' },
  }));
  assert.equal(response.statusCode, 400);
});

// ─── Sequence + aggregate ───

test('seq is current seq + 1; first invocation produces seq=1', async () => {
  await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'reset' },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.aggregateId, 'system#workshop-time');
  assert.equal(args.events[0].seq, 1);
});

test('seq increments off the current state row', async () => {
  currentState = { offsetMs: 100, description: 'x', updatedAt: null, seq: 7 };
  getOffset = spy(async () => currentState);
  handler = createAdvanceTimeHandler({ runner, getOffset });

  await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'reset' },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].seq, 8);
});

// ─── Response codes ───

test('returns 201 with new offset and description on success', async () => {
  runCommandResult = {
    cached: false,
    events: [],
    result: { offsetMs: 0, description: 'real time' },
  };
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'reset' },
  }));
  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.offsetMs, 0);
  assert.equal(body.description, 'real time');
});

test('returns 200 (not 201) on cached retry', async () => {
  runCommandResult = {
    cached: true,
    events: [],
    result: { offsetMs: 7200000, description: 'advanced 2h' },
  };
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'advance', hours: 2 },
  }));
  assert.equal(response.statusCode, 200);
});

// ─── Auth ───

test('returns 401 without JWT claims', async () => {
  const response = await handler({
    body: JSON.stringify({ commandId: 'cmd-1', action: 'reset' }),
  });
  assert.equal(response.statusCode, 401);
});

test('returns 403 when claims do not include custom:role=admin', async () => {
  const response = await handler(makeEvent({
    claims: { sub: 'user-1', email: 'u@x.test' },
    body: { commandId: 'cmd-1', action: 'reset' },
  }));
  assert.equal(response.statusCode, 403);
});

// ─── Body validation ───

test('returns 400 when commandId is missing', async () => {
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: { action: 'reset' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when action is invalid', async () => {
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'bogus' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when the body is not valid JSON', async () => {
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: 'not-json',
  }));
  assert.equal(response.statusCode, 400);
});

// ─── Actor identity ───

test('actorId is the admin user (user#sub)', async () => {
  await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', action: 'reset' },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.actorId, `user#${adminClaims.sub}`);
});
