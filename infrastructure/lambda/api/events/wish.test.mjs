// Specifications for POST /events/:eventId/wish — "I wish this was
// closer" (D62 §2d): capture-only demand signal, frozen at tap time,
// consumed by nothing yet (radar R8).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEventWishHandler } from './wish.mjs';

function makeEvent({ claims, body, eventId = 'evt-1' } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    pathParams: { eventId },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

const validClaims = { sub: 'abc', email: 'a@b.c' };

let eventRow, userRow, runnerCalls, handler;

beforeEach(() => {
  eventRow = { eventId: 'evt-1', title: 'Wood-shop night', localityId: 'bremerton' };
  userRow = { userId: 'abc', seq: 4, postalCode: '98110' };
  runnerCalls = [];
  const client = {
    send: async (cmd) => {
      if (cmd.input.TableName === 'events-test') return { Item: eventRow };
      if (cmd.input.TableName === 'users-test') return { Item: userRow };
      throw new Error(`unexpected table ${cmd.input.TableName}`);
    },
  };
  const runner = {
    runCommand: async (input) => {
      runnerCalls.push(input);
      return { cached: false, result: input.result };
    },
  };
  handler = createEventWishHandler({
    runner, client, eventsTable: 'events-test', usersTable: 'users-test',
  });
});

test('records the wish with locality, band, and home frozen at tap time', async () => {
  const res = await handler(makeEvent({
    claims: validClaims, body: { commandId: 'c1' },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).status, 'wish-recorded');

  const cmd = runnerCalls[0];
  assert.equal(cmd.aggregateId, 'user#abc');
  const event = cmd.events[0];
  assert.equal(event.eventType, 'EventWishRecorded');
  assert.equal(event.seq, 5);
  assert.deepEqual(event.data, {
    userId: 'abc',
    eventId: 'evt-1',
    wish: 'closer',
    localityId: 'bremerton',
    homeLocalityId: 'bainbridge-island',
    band: 'far',
  });
});

test('a locality-less event reads as the community home (band here)', async () => {
  eventRow = { eventId: 'evt-1', title: 'Hall night' };
  const res = await handler(makeEvent({ claims: validClaims, body: { commandId: 'c1' } }));
  assert.equal(res.statusCode, 201);
  assert.equal(runnerCalls[0].events[0].data.band, 'here');
  assert.equal(runnerCalls[0].events[0].data.localityId, 'bainbridge-island');
});

test('validation: auth, commandId, closed wish vocabulary, existence', async () => {
  assert.equal((await handler(makeEvent({ body: { commandId: 'c1' } }))).statusCode, 401);
  assert.equal((await handler(makeEvent({ claims: validClaims, body: {} }))).statusCode, 400);
  assert.equal((await handler(makeEvent({
    claims: validClaims, body: { commandId: 'c1', wish: 'cheaper' },
  }))).statusCode, 400);

  eventRow = null;
  assert.equal((await handler(makeEvent({
    claims: validClaims, body: { commandId: 'c1' },
  }))).statusCode, 404);
});
