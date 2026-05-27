// Specifications for GET /events.
//
// Returns every event state row, sorted by startTime ascending — soonest
// first, past events still included so the client can render its own
// "Past" view. Authenticated users only. No locality filter in slice 1
// (will land alongside locality-aware visibility in a later slice).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createListEventsHandler } from './list.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
  };
}

const sampleRow = (overrides = {}) => ({
  eventId: 'evt-1',
  source: 'community',
  title: 'Coffee walk',
  startTime: '2026-06-01T16:00:00.000Z',
  endTime: '2026-06-01T17:30:00.000Z',
  location: 'Blackbird Bakery',
  organizerId: 'user-a',
  organizerName: 'Alex',
  lifecycleState: 'proposed',
  interestCount: 0,
  confirmedCount: 0,
  createdAt: '2026-05-19T10:00:00.000Z',
  ...overrides,
});

const validClaims = { sub: 'user-abc', email: 'a@b.c' };

let client, handler;

beforeEach(() => {
  client = { send: spy(async () => ({ Items: [] })) };
  handler = createListEventsHandler({
    client, eventsTable: 'irl-events-test', interactionsTable: 'irl-interactions-test',
  });
});

// ─── Auth ───

test('401 when no JWT claims', async () => {
  const response = await handler(makeEvent());
  assert.equal(response.statusCode, 401);
});

test('401 when claims have no sub', async () => {
  const response = await handler(makeEvent({ claims: { email: 'a@b.c' } }));
  assert.equal(response.statusCode, 401);
});

// ─── Happy paths ───

test('returns 200 with an empty list when nothing is in the table', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(body.events, []);
  assert.equal(body.count, 0);
});

test('scans the events table', async () => {
  await handler(makeEvent({ claims: validClaims }));
  const sent = client.send.calls[0][0];
  assert.equal(sent.input.TableName, 'irl-events-test');
});

test('returns rows sorted by startTime ascending', async () => {
  client.send = spy(async () => ({
    Items: [
      sampleRow({ eventId: 'a', startTime: '2026-06-03T10:00:00.000Z' }),
      sampleRow({ eventId: 'b', startTime: '2026-06-01T10:00:00.000Z' }),
      sampleRow({ eventId: 'c', startTime: '2026-06-02T10:00:00.000Z' }),
    ],
  }));
  handler = createListEventsHandler({ client, eventsTable: 't' });
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.deepEqual(body.events.map((e) => e.eventId), ['b', 'c', 'a']);
});

test('count matches the number of returned events', async () => {
  client.send = spy(async () => ({ Items: [sampleRow(), sampleRow({ eventId: 'evt-2' })] }));
  handler = createListEventsHandler({ client, eventsTable: 't' });
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.count, 2);
  assert.equal(body.events.length, 2);
});

test('paginates through Scan results', async () => {
  let call = 0;
  client.send = spy(async () => {
    call++;
    if (call === 1) return { Items: [sampleRow({ eventId: 'p1' })], LastEvaluatedKey: { eventId: 'p1' } };
    return { Items: [sampleRow({ eventId: 'p2' })] };
  });
  handler = createListEventsHandler({ client, eventsTable: 't' });
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.count, 2);
  assert.equal(client.send.calls.length, 2);
  // Second call carries ExclusiveStartKey from the first page.
  assert.deepEqual(client.send.calls[1][0].input.ExclusiveStartKey, { eventId: 'p1' });
});

test('passes through the full event row shape', async () => {
  const row = sampleRow({ description: 'Easy walk along the waterfront.', minimumAttendance: 3 });
  client.send = spy(async () => ({ Items: [row] }));
  handler = createListEventsHandler({ client, eventsTable: 't' });
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  // myLevel always present (null when no interaction); other fields pass through.
  assert.deepEqual(body.events[0], { ...row, myLevel: null });
});

// ─── myLevel merge ───

test('myLevel: merges the caller\'s interaction level per event', async () => {
  let call = 0;
  client.send = spy(async (cmd) => {
    call++;
    // Call 1: scan events → two rows
    if (call === 1) return { Items: [sampleRow({ eventId: 'a' }), sampleRow({ eventId: 'b' })] };
    // Call 2: query interactions → user is interested in 'a', confirmed in 'b'
    return { Items: [
      { userId: validClaims.sub, eventId: 'a', level: 'interested' },
      { userId: validClaims.sub, eventId: 'b', level: 'confirmed' },
    ] };
  });
  handler = createListEventsHandler({
    client, eventsTable: 't', interactionsTable: 'i',
  });
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  const a = body.events.find((e) => e.eventId === 'a');
  const b = body.events.find((e) => e.eventId === 'b');
  assert.equal(a.myLevel, 'interested');
  assert.equal(b.myLevel, 'confirmed');
});

test('myLevel: null when the caller has no interaction with the event', async () => {
  let call = 0;
  client.send = spy(async () => {
    call++;
    if (call === 1) return { Items: [sampleRow({ eventId: 'a' })] };
    return { Items: [] }; // no interactions
  });
  handler = createListEventsHandler({
    client, eventsTable: 't', interactionsTable: 'i',
  });
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.events[0].myLevel, null);
});

test('myLevel: interactions query filters to the caller\'s userId', async () => {
  let call = 0;
  let interactionQueryInput;
  client.send = spy(async (cmd) => {
    call++;
    if (call === 1) return { Items: [] };
    interactionQueryInput = cmd.input;
    return { Items: [] };
  });
  handler = createListEventsHandler({
    client, eventsTable: 't', interactionsTable: 'i',
  });
  await handler(makeEvent({ claims: validClaims }));
  assert.equal(interactionQueryInput.TableName, 'i');
  assert.equal(interactionQueryInput.ExpressionAttributeValues[':u'], validClaims.sub);
});
