// Specifications for the three lifecycle endpoints:
//   PUT /events/:id/schedule
//   PUT /events/:id/cancel
//   PUT /events/:id/auto-plan
//
// All three are organizer-only. Schedule and auto-plan require the event
// to still be proposed; cancel works from any non-cancelled state.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createScheduleEventHandler,
  createCancelEventHandler,
  createAutoPlanHandler,
} from './lifecycle.mjs';

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

const organizerClaims = { sub: 'organizer-1', email: 'org@example.test' };
const otherClaims = { sub: 'other-1', email: 'other@example.test' };

let runner, client, eventRow;
let schedule, cancel, autoPlan;

beforeEach(() => {
  eventRow = {
    eventId: 'evt-1',
    seq: 1,
    organizerId: 'organizer-1',
    lifecycleState: 'proposed',
    autoPlanOnThreshold: false,
  };
  client = {
    send: spy(async () => ({ Item: eventRow })),
  };
  runner = {
    runCommand: spy(async ({ result }) => ({ cached: false, events: [], result })),
  };
  schedule = createScheduleEventHandler({ runner, client, eventsTable: 'irl-events-test' });
  cancel = createCancelEventHandler({ runner, client, eventsTable: 'irl-events-test' });
  autoPlan = createAutoPlanHandler({ runner, client, eventsTable: 'irl-events-test' });
});

// ─── Schedule ───

test('schedule: 401 when no claims', async () => {
  const res = await schedule(makeEvent({ body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 401);
});

test('schedule: 403 when caller is not the organizer', async () => {
  const res = await schedule(makeEvent({ claims: otherClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 403);
});

test('schedule: 404 when event row missing', async () => {
  eventRow = null;
  const res = await schedule(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 404);
});

test('schedule: 409 when event not in proposed state', async () => {
  eventRow.lifecycleState = 'planned';
  const res = await schedule(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 409);
});

test('schedule: 400 when commandId missing', async () => {
  const res = await schedule(makeEvent({ claims: organizerClaims, body: {} }));
  assert.equal(res.statusCode, 400);
});

test('schedule: emits EventScheduled with scheduledBy=organizer, autoTriggered=false', async () => {
  const res = await schedule(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.aggregateId, 'event#evt-1');
  assert.equal(args.events[0].eventType, 'EventScheduled');
  assert.equal(args.events[0].seq, 2);
  assert.equal(args.events[0].data.scheduledBy, 'organizer');
  assert.equal(args.events[0].data.autoTriggered, false);
});

// ─── Cancel ───

test('cancel: 401 when no claims', async () => {
  const res = await cancel(makeEvent({ body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 401);
});

test('cancel: 403 when caller is not the organizer', async () => {
  const res = await cancel(makeEvent({ claims: otherClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 403);
});

test('cancel: 409 if already cancelled', async () => {
  eventRow.lifecycleState = 'cancelled';
  const res = await cancel(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 409);
});

test('cancel: works from proposed', async () => {
  const res = await cancel(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].eventType, 'EventCancelled');
  assert.equal(args.events[0].data.cancelledBy, 'organizer');
});

test('cancel: works from planned', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.seq = 2;
  const res = await cancel(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].seq, 3);
});

test('cancel: passes reason through when provided', async () => {
  await cancel(makeEvent({
    claims: organizerClaims,
    body: { commandId: 'c', reason: 'Not enough interest' },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.reason, 'Not enough interest');
});

test('cancel: caps reason at 200 chars', async () => {
  const long = 'x'.repeat(500);
  await cancel(makeEvent({
    claims: organizerClaims,
    body: { commandId: 'c', reason: long },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].data.reason.length, 200);
});

// ─── Auto-plan ───

test('auto-plan: 403 when caller is not the organizer', async () => {
  const res = await autoPlan(makeEvent({
    claims: otherClaims, body: { commandId: 'c', autoPlanOnThreshold: true },
  }));
  assert.equal(res.statusCode, 403);
});

test('auto-plan: 409 when event not proposed', async () => {
  eventRow.lifecycleState = 'planned';
  const res = await autoPlan(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', autoPlanOnThreshold: true },
  }));
  assert.equal(res.statusCode, 409);
});

test('auto-plan: 400 when autoPlanOnThreshold not a boolean', async () => {
  const res = await autoPlan(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', autoPlanOnThreshold: 'yes' },
  }));
  assert.equal(res.statusCode, 400);
});

test('auto-plan: emits EventAutoPlanSettingChanged', async () => {
  const res = await autoPlan(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', autoPlanOnThreshold: true },
  }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].eventType, 'EventAutoPlanSettingChanged');
  assert.equal(args.events[0].data.autoPlanOnThreshold, true);
  assert.equal(args.events[0].seq, 2);
});

test('auto-plan: 200 no-op if value already matches', async () => {
  eventRow.autoPlanOnThreshold = true;
  const res = await autoPlan(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', autoPlanOnThreshold: true },
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 0);
});
