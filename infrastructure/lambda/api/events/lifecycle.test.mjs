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
  createEditEventHandler,
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
let schedule, cancel, autoPlan, edit;

beforeEach(() => {
  eventRow = {
    eventId: 'evt-1',
    seq: 1,
    organizerId: 'organizer-1',
    lifecycleState: 'proposed',
    autoPlanOnThreshold: false,
    title: 'Original title',
    location: 'Original location',
    // Far-future sentinel — never a near-future date, which rots as the
    // calendar passes it and silently flips planned rows to in-progress/over.
    startTime: '2099-01-01T10:00:00Z',
    endTime: '2099-01-01T12:00:00Z',
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
  edit = createEditEventHandler({ runner, client, eventsTable: 'irl-events-test' });
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

test('cancel: works while in-progress (calling it off partway)', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.startTime = '2020-01-01T00:00:00Z';
  eventRow.endTime = '2099-01-01T00:00:00Z';
  const res = await cancel(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 201);
});

test('cancel: 409 once the event is over', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.startTime = '2020-01-01T00:00:00Z';
  eventRow.endTime = '2020-01-01T02:00:00Z';
  const res = await cancel(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /over/);
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

// ─── Edit ───

test('edit: 401 when no claims', async () => {
  const res = await edit(makeEvent({ body: { commandId: 'c', title: 'New' } }));
  assert.equal(res.statusCode, 401);
});

test('edit: 403 when caller is not organizer', async () => {
  const res = await edit(makeEvent({
    claims: otherClaims, body: { commandId: 'c', title: 'New' },
  }));
  assert.equal(res.statusCode, 403);
});

test('edit: 404 when event row missing', async () => {
  eventRow = null;
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', title: 'New' },
  }));
  assert.equal(res.statusCode, 404);
});

test('edit: 409 when event is cancelled', async () => {
  eventRow.lifecycleState = 'cancelled';
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', title: 'New' },
  }));
  assert.equal(res.statusCode, 409);
});

test('edit: 400 when commandId missing', async () => {
  const res = await edit(makeEvent({ claims: organizerClaims, body: { title: 'New' } }));
  assert.equal(res.statusCode, 400);
});

test('edit: 400 when no editable field is provided', async () => {
  const res = await edit(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /at least one/i);
});

test('edit: emits EventEdited with only the changed fields, seq=current+1', async () => {
  const res = await edit(makeEvent({
    claims: organizerClaims,
    body: { commandId: 'c', title: 'New title', location: 'New venue' },
  }));
  assert.equal(res.statusCode, 201);

  const [args] = runner.runCommand.calls[0];
  assert.equal(args.aggregateId, 'event#evt-1');
  assert.equal(args.events[0].eventType, 'EventEdited');
  assert.equal(args.events[0].seq, 2);
  assert.equal(args.events[0].data.editedBy, 'organizer-1');
  assert.deepEqual(args.events[0].data.fields, {
    title: 'New title',
    location: 'New venue',
  });
});

test('edit: works while planned (the common case)', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.seq = 2;
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', title: 'New' },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(runner.runCommand.calls[0][0].events[0].seq, 3);
});

test('edit: 409 once the event is over', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.startTime = '2020-01-01T00:00:00Z';
  eventRow.endTime = '2020-01-01T02:00:00Z';
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', title: 'New' },
  }));
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /over/);
});

test('edit: can set timesApproximate', async () => {
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', timesApproximate: true },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(runner.runCommand.calls[0][0].events[0].data.fields.timesApproximate, true);
});

test('edit: 400 when timesApproximate is not a boolean', async () => {
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', timesApproximate: 'yes' },
  }));
  assert.equal(res.statusCode, 400);
});

test('edit: 400 when startTime is not a parseable ISO', async () => {
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', startTime: 'not a date' },
  }));
  assert.equal(res.statusCode, 400);
});

test('edit: 400 when endTime <= startTime (merging with current row)', async () => {
  // Current startTime is '2099-01-01T10:00:00Z'; new endTime earlier → 400.
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', endTime: '2026-07-01T09:00:00Z' },
  }));
  assert.equal(res.statusCode, 400);
});

test('edit: 400 when title is blank', async () => {
  const res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', title: '   ' },
  }));
  assert.equal(res.statusCode, 400);
});

test('edit: trims string fields', async () => {
  await edit(makeEvent({
    claims: organizerClaims,
    body: { commandId: 'c', title: '  New  ', location: '  Where  ' },
  }));
  const fields = runner.runCommand.calls[0][0].events[0].data.fields;
  assert.equal(fields.title, 'New');
  assert.equal(fields.location, 'Where');
});

// ─── Ideas (time/place-less proposals) ───

test('schedule: 409 while the proposal is still an idea', async () => {
  eventRow = { ...eventRow, location: undefined };
  const res = await schedule(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /still an idea/);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('edit: an idea can gain its time and place (the firming-up path)', async () => {
  eventRow = {
    ...eventRow, startTime: undefined, endTime: undefined, location: undefined,
  };
  const res = await edit(makeEvent({
    claims: organizerClaims,
    body: {
      commandId: 'c',
      startTime: '2099-02-01T10:00:00Z',
      endTime: '2099-02-01T12:00:00Z',
      location: 'The Library',
    },
  }));
  assert.equal(res.statusCode, 201);
  const fields = runner.runCommand.calls[0][0].events[0].data.fields;
  assert.equal(fields.location, 'The Library');
  assert.equal(fields.startTime, '2099-02-01T10:00:00Z');
});

test('edit: times stay a pair — startTime alone on an untimed idea is 400', async () => {
  eventRow = { ...eventRow, startTime: undefined, endTime: undefined };
  const res = await edit(makeEvent({
    claims: organizerClaims,
    body: { commandId: 'c', startTime: '2099-02-01T10:00:00Z' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /endTime/);
});

test('edit: endTime alone on an untimed idea is 400', async () => {
  eventRow = { ...eventRow, startTime: undefined, endTime: undefined };
  const res = await edit(makeEvent({
    claims: organizerClaims,
    body: { commandId: 'c', endTime: '2099-02-01T12:00:00Z' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /startTime/);
});

// ─── Cancellation: RSVP disposition + impact report ───

test('cancel: result reports affected interest/confirmed counts from the row', async () => {
  eventRow = { ...eventRow, interestCount: 4, confirmedCount: 2 };
  const res = await cancel(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.equal(res.statusCode, 201);
  assert.deepEqual(JSON.parse(res.body), {
    eventId: 'evt-1',
    lifecycleState: 'cancelled',
    affected: { interested: 4, confirmed: 2 },
  });
});

test('cancel: zero counts default cleanly', async () => {
  const res = await cancel(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  assert.deepEqual(JSON.parse(res.body).affected, { interested: 0, confirmed: 0 });
});

test('cancel: emits only EventCancelled — no interaction rewrites ride along', async () => {
  eventRow = { ...eventRow, interestCount: 4, confirmedCount: 2 };
  await cancel(makeEvent({ claims: organizerClaims, body: { commandId: 'c' } }));
  const [input] = runner.runCommand.calls[0];
  assert.equal(input.events.length, 1);
  assert.equal(input.events[0].eventType, 'EventCancelled');
  assert.equal(input.aggregateId, 'event#evt-1');
});

// ─── Richer event data: cost + capacity edits ───

test('edit: valid cost and maxAttendance pass through; null clears', async () => {
  const res = await edit(makeEvent({
    claims: organizerClaims,
    body: { commandId: 'c', cost: { amount: 10, covers: 'venue' }, maxAttendance: 10 },
  }));
  assert.equal(res.statusCode, 201);
  const fields = runner.runCommand.calls[0][0].events[0].data.fields;
  assert.deepEqual(fields.cost, { amount: 10, covers: 'venue' });
  assert.equal(fields.maxAttendance, 10);

  const clear = await edit(makeEvent({
    claims: organizerClaims,
    body: { commandId: 'c2', cost: null, maxAttendance: null },
  }));
  assert.equal(clear.statusCode, 201);
  const cleared = runner.runCommand.calls[1][0].events[0].data.fields;
  assert.equal(cleared.cost, null);
  assert.equal(cleared.maxAttendance, null);
});

test('edit: invalid cost (missing covers) and sub-minimum capacity are 400', async () => {
  eventRow = { ...eventRow, minimumAttendance: 6 };
  let res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', cost: { amount: 10 } },
  }));
  assert.equal(res.statusCode, 400);
  res = await edit(makeEvent({
    claims: organizerClaims, body: { commandId: 'c', maxAttendance: 5 },
  }));
  assert.equal(res.statusCode, 400);
});
