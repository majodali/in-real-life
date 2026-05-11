// Functional tests for POST /me/profile against the real test stack.
//
// Each test creates a fresh Cognito user, registers them via /me/register,
// then exercises /me/profile.

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

  // Register the user so /me/profile has something to update.
  const reg = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(reg.status, 201, `pre-test registration failed for ${email}`);
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

const sampleProfile = (overrides = {}) => ({
  commandId: randomUUID(),
  name: 'Matthew',
  avatar: '\u{1F33F}',
  vibeMessage: 'Always up for a walk',
  interviewResponses: [
    { questionId: 'name', questionText: 'What should we call you?', response: 'Matthew', timestamp: '2026-05-08T09:55:00.000Z' },
  ],
  ...overrides,
});

test('POST /me/profile: writes UserProfileCreated event (seq=2) and updates the state row', async () => {
  const body = sampleProfile();
  const response = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 201);
  const respBody = await response.json();
  assert.equal(respBody.userId, user.sub);
  assert.equal(respBody.name, body.name);

  // Event log: one UserRegistered (seq 1) + one UserProfileCreated (seq 2)
  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 2);
  const profileEvt = events.Items.find(e => e.eventType === 'UserProfileCreated');
  assert.ok(profileEvt);
  assert.equal(profileEvt.seq, 2);
  assert.equal(profileEvt.data.name, body.name);
  assert.equal(profileEvt.data.avatar, body.avatar);
  assert.equal(profileEvt.data.vibeMessage, body.vibeMessage);
  assert.deepEqual(profileEvt.data.interviewResponses, body.interviewResponses);

  // State row: profile fields applied, seq bumped to 2.
  const userRow = await ddb.send(new GetCommand({
    TableName: config.tables.users,
    Key: { userId: user.sub },
    ConsistentRead: true,
  }));
  assert.ok(userRow.Item);
  assert.equal(userRow.Item.name, body.name);
  assert.equal(userRow.Item.avatar, body.avatar);
  assert.equal(userRow.Item.vibeMessage, body.vibeMessage);
  assert.deepEqual(userRow.Item.interviewResponses, body.interviewResponses);
  assert.equal(userRow.Item.seq, 2);
  // Original UserRegistered fields still present
  assert.equal(userRow.Item.email, user.email);
  assert.equal(userRow.Item.agreementVersion, 'v1');
});

test('POST /me/profile: idempotent retry with same commandId returns 200, no second event', async () => {
  const body = sampleProfile();
  const headers = authHeaders();

  const r1 = await fetch(`${config.apiUrl}/me/profile`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(r1.status, 201);

  const r2 = await fetch(`${config.apiUrl}/me/profile`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(r2.status, 200);

  // Still only 2 events total (UserRegistered + UserProfileCreated)
  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 2);
});

test('POST /me/profile: returns 409 on second creation with a different commandId', async () => {
  const headers = authHeaders();

  const r1 = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify(sampleProfile()),
  });
  assert.equal(r1.status, 201);

  const r2 = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify(sampleProfile({ name: 'Different' })),
  });
  assert.equal(r2.status, 409);
});

test('POST /me/profile: returns 401 without auth', async () => {
  const response = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleProfile()),
  });
  assert.equal(response.status, 401);
});

test('POST /me/profile: returns 400 when name is missing', async () => {
  const response = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(response.status, 400);
});
