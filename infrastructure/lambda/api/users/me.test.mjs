// Specifications for GET /me.
//
// Reads the current user's state row from the users table and returns it.
// Used by the frontend after sign-in to decide where to route: brand-new
// (404 → register/onboarding), profile-incomplete (200 + no name → onboarding),
// profile-complete (200 + name → locality or feed depending on activation).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGetMeHandler } from './me.mjs';

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

const validClaims = { sub: 'abc', email: 'a@b.c', email_verified: 'true' };

let client, handler;
let getItemResult;

beforeEach(() => {
  // Default: a user that has registered + completed profile but not locality.
  getItemResult = {
    Item: {
      userId: 'abc',
      email: 'a@b.c',
      agreementVersion: 'v1',
      agreementAcceptedAt: '2026-05-09T10:00:00.000Z',
      registrationPath: 'self',
      createdAt: '2026-05-09T10:00:00.000Z',
      seq: 2,
      name: 'Matthew',
      avatar: '\u{1F33F}',
      vibeMessage: 'walks',
      interviewResponses: [{ questionId: 'name', response: 'Matthew' }],
      updatedAt: '2026-05-09T10:05:00.000Z',
    },
  };
  client = { send: spy(async () => getItemResult) };
  handler = createGetMeHandler({ client, usersTable: 'irl-users-test' });
});

// ─── Happy path ───

test('returns 200 with the public state fields when the user exists', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.userId, 'abc');
  assert.equal(body.email, 'a@b.c');
  assert.equal(body.agreementVersion, 'v1');
  assert.equal(body.name, 'Matthew');
  assert.equal(body.avatar, '\u{1F33F}');
  assert.equal(body.vibeMessage, 'walks');
});

test('queries the users table by the JWT sub claim', async () => {
  await handler(makeEvent({ claims: validClaims }));
  assert.equal(client.send.calls.length, 1);
  const cmd = client.send.calls[0][0];
  assert.equal(cmd.input.TableName, 'irl-users-test');
  assert.deepEqual(cmd.input.Key, { userId: 'abc' });
});

test('omits the internal seq field from the response', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.seq, undefined);
});

test('coerces missing localityVerified and activated to false', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.localityVerified, false);
  assert.equal(body.activated, false);
});

test('returns true for localityVerified and activated when set', async () => {
  getItemResult = {
    Item: {
      ...getItemResult.Item,
      city: 'Bainbridge Island',
      postalCode: '98110',
      country: 'US',
      localityVerified: true,
      activated: true,
    },
  };
  client = { send: spy(async () => getItemResult) };
  handler = createGetMeHandler({ client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.localityVerified, true);
  assert.equal(body.activated, true);
  assert.equal(body.city, 'Bainbridge Island');
});

test('returns the registration-only shape when profile has not been created', async () => {
  getItemResult = {
    Item: {
      userId: 'abc',
      email: 'a@b.c',
      agreementVersion: 'v1',
      agreementAcceptedAt: '2026-05-09T10:00:00.000Z',
      createdAt: '2026-05-09T10:00:00.000Z',
      seq: 1,
    },
  };
  client = { send: spy(async () => getItemResult) };
  handler = createGetMeHandler({ client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.userId, 'abc');
  assert.equal(body.name, undefined);
  assert.equal(body.localityVerified, false);
  assert.equal(body.activated, false);
});

// ─── Not found ───

test('returns 404 when no user row exists', async () => {
  getItemResult = {}; // no Item
  client = { send: spy(async () => getItemResult) };
  handler = createGetMeHandler({ client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.statusCode, 404);
});

// ─── Auth guards ───

test('returns 401 when the request has no JWT claims', async () => {
  const response = await handler({});
  assert.equal(response.statusCode, 401);
  assert.equal(client.send.calls.length, 0);
});

test('returns 403 when email_verified is not "true"', async () => {
  const response = await handler(makeEvent({
    claims: { ...validClaims, email_verified: 'false' },
  }));
  assert.equal(response.statusCode, 403);
  assert.equal(client.send.calls.length, 0);
});

// ─── Response shape ───

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.headers['Content-Type'], 'application/json');
});
