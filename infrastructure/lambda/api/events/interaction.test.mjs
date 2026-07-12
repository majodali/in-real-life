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
  createSubmitDebriefHandler,
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
  eventRow = {
    eventId: 'evt-1', seq: 1, lifecycleState: 'proposed',
    startTime: '2099-01-01T10:00:00Z', endTime: '2099-01-01T12:00:00Z', location: 'The Park',
  };
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

test('PUT: 409 when event is cancelled', async () => {
  eventRow = { ...eventRow, lifecycleState: 'cancelled' };
  const res = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(res.statusCode, 409);
});

test('PUT: 409 once the event is over (planned + past endTime)', async () => {
  eventRow = {
    ...eventRow, lifecycleState: 'planned',
    startTime: '2020-01-01T00:00:00Z', endTime: '2020-01-01T02:00:00Z',
  };
  const res = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /over/);
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

// ─── Auto-plan side effect ───

test('auto-plan: confirm reaching threshold fires EventScheduled as a second command', async () => {
  eventRow = {
    ...eventRow, autoPlanOnThreshold: true, minimumAttendance: 3, confirmedCount: 1,
  };
  // Reflect the projection's atomic ADD: the post-confirm count is 2.
  // With the organizer implicit (+1) the threshold of 3 is reached.
  runner.runCommand = spy(async ({ result }) => {
    eventRow = { ...eventRow, confirmedCount: 2 };
    return { cached: false, events: [], result };
  });

  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(runner.runCommand.calls.length, 2);
  const second = runner.runCommand.calls[1][0];
  assert.equal(second.events[0].eventType, 'EventScheduled');
  assert.equal(second.events[0].data.autoTriggered, true);
  assert.equal(second.events[0].data.scheduledBy, 'auto');
  assert.equal(second.aggregateId, 'event#evt-1');
});

test('auto-plan: confirm without autoPlanOnThreshold does NOT fire EventScheduled', async () => {
  eventRow = {
    ...eventRow, autoPlanOnThreshold: false, minimumAttendance: 3, confirmedCount: 2,
  };
  await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(runner.runCommand.calls.length, 1);
});

test('auto-plan: confirm below threshold does NOT fire EventScheduled', async () => {
  eventRow = {
    ...eventRow, autoPlanOnThreshold: true, minimumAttendance: 6, confirmedCount: 1,
  };
  runner.runCommand = spy(async ({ result }) => {
    eventRow = { ...eventRow, confirmedCount: 2 };
    return { cached: false, events: [], result };
  });
  await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(runner.runCommand.calls.length, 1);
});

test('auto-plan: expressing interest does NOT fire EventScheduled (only confirm does)', async () => {
  eventRow = {
    ...eventRow, autoPlanOnThreshold: true, minimumAttendance: 3, confirmedCount: 5,
  };
  await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'interested' },
  }));
  assert.equal(runner.runCommand.calls.length, 1);
});

test('auto-plan: if event is no longer proposed at fresh-read time, skip', async () => {
  eventRow = {
    ...eventRow, autoPlanOnThreshold: true, minimumAttendance: 3, confirmedCount: 1,
  };
  runner.runCommand = spy(async ({ result }) => {
    eventRow = { ...eventRow, confirmedCount: 2, lifecycleState: 'planned' };
    return { cached: false, events: [], result };
  });
  await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(runner.runCommand.calls.length, 1);
});

// ─── Debrief ───

function debriefHandler() {
  return createSubmitDebriefHandler({
    runner, client,
    eventsTable: 'irl-events-test',
    interactionsTable: 'irl-interactions-test',
    getOffset: async () => ({ offsetMs: 0 }),
  });
}

function makeBody(extra = {}) {
  return { commandId: 'cmd-1', rating: 4, ...extra };
}

test('debrief: 401 without auth', async () => {
  const res = await debriefHandler()(makeEvent({ body: makeBody() }));
  assert.equal(res.statusCode, 401);
});

test('debrief: 400 when rating missing', async () => {
  const res = await debriefHandler()(makeEvent({
    claims: validClaims, body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 400);
});

test('debrief: 400 when rating not 1-5', async () => {
  for (const r of [0, 6, 3.5, -1]) {
    const res = await debriefHandler()(makeEvent({
      claims: validClaims, body: makeBody({ rating: r }),
    }));
    assert.equal(res.statusCode, 400, `expected 400 for rating=${r}`);
  }
});

test('debrief: 404 when event row is missing', async () => {
  eventRow = null;
  const res = await debriefHandler()(makeEvent({ claims: validClaims, body: makeBody() }));
  assert.equal(res.statusCode, 404);
});

test('debrief: 409 when user is not confirmed for the event', async () => {
  // Event over but user has no interaction row.
  eventRow.lifecycleState = 'planned';
  eventRow.endTime = '2026-01-01T00:00:00Z';
  interactionRow = null;
  const res = await debriefHandler()(makeEvent({ claims: validClaims, body: makeBody() }));
  assert.equal(res.statusCode, 409);
});

test('debrief: 409 when event is not yet over', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.endTime = '2099-01-01T00:00:00Z';
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'confirmed', seq: 1 };
  const res = await debriefHandler()(makeEvent({ claims: validClaims, body: makeBody() }));
  assert.equal(res.statusCode, 409);
});

test('debrief: 409 when event was cancelled', async () => {
  eventRow.lifecycleState = 'cancelled';
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'confirmed', seq: 1 };
  const res = await debriefHandler()(makeEvent({ claims: validClaims, body: makeBody() }));
  assert.equal(res.statusCode, 409);
});

test('debrief: emits DebriefSubmitted with seq=current+1 and rating + notes', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.endTime = '2026-01-01T00:00:00Z';
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'confirmed', seq: 1 };
  const res = await debriefHandler()(makeEvent({
    claims: validClaims, body: makeBody({ rating: 5, notes: 'lovely' }),
  }));
  assert.equal(res.statusCode, 201);
  const args = runner.runCommand.calls[0][0];
  assert.equal(args.aggregateId, 'interaction#user-a#evt-1');
  assert.equal(args.events[0].eventType, 'DebriefSubmitted');
  assert.equal(args.events[0].seq, 2);
  assert.equal(args.events[0].data.rating, 5);
  assert.equal(args.events[0].data.notes, 'lovely');
});

test('debrief: notes is optional and capped at 500 chars', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.endTime = '2026-01-01T00:00:00Z';
  interactionRow = { userId: 'user-a', eventId: 'evt-1', level: 'confirmed', seq: 1 };
  await debriefHandler()(makeEvent({
    claims: validClaims, body: makeBody({ notes: 'x'.repeat(1000) }),
  }));
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.notes.length, 500);
});

// ─── Ideas (time/place-less proposals) ───

test('interest on an idea is allowed', async () => {
  eventRow = { eventId: 'evt-1', seq: 1, lifecycleState: 'proposed', title: 'Scrabble?' };
  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'interested' },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(runner.runCommand.calls[0][0].events[0].eventType, 'InterestExpressed');
});

test('confirming an idea is rejected until a time and place are set', async () => {
  eventRow = { eventId: 'evt-1', seq: 1, lifecycleState: 'proposed', title: 'Scrabble?' };
  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /still an idea/);
  assert.equal(runner.runCommand.calls.length, 0);
});

// ─── Overlapping RSVPs (double-confirmation heads-up) ───

// A richer fake: interactions Query returns the member's rows; event Gets
// resolve from a small table of rows.
function overlapClient({ myInteractions, otherEvents }) {
  return {
    send: spy(async (cmd) => {
      const tn = cmd.input.TableName;
      if (cmd.input.KeyConditionExpression) {
        return { Items: myInteractions };
      }
      const key = cmd.input.Key || {};
      if (tn.startsWith('irl-events')) {
        if (key.eventId === 'evt-1') return { Item: eventRow };
        const found = otherEvents.find((e) => e.eventId === key.eventId);
        return { Item: found ?? null };
      }
      if (tn.startsWith('irl-interactions')) return { Item: interactionRow };
      return { Item: null };
    }),
  };
}

function rebuildForOverlap({ myInteractions, otherEvents }) {
  client = overlapClient({ myInteractions, otherEvents });
  handler = createSetInteractionHandler({
    runner, client,
    eventsTable: 'irl-events-test',
    interactionsTable: 'irl-interactions-test',
  });
}

test('confirming over another confirmed event returns a conflicts heads-up (still 201)', async () => {
  rebuildForOverlap({
    myInteractions: [{ eventId: 'evt-2', level: 'confirmed' }],
    otherEvents: [{
      eventId: 'evt-2', title: 'Trivia night', lifecycleState: 'planned',
      startTime: '2099-01-01T11:00:00Z', endTime: '2099-01-01T13:00:00Z', location: 'Pub',
    }],
  });

  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));

  assert.equal(res.statusCode, 201, 'never blocked');
  const body = JSON.parse(res.body);
  assert.deepEqual(body.conflicts, [{
    eventId: 'evt-2',
    title: 'Trivia night',
    startTime: '2099-01-01T11:00:00Z',
    endTime: '2099-01-01T13:00:00Z',
  }]);
});

test('expressing interest never computes conflicts (overlapping interest is fine)', async () => {
  rebuildForOverlap({
    myInteractions: [{ eventId: 'evt-2', level: 'confirmed' }],
    otherEvents: [{
      eventId: 'evt-2', title: 'Trivia night', lifecycleState: 'planned',
      startTime: '2099-01-01T11:00:00Z', endTime: '2099-01-01T13:00:00Z', location: 'Pub',
    }],
  });

  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'interested' },
  }));
  assert.equal('conflicts' in JSON.parse(res.body), false);
});

test('an overlapping event the member is only interested in is not a conflict', async () => {
  rebuildForOverlap({
    myInteractions: [{ eventId: 'evt-2', level: 'interested' }],
    otherEvents: [{
      eventId: 'evt-2', title: 'Trivia night', lifecycleState: 'planned',
      startTime: '2099-01-01T11:00:00Z', endTime: '2099-01-01T13:00:00Z', location: 'Pub',
    }],
  });

  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal('conflicts' in JSON.parse(res.body), false);
});

test('non-overlapping and cancelled confirmed events are not conflicts', async () => {
  rebuildForOverlap({
    myInteractions: [
      { eventId: 'evt-2', level: 'confirmed' },
      { eventId: 'evt-3', level: 'confirmed' },
    ],
    otherEvents: [
      { // same day, disjoint hours
        eventId: 'evt-2', title: 'Morning swim', lifecycleState: 'planned',
        startTime: '2099-01-01T06:00:00Z', endTime: '2099-01-01T07:00:00Z', location: 'Pool',
      },
      { // overlapping but cancelled — no longer a real commitment
        eventId: 'evt-3', title: 'Cancelled walk', lifecycleState: 'cancelled',
        startTime: '2099-01-01T10:30:00Z', endTime: '2099-01-01T12:30:00Z', location: 'Park',
      },
    ],
  });

  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal('conflicts' in JSON.parse(res.body), false);
});

// ─── Capacity: confirm gated when full, interest stays open ───

test('confirming a full event is 409; interest still works (demand signal)', async () => {
  eventRow = { ...eventRow, maxAttendance: 4, confirmedCount: 3 };

  const confirm = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(confirm.statusCode, 409);
  assert.match(JSON.parse(confirm.body).error, /full/);

  const interest = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-2', level: 'interested' },
  }));
  assert.equal(interest.statusCode, 201);
});

test('confirming with spots left succeeds under a cap', async () => {
  eventRow = { ...eventRow, maxAttendance: 4, confirmedCount: 2 };
  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'cmd-1', level: 'confirmed' },
  }));
  assert.equal(res.statusCode, 201);
});
