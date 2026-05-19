// Functional tests for GET /me/export against the real test stack.

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

test('GET /me/export: returns profile + full event history after register and profile', async () => {
  const headers = authHeaders();
  await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST', headers,
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST', headers,
    body: JSON.stringify({ commandId: randomUUID(), name: 'Matthew', avatar: '\u{1F33F}' }),
  });

  const response = await fetch(`${config.apiUrl}/me/export`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.userId, user.sub);
  assert.ok(body.exportedAt);
  assert.equal(body.profile.userId, user.sub);
  assert.equal(body.profile.name, 'Matthew');

  const types = body.events.map((e) => e.eventType).sort();
  assert.deepEqual(types, ['UserProfileCreated', 'UserRegistered']);
  // Every event carries the user's PII in cleartext today — this is the
  // motivating example for the crypto-shredding design note before
  // account deletion lands.
  const reg = body.events.find((e) => e.eventType === 'UserRegistered');
  assert.equal(reg.data.email, user.email);
});

test('GET /me/export: returns 404 for a Cognito user that never registered', async () => {
  const response = await fetch(`${config.apiUrl}/me/export`, { headers: authHeaders() });
  assert.equal(response.status, 404);
});

test('GET /me/export: returns 401 without auth', async () => {
  const response = await fetch(`${config.apiUrl}/me/export`, {
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 401);
});
