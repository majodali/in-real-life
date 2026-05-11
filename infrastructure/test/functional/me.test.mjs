// Functional tests for GET /me against the real test stack.
//
// Walks the user through registration → profile → locality and asserts the
// GET /me response shape at each stage. The frontend uses this endpoint
// to decide where to land returning users.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate } from '../helpers/cleanup.mjs';

let config;
let user;

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  const email = `test-${randomUUID()}@example.test`;
  user = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email,
  });
});

afterEach(async () => {
  if (!user) return;
  try { await purgeUserAggregate({ userId: user.sub, tables: config.tables }); } catch { /* ignore */ }
  try { await deleteTestUser({ userPoolId: config.userPoolId, email: user.email }); } catch { /* ignore */ }
  user = null;
});

function authHeaders() {
  return {
    'Authorization': `Bearer ${user.idToken}`,
    'Content-Type': 'application/json',
  };
}

test('GET /me: returns 404 for a Cognito user that has never registered', async () => {
  const response = await fetch(`${config.apiUrl}/me`, { headers: authHeaders() });
  assert.equal(response.status, 404);
});

test('GET /me: returns the registration-only shape after /me/register', async () => {
  const reg = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(reg.status, 201);

  const response = await fetch(`${config.apiUrl}/me`, { headers: authHeaders() });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.userId, user.sub);
  assert.equal(body.email, user.email);
  assert.equal(body.agreementVersion, 'v1');
  assert.ok(body.agreementAcceptedAt);
  assert.ok(body.createdAt);
  assert.equal(body.name, undefined);
  assert.equal(body.localityVerified, false);
  assert.equal(body.activated, false);
  assert.equal(body.seq, undefined); // internal field excluded
});

test('GET /me: returns profile fields after /me/profile', async () => {
  const headers = authHeaders();
  await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST', headers,
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  const profileBody = {
    commandId: randomUUID(),
    name: 'Matthew',
    avatar: '\u{1F33F}',
    vibeMessage: 'walks',
    interviewResponses: [{ questionId: 'name', response: 'Matthew' }],
  };
  const prof = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST', headers,
    body: JSON.stringify(profileBody),
  });
  assert.equal(prof.status, 201);

  const response = await fetch(`${config.apiUrl}/me`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.userId, user.sub);
  assert.equal(body.name, 'Matthew');
  assert.equal(body.avatar, '\u{1F33F}');
  assert.equal(body.vibeMessage, 'walks');
  assert.deepEqual(body.interviewResponses, profileBody.interviewResponses);
  assert.equal(body.localityVerified, false);
  assert.equal(body.activated, false);
});

test('GET /me: reflects locality + activated true after /me/locality', async () => {
  const headers = authHeaders();
  await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST', headers,
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST', headers,
    body: JSON.stringify({ commandId: randomUUID(), name: 'Matthew' }),
  });
  const loc = await fetch(`${config.apiUrl}/me/locality`, {
    method: 'POST', headers,
    body: JSON.stringify({
      commandId: randomUUID(),
      city: 'Bainbridge Island',
      postalCode: '98110',
      country: 'US',
    }),
  });
  assert.equal(loc.status, 201);

  const response = await fetch(`${config.apiUrl}/me`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.city, 'Bainbridge Island');
  assert.equal(body.postalCode, '98110');
  assert.equal(body.country, 'US');
  assert.equal(body.localityVerified, true);
  assert.equal(body.activated, true);
  assert.ok(body.localityVerifiedAt);
  assert.ok(body.activatedAt);
});

test('GET /me: returns 401 without auth', async () => {
  const response = await fetch(`${config.apiUrl}/me`, {
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 401);
});
