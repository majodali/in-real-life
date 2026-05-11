// Functional tests for POST /me/locality against the real test stack.
//
// Each test creates a fresh user, registers, creates a profile, and then
// exercises /me/locality. In workshop mode this single call should drive
// the user all the way to "activated" via three sequential commands.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate, ddb } from '../helpers/cleanup.mjs';

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

  // Register
  const reg = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(reg.status, 201);

  // Create profile
  const profile = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      commandId: randomUUID(),
      name: 'Matthew',
      avatar: '\u{1F33F}',
      vibeMessage: 'walking',
      interviewResponses: [],
    }),
  });
  assert.equal(profile.status, 201);
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

const sampleLocality = (overrides = {}) => ({
  commandId: randomUUID(),
  city: 'Bainbridge Island',
  postalCode: '98110',
  country: 'US',
  ...overrides,
});

test('POST /me/locality: drives the user to activated end-to-end (3 events, seq 3-5)', async () => {
  const body = sampleLocality();
  const response = await fetch(`${config.apiUrl}/me/locality`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 201);
  const respBody = await response.json();
  assert.equal(respBody.userId, user.sub);
  assert.equal(respBody.status, 'activated');

  // Event log: registered (1) + profile (2) + requested (3) + verified (4) + activated (5)
  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 5);
  const types = events.Items.sort((a, b) => a.seq - b.seq).map(e => e.eventType);
  assert.deepEqual(types, [
    'UserRegistered',
    'UserProfileCreated',
    'LocalityVerificationRequested',
    'LocalityVerified',
    'UserActivated',
  ]);

  // State row: all locality + activation fields set
  const userRow = await ddb.send(new GetCommand({
    TableName: config.tables.users,
    Key: { userId: user.sub },
    ConsistentRead: true,
  }));
  const item = userRow.Item;
  assert.ok(item);
  assert.equal(item.seq, 5);
  assert.equal(item.city, 'Bainbridge Island');
  assert.equal(item.postalCode, '98110');
  assert.equal(item.country, 'US');
  assert.equal(item.localityVerified, true);
  assert.equal(item.localityVerifiedBy, 'system');
  assert.equal(item.localityVerifiedMethod, 'auto');
  assert.equal(item.activated, true);
  assert.ok(item.activatedAt);
  // Profile fields still present
  assert.equal(item.name, 'Matthew');
});

test('POST /me/locality: idempotent retry with same commandId returns 200 with no extra events', async () => {
  const body = sampleLocality();
  const headers = authHeaders();

  const r1 = await fetch(`${config.apiUrl}/me/locality`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(r1.status, 201);

  const r2 = await fetch(`${config.apiUrl}/me/locality`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(r2.status, 200);

  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 5);
});

test('POST /me/locality: returns 409 on a second submission with a different commandId', async () => {
  const headers = authHeaders();

  const r1 = await fetch(`${config.apiUrl}/me/locality`, {
    method: 'POST',
    headers,
    body: JSON.stringify(sampleLocality()),
  });
  assert.equal(r1.status, 201);

  const r2 = await fetch(`${config.apiUrl}/me/locality`, {
    method: 'POST',
    headers,
    body: JSON.stringify(sampleLocality({ city: 'Other' })),
  });
  assert.equal(r2.status, 409);
});

test('POST /me/locality: returns 401 without auth', async () => {
  const response = await fetch(`${config.apiUrl}/me/locality`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleLocality()),
  });
  assert.equal(response.status, 401);
});

test('POST /me/locality: returns 400 when city is missing', async () => {
  const response = await fetch(`${config.apiUrl}/me/locality`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID(), postalCode: '98110' }),
  });
  assert.equal(response.status, 400);
});

test('POST /me/locality: returns 400 when postalCode is missing', async () => {
  const response = await fetch(`${config.apiUrl}/me/locality`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID(), city: 'Bainbridge Island' }),
  });
  assert.equal(response.status, 400);
});

test('POST /me/locality: returns 422 when postalCode is outside the allowlist (defence-in-depth)', async () => {
  const response = await fetch(`${config.apiUrl}/me/locality`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      commandId: randomUUID(),
      city: 'San Francisco',
      postalCode: '94110',
    }),
  });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.postalCode, '94110');

  // State row should NOT have locality fields set.
  const userRow = await ddb.send(new GetCommand({
    TableName: config.tables.users,
    Key: { userId: user.sub },
    ConsistentRead: true,
  }));
  assert.equal(userRow.Item.city, undefined);
  assert.equal(userRow.Item.localityVerified, undefined);
  assert.equal(userRow.Item.activated, undefined);
});
