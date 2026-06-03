// Specifications for poll endpoints:
//   POST   /events/:id/polls                — organizer creates a poll
//   GET    /events/:id/polls                — list polls (with myVote)
//   PUT    /events/:id/polls/:pollId/close  — organizer closes (with optional outcome)
//   PUT    /events/:id/polls/:pollId/vote   — anyone authenticated casts a vote
//   DELETE /events/:id/polls/:pollId/vote   — retract

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMakePollHandler,
  createListPollsHandler,
  createClosePollHandler,
  createCastPollVoteHandler,
  createRetractPollVoteHandler,
} from './poll.mjs';

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

let runner, client, eventRow, pollRow, voteRow;
let scanItems, voteScanItems;
let makeId, nextId;

beforeEach(() => {
  eventRow = { eventId: 'evt-1', organizerId: 'organizer-1', lifecycleState: 'proposed', seq: 1 };
  pollRow = {
    eventId: 'evt-1', pollId: 'poll-1', byOrganizerId: 'organizer-1',
    status: 'open', seq: 1,
    options: [{ id: 'opt-a', label: 'Sat' }, { id: 'opt-b', label: 'Sun' }],
    tallies: { 'opt-a': 0, 'opt-b': 0 },
    totalVotes: 0,
  };
  voteRow = null;
  scanItems = null;
  voteScanItems = null;
  nextId = 0;
  makeId = spy(() => `poll-${++nextId}`);
  client = {
    send: spy(async (cmd) => {
      const tn = cmd.input.TableName;
      const key = cmd.input.Key || {};
      if (tn.startsWith('irl-events') && key.eventId) return { Item: eventRow };
      if (tn.startsWith('irl-polls-') && key.pollId) return { Item: pollRow };
      if (tn.startsWith('irl-poll-votes') && key.userId) return { Item: voteRow };
      if (tn.startsWith('irl-polls-')) return { Items: scanItems ?? [] };
      if (tn.startsWith('irl-poll-votes')) return { Items: voteScanItems ?? [] };
      return { Item: null };
    }),
  };
  runner = {
    runCommand: spy(async ({ result }) => ({ cached: false, events: [], result })),
  };
});

function makePollHandler() {
  return createMakePollHandler({
    runner, client, makeId,
    eventsTable: 'irl-events-test', pollsTable: 'irl-polls-test',
  });
}
function listHandler() {
  return createListPollsHandler({
    client, pollsTable: 'irl-polls-test', pollVotesTable: 'irl-poll-votes-test',
  });
}
function closeHandler() {
  return createClosePollHandler({
    runner, client, eventsTable: 'irl-events-test', pollsTable: 'irl-polls-test',
  });
}
function voteHandler() {
  return createCastPollVoteHandler({
    runner, client,
    eventsTable: 'irl-events-test', pollsTable: 'irl-polls-test',
    pollVotesTable: 'irl-poll-votes-test',
  });
}
function retractVoteHandler() {
  return createRetractPollVoteHandler({
    runner, client,
    pollsTable: 'irl-polls-test', pollVotesTable: 'irl-poll-votes-test',
  });
}

// ─── POST polls ───

test('POST: 401 without auth', async () => {
  const res = await makePollHandler()(makeEvent({ body: validCreateBody() }));
  assert.equal(res.statusCode, 401);
});

test('POST: 403 when caller is not organizer', async () => {
  const res = await makePollHandler()(makeEvent({ claims: otherClaims, body: validCreateBody() }));
  assert.equal(res.statusCode, 403);
});

test('POST: 400 when question missing', async () => {
  const b = validCreateBody(); delete b.question;
  const res = await makePollHandler()(makeEvent({ claims: organizerClaims, body: b }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /question/i);
});

test('POST: 400 when question > 200 chars', async () => {
  const res = await makePollHandler()(makeEvent({
    claims: organizerClaims, body: { ...validCreateBody(), question: 'x'.repeat(201) },
  }));
  assert.equal(res.statusCode, 400);
});

test('POST: 400 with fewer than 2 options', async () => {
  const res = await makePollHandler()(makeEvent({
    claims: organizerClaims, body: { ...validCreateBody(), options: ['only one'] },
  }));
  assert.equal(res.statusCode, 400);
});

test('POST: 400 with more than 5 options', async () => {
  const res = await makePollHandler()(makeEvent({
    claims: organizerClaims, body: { ...validCreateBody(), options: ['a','b','c','d','e','f'] },
  }));
  assert.equal(res.statusCode, 400);
});

test('POST: 409 when event not proposed', async () => {
  eventRow.lifecycleState = 'planned';
  const res = await makePollHandler()(makeEvent({ claims: organizerClaims, body: validCreateBody() }));
  assert.equal(res.statusCode, 409);
});

test('POST: 201 with options assigned stable ids; PollCreated emitted', async () => {
  const res = await makePollHandler()(makeEvent({ claims: organizerClaims, body: validCreateBody() }));
  assert.equal(res.statusCode, 201);

  const [args] = runner.runCommand.calls[0];
  assert.equal(args.aggregateId, 'poll#poll-1');
  assert.equal(args.events[0].eventType, 'PollCreated');
  const d = args.events[0].data;
  assert.equal(d.pollId, 'poll-1');
  assert.equal(d.eventId, 'evt-1');
  assert.equal(d.byOrganizerId, 'organizer-1');
  assert.equal(d.question, 'Which Saturday?');
  assert.equal(d.options.length, 3);
  // Each option has an id + label.
  for (const o of d.options) {
    assert.ok(o.id);
    assert.ok(o.label);
  }
});

// ─── GET polls ───

test('GET: 401 without auth', async () => {
  const res = await listHandler()(makeEvent({}));
  assert.equal(res.statusCode, 401);
});

test('GET: returns polls sorted oldest first with myVote per row', async () => {
  scanItems = [
    { eventId: 'evt-1', pollId: 'p2', createdAt: '2026-06-02T10:00:00Z', status: 'open' },
    { eventId: 'evt-1', pollId: 'p1', createdAt: '2026-06-01T10:00:00Z', status: 'open' },
  ];
  voteScanItems = [
    { userId: 'other-1', pollId: 'p1', optionId: 'opt-a' },
  ];
  const res = await listHandler()(makeEvent({ claims: otherClaims }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.polls.map((p) => p.pollId), ['p1', 'p2']);
  assert.equal(body.polls.find((p) => p.pollId === 'p1').myVote, 'opt-a');
  assert.equal(body.polls.find((p) => p.pollId === 'p2').myVote, null);
});

// ─── PUT close ───

test('close: 403 when caller is not organizer', async () => {
  const res = await closeHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 403);
});

test('close: 409 when poll already closed', async () => {
  pollRow.status = 'closed';
  const res = await closeHandler()(makeEvent({
    claims: organizerClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 409);
});

test('close: organizer closes without outcome', async () => {
  const res = await closeHandler()(makeEvent({
    claims: organizerClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 201);
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.eventType, 'PollClosed');
  assert.equal(ev.data.outcome, null);
});

test('close: organizer closes with outcome (must be one of options)', async () => {
  const res = await closeHandler()(makeEvent({
    claims: organizerClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c', outcome: 'opt-b' },
  }));
  assert.equal(res.statusCode, 201);
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.data.outcome, 'opt-b');
});

test('close: 400 when outcome is not one of the options', async () => {
  const res = await closeHandler()(makeEvent({
    claims: organizerClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c', outcome: 'opt-z' },
  }));
  assert.equal(res.statusCode, 400);
});

// ─── PUT vote ───

test('vote: 400 when optionId missing', async () => {
  const res = await voteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 400);
});

test('vote: 400 when optionId not in poll options', async () => {
  const res = await voteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c', optionId: 'opt-z' },
  }));
  assert.equal(res.statusCode, 400);
});

test('vote: 409 when poll is closed', async () => {
  pollRow.status = 'closed';
  const res = await voteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c', optionId: 'opt-a' },
  }));
  assert.equal(res.statusCode, 409);
});

test('vote: first vote → PollVoteCast with previousOptionId=null', async () => {
  const res = await voteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c', optionId: 'opt-a' },
  }));
  assert.equal(res.statusCode, 201);
  const args = runner.runCommand.calls[0][0];
  assert.equal(args.aggregateId, 'poll-vote#poll-1#other-1');
  assert.equal(args.events[0].eventType, 'PollVoteCast');
  assert.equal(args.events[0].data.optionId, 'opt-a');
  assert.equal(args.events[0].data.previousOptionId, null);
});

test('vote: re-voting same option → 200 no-op', async () => {
  voteRow = { userId: 'other-1', pollId: 'poll-1', optionId: 'opt-a', seq: 1 };
  const res = await voteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c', optionId: 'opt-a' },
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('vote: changing option carries previous + bumps seq', async () => {
  voteRow = { userId: 'other-1', pollId: 'poll-1', optionId: 'opt-a', seq: 1 };
  const res = await voteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c', optionId: 'opt-b' },
  }));
  assert.equal(res.statusCode, 201);
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.data.previousOptionId, 'opt-a');
  assert.equal(ev.data.optionId, 'opt-b');
  assert.equal(ev.seq, 2);
});

// ─── DELETE vote ───

test('retract: 200 no-op when no vote exists', async () => {
  const res = await retractVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('retract: emits PollVoteRetracted with previous optionId', async () => {
  voteRow = { userId: 'other-1', pollId: 'poll-1', optionId: 'opt-b', seq: 1 };
  const res = await retractVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', pollId: 'poll-1' },
    body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 201);
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.eventType, 'PollVoteRetracted');
  assert.equal(ev.data.previousOptionId, 'opt-b');
  assert.equal(ev.seq, 2);
});

function validCreateBody() {
  return {
    commandId: 'c1',
    question: 'Which Saturday?',
    options: ['Jun 6', 'Jun 13', 'Jun 20'],
  };
}
