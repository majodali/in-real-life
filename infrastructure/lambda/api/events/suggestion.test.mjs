// Specifications for suggestion endpoints:
//   POST   /events/:id/suggestions
//   GET    /events/:id/suggestions
//   PUT    /events/:id/suggestions/:sid/status   (author withdraw, organizer adopt/reject)
//   PUT    /events/:id/suggestions/:sid/response (organizer)
//   PUT    /events/:id/suggestions/:sid/vote     (any authenticated user)
//   DELETE /events/:id/suggestions/:sid/vote
//
// Suggestions are open through the proposed AND planned phases — create/
// withdraw/adopt/reject/vote all 409 once the event is cancelled or, by the
// simulated clock, in-progress or over. The organizer response slot stays
// writable regardless of phase.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMakeSuggestionHandler,
  createListSuggestionsHandler,
  createSetSuggestionStatusHandler,
  createSetSuggestionResponseHandler,
  createVoteSuggestionHandler,
  createRetractSuggestionVoteHandler,
} from './suggestion.mjs';

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
const authorClaims = { sub: 'author-1', email: 'author@example.test' };

let runner, client, eventRow, suggestionRow, voteRow;
let makeId;
let nextId;
let scanItems;
let voteScanItems;

beforeEach(() => {
  eventRow = {
    eventId: 'evt-1',
    organizerId: 'organizer-1',
    lifecycleState: 'proposed',
    seq: 1,
  };
  suggestionRow = {
    eventId: 'evt-1',
    suggestionId: 'sug-1',
    byUserId: 'author-1',
    text: 'A suggestion',
    tags: [],
    status: 'open',
    seq: 1,
    supportCount: 0,
    objectCount: 0,
  };
  voteRow = null;
  scanItems = null;
  voteScanItems = null;
  client = {
    send: spy(async (cmd) => {
      const tn = cmd.input.TableName;
      const key = cmd.input.Key || {};
      if (tn.startsWith('irl-events') && key.eventId) return { Item: eventRow };
      if (tn.startsWith('irl-suggestions-') && key.suggestionId) return { Item: suggestionRow };
      if (tn.startsWith('irl-suggestion-votes') && key.userId) return { Item: voteRow };
      if (tn.startsWith('irl-suggestions-')) return { Items: scanItems ?? [] };
      if (tn.startsWith('irl-suggestion-votes')) return { Items: voteScanItems ?? [] };
      return { Item: null };
    }),
  };
  nextId = 0;
  makeId = spy(() => `sug-${++nextId}`);
  runner = {
    runCommand: spy(async ({ result }) => ({ cached: false, events: [], result })),
  };
});

function makeMakeHandler() {
  return createMakeSuggestionHandler({
    runner, client, makeId,
    eventsTable: 'irl-events-test',
    suggestionsTable: 'irl-suggestions-test',
  });
}
function makeListHandler() {
  return createListSuggestionsHandler({
    client,
    suggestionsTable: 'irl-suggestions-test',
    suggestionVotesTable: 'irl-suggestion-votes-test',
  });
}
function makeStatusHandler() {
  return createSetSuggestionStatusHandler({
    runner, client,
    eventsTable: 'irl-events-test',
    suggestionsTable: 'irl-suggestions-test',
  });
}
function makeResponseHandler() {
  return createSetSuggestionResponseHandler({
    runner, client,
    eventsTable: 'irl-events-test',
    suggestionsTable: 'irl-suggestions-test',
  });
}
function makeVoteHandler() {
  return createVoteSuggestionHandler({
    runner, client,
    eventsTable: 'irl-events-test',
    suggestionsTable: 'irl-suggestions-test',
    suggestionVotesTable: 'irl-suggestion-votes-test',
  });
}
function makeRetractVoteHandler() {
  return createRetractSuggestionVoteHandler({
    runner, client,
    suggestionsTable: 'irl-suggestions-test',
    suggestionVotesTable: 'irl-suggestion-votes-test',
  });
}

// ─── POST /events/:id/suggestions ───

test('POST: 401 without auth', async () => {
  const res = await makeMakeHandler()(makeEvent({ body: { commandId: 'c', text: 'hi' } }));
  assert.equal(res.statusCode, 401);
});

test('POST: 400 when text missing', async () => {
  const res = await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /text/i);
});

test('POST: 400 when text > 200 chars', async () => {
  const res = await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c', text: 'x'.repeat(201) },
  }));
  assert.equal(res.statusCode, 400);
});

test('POST: 400 when tags contains unsupported tag', async () => {
  const res = await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c', text: 'hi', tags: ['vibe'] },
  }));
  assert.equal(res.statusCode, 400);
});

test('POST: 404 when event missing', async () => {
  eventRow = null;
  const res = await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c', text: 'hi' },
  }));
  assert.equal(res.statusCode, 404);
});

test('POST: 409 when event is cancelled', async () => {
  eventRow.lifecycleState = 'cancelled';
  const res = await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c', text: 'hi' },
  }));
  assert.equal(res.statusCode, 409);
});

test('POST: 409 once the event is over (planned + past endTime)', async () => {
  eventRow.lifecycleState = 'planned';
  eventRow.startTime = '2020-01-01T00:00:00Z';
  eventRow.endTime = '2020-01-01T02:00:00Z';
  const res = await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c', text: 'too late' },
  }));
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /over/);
});

test('POST: still allowed once the event is planned', async () => {
  eventRow.lifecycleState = 'planned';
  const res = await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c', text: 'A change request' },
  }));
  assert.equal(res.statusCode, 201);
});

test('POST: emits SuggestionMade with text, tags, byUserId/Name, fresh suggestionId', async () => {
  const res = await makeMakeHandler()(makeEvent({
    claims: otherClaims,
    body: { commandId: 'c', text: 'A great idea', tags: ['time'] },
  }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.aggregateId, 'suggestion#sug-1');
  assert.equal(args.events[0].eventType, 'SuggestionMade');
  const d = args.events[0].data;
  assert.equal(d.suggestionId, 'sug-1');
  assert.equal(d.eventId, 'evt-1');
  assert.equal(d.byUserId, 'other-1');
  assert.equal(d.text, 'A great idea');
  assert.deepEqual(d.tags, ['time']);
});

test('POST: trims whitespace from text', async () => {
  await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c', text: '  hello  ' },
  }));
  const d = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(d.text, 'hello');
});

test('POST: tags defaults to empty array when omitted', async () => {
  await makeMakeHandler()(makeEvent({
    claims: otherClaims, body: { commandId: 'c', text: 'hi' },
  }));
  const d = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(d.tags, []);
});

// ─── GET /events/:id/suggestions ───

test('GET: 401 without auth', async () => {
  const res = await makeListHandler()(makeEvent({}));
  assert.equal(res.statusCode, 401);
});

test('GET: returns suggestions sorted oldest first with myVote per row', async () => {
  scanItems = [
    { eventId: 'evt-1', suggestionId: 'sug-2', createdAt: '2026-06-02T10:00:00Z', status: 'open' },
    { eventId: 'evt-1', suggestionId: 'sug-1', createdAt: '2026-06-01T10:00:00Z', status: 'open' },
  ];
  voteScanItems = [
    { userId: 'other-1', suggestionId: 'sug-1', vote: 'support' },
  ];
  const res = await makeListHandler()(makeEvent({ claims: otherClaims }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.suggestions.map((s) => s.suggestionId), ['sug-1', 'sug-2']);
  assert.equal(body.suggestions.find((s) => s.suggestionId === 'sug-1').myVote, 'support');
  assert.equal(body.suggestions.find((s) => s.suggestionId === 'sug-2').myVote, null);
});

// ─── PUT status ───

test('status withdrawn: 403 if caller is not author', async () => {
  const res = await makeStatusHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', status: 'withdrawn' },
  }));
  assert.equal(res.statusCode, 403);
});

test('status withdrawn: author can withdraw', async () => {
  const res = await makeStatusHandler()(makeEvent({
    claims: authorClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', status: 'withdrawn' },
  }));
  assert.equal(res.statusCode, 201);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].eventType, 'SuggestionWithdrawn');
});

test('status adopted: 403 if caller is not organizer', async () => {
  const res = await makeStatusHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', status: 'adopted' },
  }));
  assert.equal(res.statusCode, 403);
});

test('status adopted: organizer can adopt', async () => {
  const res = await makeStatusHandler()(makeEvent({
    claims: organizerClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', status: 'adopted' },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(runner.runCommand.calls[0][0].events[0].eventType, 'SuggestionAdopted');
});

test('status rejected: organizer can reject with reason', async () => {
  await makeStatusHandler()(makeEvent({
    claims: organizerClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', status: 'rejected', reason: 'Saving for later' },
  }));
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.eventType, 'SuggestionRejected');
  assert.equal(ev.data.reason, 'Saving for later');
});

test('status: 409 when suggestion is not open', async () => {
  suggestionRow.status = 'adopted';
  const res = await makeStatusHandler()(makeEvent({
    claims: organizerClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', status: 'rejected' },
  }));
  assert.equal(res.statusCode, 409);
});

// ─── PUT response ───

test('response: 403 if caller is not organizer', async () => {
  const res = await makeResponseHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', response: 'thanks' },
  }));
  assert.equal(res.statusCode, 403);
});

test('response: organizer can set, capped at 200 chars', async () => {
  await makeResponseHandler()(makeEvent({
    claims: organizerClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', response: 'x'.repeat(500) },
  }));
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.eventType, 'SuggestionResponded');
  assert.equal(ev.data.response.length, 200);
});

// ─── PUT vote ───

test('vote: 401 without auth', async () => {
  const res = await makeVoteHandler()(makeEvent({
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', vote: 'support' },
  }));
  assert.equal(res.statusCode, 401);
});

test('vote: 400 when vote not support/object', async () => {
  const res = await makeVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', vote: 'thumbs-up' },
  }));
  assert.equal(res.statusCode, 400);
});

test('vote: 409 when suggestion not open', async () => {
  suggestionRow.status = 'withdrawn';
  const res = await makeVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', vote: 'support' },
  }));
  assert.equal(res.statusCode, 409);
});

test('vote: first vote → SuggestionVoteExpressed with previous=null', async () => {
  const res = await makeVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', vote: 'support' },
  }));
  assert.equal(res.statusCode, 201);
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.eventType, 'SuggestionVoteExpressed');
  assert.equal(ev.data.vote, 'support');
  assert.equal(ev.data.previous, null);
  assert.equal(ev.seq, 1);
  assert.equal(runner.runCommand.calls[0][0].aggregateId, 'suggestion-vote#sug-1#other-1');
});

test('vote: re-voting same value → 200 no-op', async () => {
  voteRow = { userId: 'other-1', suggestionId: 'sug-1', vote: 'support', seq: 1 };
  const res = await makeVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', vote: 'support' },
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('vote: flipping vote → previous carried, seq incremented', async () => {
  voteRow = { userId: 'other-1', suggestionId: 'sug-1', vote: 'support', seq: 1 };
  const res = await makeVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c', vote: 'object' },
  }));
  assert.equal(res.statusCode, 201);
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.data.previous, 'support');
  assert.equal(ev.data.vote, 'object');
  assert.equal(ev.seq, 2);
});

// ─── DELETE vote ───

test('retract: 200 no-op when no vote exists', async () => {
  const res = await makeRetractVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('retract: emits SuggestionVoteRetracted with previous level', async () => {
  voteRow = { userId: 'other-1', suggestionId: 'sug-1', vote: 'object', seq: 1 };
  const res = await makeRetractVoteHandler()(makeEvent({
    claims: otherClaims,
    pathParams: { eventId: 'evt-1', suggestionId: 'sug-1' },
    body: { commandId: 'c' },
  }));
  assert.equal(res.statusCode, 201);
  const ev = runner.runCommand.calls[0][0].events[0];
  assert.equal(ev.eventType, 'SuggestionVoteRetracted');
  assert.equal(ev.data.previous, 'object');
  assert.equal(ev.seq, 2);
});
