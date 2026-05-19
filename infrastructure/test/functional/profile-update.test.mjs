// Functional tests for PUT /me/profile against the real test stack.

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

  // Register + create initial profile so PUT has something to update.
  const headers = authHeaders();
  const reg = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST', headers,
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(reg.status, 201);
  const prof = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST', headers,
    body: JSON.stringify({
      commandId: randomUUID(),
      name: 'Matthew',
      avatar: '\u{1F33F}',
      vibeMessage: 'walks',
      interviewResponses: [{ questionId: 'name', response: 'Matthew' }],
    }),
  });
  assert.equal(prof.status, 201);
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

test('PUT /me/profile: updates name and writes UserProfileUpdated event (seq=3)', async () => {
  const headers = authHeaders();
  const response = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT', headers,
    body: JSON.stringify({ commandId: randomUUID(), name: 'Matt' }),
  });
  assert.equal(response.status, 200);
  const respBody = await response.json();
  assert.equal(respBody.userId, user.sub);
  assert.equal(respBody.name, 'Matt');
  assert.equal(respBody.avatar, '\u{1F33F}'); // unchanged
  assert.equal(respBody.vibeMessage, 'walks'); // unchanged

  // State row reflects the update.
  const userRow = await ddb.send(new GetCommand({
    TableName: config.tables.users,
    Key: { userId: user.sub },
    ConsistentRead: true,
  }));
  assert.equal(userRow.Item.name, 'Matt');
  assert.equal(userRow.Item.avatar, '\u{1F33F}');
  assert.equal(userRow.Item.vibeMessage, 'walks');
  assert.equal(userRow.Item.seq, 3);

  // Event log: registered (seq 1) + created (seq 2) + updated (seq 3).
  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 3);
  const updatedEvt = events.Items.find(e => e.eventType === 'UserProfileUpdated');
  assert.ok(updatedEvt);
  assert.equal(updatedEvt.seq, 3);

  // PII shredded at rest; decrypt to assert replay correctness — the event
  // still captures the full new shape (avatar + vibe filled in).
  assert.notEqual(updatedEvt.data.name, 'Matt');
  const key = await readDataKey({ aggregateId: `user#${user.sub}`, tables: config.tables });
  assert.ok(key, 'expected a crypto-shred key for the aggregate');
  const clear = decryptEventPii(updatedEvt, key);
  assert.equal(clear.data.name, 'Matt');
  assert.equal(clear.data.avatar, '\u{1F33F}');
  assert.equal(clear.data.vibeMessage, 'walks');
});

test('PUT /me/profile: idempotent retry with same commandId returns 200, no second event', async () => {
  const headers = authHeaders();
  const cmd = randomUUID();

  const r1 = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT', headers,
    body: JSON.stringify({ commandId: cmd, name: 'Matt' }),
  });
  assert.equal(r1.status, 200);

  const r2 = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT', headers,
    body: JSON.stringify({ commandId: cmd, name: 'Matt' }),
  });
  assert.equal(r2.status, 200);

  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  // registered + created + updated (one) = 3
  assert.equal(events.Items.length, 3);
});

test('PUT /me/profile: two distinct updates accumulate events', async () => {
  const headers = authHeaders();

  const r1 = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT', headers,
    body: JSON.stringify({ commandId: randomUUID(), avatar: '\u{1F340}' }),
  });
  assert.equal(r1.status, 200);

  const r2 = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT', headers,
    body: JSON.stringify({ commandId: randomUUID(), vibeMessage: 'sourdough days' }),
  });
  assert.equal(r2.status, 200);

  const userRow = await ddb.send(new GetCommand({
    TableName: config.tables.users,
    Key: { userId: user.sub },
    ConsistentRead: true,
  }));
  assert.equal(userRow.Item.avatar, '\u{1F340}');
  assert.equal(userRow.Item.vibeMessage, 'sourdough days');
  assert.equal(userRow.Item.name, 'Matthew'); // never changed
  assert.equal(userRow.Item.seq, 4);
});

test('PUT /me/profile: returns 400 when no fields are supplied', async () => {
  const response = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT', headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(response.status, 400);
});

test('PUT /me/profile: returns 401 without auth', async () => {
  const response = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID(), name: 'Matt' }),
  });
  assert.equal(response.status, 401);
});
