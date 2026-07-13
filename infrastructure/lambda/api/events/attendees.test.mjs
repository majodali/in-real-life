// Specifications for GET /events/:eventId/attendees.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createListAttendeesHandler } from './attendees.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims, eventId = 'evt-1' } = {}) {
  return {
    pathParams: { eventId },
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
  };
}

const validClaims = { sub: 'user-me', email: 'me@x.y' };

let eventRow, interactionRows, client, handler;

beforeEach(() => {
  eventRow = { eventId: 'evt-1', title: 'Coffee walk' };
  interactionRows = [
    { userId: 'user-a', eventId: 'evt-1', level: 'confirmed', userName: 'Zoe' },
    { userId: 'user-me', eventId: 'evt-1', level: 'confirmed', userName: 'Mat' },
    { userId: 'user-b', eventId: 'evt-1', level: 'interested', userName: 'Ana' },
  ];
  client = {
    send: spy(async (cmd) => {
      if (cmd.input.IndexName === 'event-user-index') return { Items: interactionRows };
      return eventRow ? { Item: eventRow } : {};
    }),
  };
  handler = createListAttendeesHandler({
    client,
    eventsTable: 'irl-events-test',
    interactionsTable: 'irl-interactions-test',
    keyStore: { getOrCreateKey: async () => Buffer.alloc(32, 5).toString('base64') },
  });
});

test('splits confirmed and interested, sorted by name, me marked, no userIds leaked', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);

  assert.deepEqual(body.confirmed.map(({ ref, ...rest }) => rest), [
    { name: 'Mat', me: true },
    { name: 'Zoe' },
  ]);
  assert.deepEqual(body.interested.map(({ ref, ...rest }) => rest), [{ name: 'Ana' }]);
  assert.doesNotMatch(response.body, /user-a|user-b|user-me/, 'userIds never leave the server');
});

test('attendee refs are opaque, stable per event, and distinct per member', async () => {
  const first = JSON.parse((await handler(makeEvent({ claims: validClaims }))).body);
  const second = JSON.parse((await handler(makeEvent({ claims: validClaims }))).body);
  const refs = [...first.confirmed, ...first.interested].map((p) => p.ref);

  assert.equal(new Set(refs).size, refs.length, 'refs distinct');
  for (const ref of refs) assert.match(ref, /^[0-9a-f]{16}$/);
  assert.deepEqual(first, second, 'refs stable across calls');
});

test('queries the event-user-index GSI for the event partition', async () => {
  await handler(makeEvent({ claims: validClaims }));
  const query = client.send.calls.find(([cmd]) => cmd.input.IndexName)[0];
  assert.equal(query.input.TableName, 'irl-interactions-test');
  assert.equal(query.input.ExpressionAttributeValues[':e'], 'evt-1');
});

test('paginates the roster query', async () => {
  let call = 0;
  client.send = spy(async (cmd) => {
    if (!cmd.input.IndexName) return { Item: eventRow };
    call++;
    if (call === 1) {
      return {
        Items: [{ userId: 'u1', level: 'confirmed', userName: 'A' }],
        LastEvaluatedKey: { userId: 'u1' },
      };
    }
    return { Items: [{ userId: 'u2', level: 'interested', userName: 'B' }] };
  });
  handler = createListAttendeesHandler({
    client, eventsTable: 't', interactionsTable: 'i',
    keyStore: { getOrCreateKey: async () => Buffer.alloc(32, 5).toString('base64') },
  });
  const body = JSON.parse((await handler(makeEvent({ claims: validClaims }))).body);
  assert.equal(body.confirmed.length, 1);
  assert.equal(body.interested.length, 1);
});

test('an empty roster returns empty groups', async () => {
  interactionRows = [];
  const body = JSON.parse((await handler(makeEvent({ claims: validClaims }))).body);
  assert.deepEqual(body.confirmed, []);
  assert.deepEqual(body.interested, []);
});

test('falls back to "someone" when a name snapshot is missing', async () => {
  interactionRows = [{ userId: 'u1', eventId: 'evt-1', level: 'confirmed' }];
  const body = JSON.parse((await handler(makeEvent({ claims: validClaims }))).body);
  assert.equal(body.confirmed.length, 1);
  assert.equal(body.confirmed[0].name, 'someone');
});

test('401 unauthenticated; 404 unknown event', async () => {
  assert.equal((await handler(makeEvent())).statusCode, 401);
  eventRow = null;
  assert.equal((await handler(makeEvent({ claims: validClaims }))).statusCode, 404);
});
