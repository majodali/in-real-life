// Functional tests for POST /me/register against the real test stack.
//
// Each test creates a fresh Cognito user, signs in via ADMIN_USER_PASSWORD_AUTH,
// hits the deployed API, and verifies state in DynamoDB. Cleanup runs after
// each test to keep the test stack tidy.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate, ddb, readDataKey, decryptEventPii } from '../helpers/cleanup.mjs';

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

test('POST /me/register: registers a new user, writes UserRegistered event, projects to users table', async () => {
  const commandId = randomUUID();

  const response = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ commandId, agreementVersion: 'v1' }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.userId, user.sub);

  // Event was written to the log
  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 1);
  const event = events.Items[0];
  assert.equal(event.eventType, 'UserRegistered');
  assert.equal(event.version, 1);
  assert.equal(event.seq, 1);
  assert.equal(event.commandId, commandId);
  assert.equal(event.actorId, `user#${user.sub}`);
  assert.match(event.eventId, /^[0-9A-HJKMNP-TV-Z]{26}$/);

  // PII is crypto-shredded in the log: email is ciphertext at rest...
  assert.notEqual(event.data.email, user.email);
  assert.equal(event.data.userId, user.sub);          // not PII — cleartext
  assert.equal(event.data.agreementVersion, 'v1');    // compliance — cleartext
  assert.equal(event.data.path, 'self');              // not PII — cleartext

  // ...but decrypts with the aggregate's key (the export/replay path).
  const key = await readDataKey({ aggregateId: `user#${user.sub}`, tables: config.tables });
  assert.ok(key, 'expected a crypto-shred key for the aggregate');
  const clear = decryptEventPii(event, key);
  assert.equal(clear.data.email, user.email);

  // State row is projected
  const userRow = await ddb.send(new GetCommand({
    TableName: config.tables.users,
    Key: { userId: user.sub },
    ConsistentRead: true,
  }));
  assert.ok(userRow.Item, 'state row missing');
  assert.equal(userRow.Item.email, user.email);
  assert.equal(userRow.Item.agreementVersion, 'v1');
  assert.equal(userRow.Item.registrationPath, 'self');
  assert.equal(userRow.Item.seq, 1);
});

test('POST /me/register: idempotent retry with same commandId returns 200, no second event', async () => {
  const commandId = randomUUID();
  const body = JSON.stringify({ commandId, agreementVersion: 'v1' });

  const r1 = await fetch(`${config.apiUrl}/me/register`, { method: 'POST', headers: authHeaders(), body });
  assert.equal(r1.status, 201);

  const r2 = await fetch(`${config.apiUrl}/me/register`, { method: 'POST', headers: authHeaders(), body });
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).userId, user.sub);

  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 1);
});

test('POST /me/register: returns 409 when the user is already registered (different commandId)', async () => {
  const headers = authHeaders();

  const r1 = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(r1.status, 201);

  const r2 = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(r2.status, 409);
});

test('POST /me/register: returns 401 when no Authorization header is present', async () => {
  const response = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(response.status, 401);
});

test('POST /me/register: returns 400 when agreementVersion is missing', async () => {
  const response = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(response.status, 400);
});
