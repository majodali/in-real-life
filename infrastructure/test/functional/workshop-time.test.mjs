// Functional tests for workshop time against the real test stack.
//
// Verifies GET /time, POST /admin/time (auth + behaviour), and that an
// active offset shows up on subsequent commands' simulatedTime.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate, ddb } from '../helpers/cleanup.mjs';

let config;
let admin, user;

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  const adminEmail = `test-admin-${randomUUID()}@example.test`;
  admin = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: adminEmail,
    admin: true,
  });

  const userEmail = `test-${randomUUID()}@example.test`;
  user = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: userEmail,
  });
});

afterEach(async () => {
  // Reset workshop time so other tests aren't affected.
  try {
    await fetch(`${config.apiUrl}/admin/time`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${admin.idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: randomUUID(), action: 'reset' }),
    });
    // Clear the system#workshop-time aggregate's events + the config row to
    // avoid pollution across runs (next test sees seq=0 again).
    await ddb.send(new DeleteCommand({
      TableName: config.tables.config,
      Key: { configKey: 'workshop-time' },
    }));
    const events = await ddb.send(new QueryCommand({
      TableName: config.tables.eventsLog,
      KeyConditionExpression: 'aggregateId = :a',
      ExpressionAttributeValues: { ':a': 'system#workshop-time' },
    }));
    for (const ev of events.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: config.tables.eventsLog,
        Key: { aggregateId: ev.aggregateId, seq: ev.seq },
      }));
    }
  } catch { /* ignore */ }

  if (user) {
    try { await purgeUserAggregate({ userId: user.sub, tables: config.tables }); } catch { /* ignore */ }
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: user.email }); } catch { /* ignore */ }
  }
  if (admin) {
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: admin.email }); } catch { /* ignore */ }
  }
  user = null;
  admin = null;
});

function authHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── GET /time ───

test('GET /time: returns wallTime ≈ simulatedTime when no offset is set', async () => {
  const response = await fetch(`${config.apiUrl}/time`, {
    method: 'GET',
    headers: authHeaders(user.idToken),
  });
  assert.equal(response.status, 200);
  const body = await response.json();

  const wall = new Date(body.wallTime).getTime();
  const sim = new Date(body.simulatedTime).getTime();
  assert.ok(Math.abs(wall - sim) < 100, `wallTime and simulatedTime should be ~equal; got diff ${wall - sim}ms`);
  assert.equal(body.offsetMs, 0);
  assert.equal(body.description, 'real time');
});

test('GET /time: requires a JWT (returns 401 without one)', async () => {
  const response = await fetch(`${config.apiUrl}/time`, { method: 'GET' });
  assert.equal(response.status, 401);
});

// ─── POST /admin/time ───

test('POST /admin/time advance hours: subsequent GET /time reflects the offset', async () => {
  const adv = await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: authHeaders(admin.idToken),
    body: JSON.stringify({ commandId: randomUUID(), action: 'advance', hours: 2 }),
  });
  assert.equal(adv.status, 201);
  const advBody = await adv.json();
  assert.equal(advBody.offsetMs, 7200000);

  const time = await fetch(`${config.apiUrl}/time`, { headers: authHeaders(admin.idToken) });
  const t = await time.json();
  const wall = new Date(t.wallTime).getTime();
  const sim = new Date(t.simulatedTime).getTime();
  assert.ok(sim - wall >= 7200000 - 1000 && sim - wall <= 7200000 + 1000, `expected ~2h diff, got ${sim - wall}ms`);
});

test('POST /admin/time reset: brings offset back to zero', async () => {
  await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: authHeaders(admin.idToken),
    body: JSON.stringify({ commandId: randomUUID(), action: 'advance', hours: 5 }),
  });

  const reset = await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: authHeaders(admin.idToken),
    body: JSON.stringify({ commandId: randomUUID(), action: 'reset' }),
  });
  assert.equal(reset.status, 201);

  const time = await fetch(`${config.apiUrl}/time`, { headers: authHeaders(admin.idToken) });
  const t = await time.json();
  assert.equal(t.offsetMs, 0);
});

test('POST /admin/time: an offset is reflected in subsequent registration events\' simulatedTime', async () => {
  const offsetHours = 2;
  await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: authHeaders(admin.idToken),
    body: JSON.stringify({ commandId: randomUUID(), action: 'advance', hours: offsetHours }),
  });

  // Now register the (non-admin) user.
  const reg = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: authHeaders(user.idToken),
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(reg.status, 201);

  // Read the event from the log.
  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 1);
  const evt = events.Items[0];
  const wall = new Date(evt.wallTime).getTime();
  const sim = new Date(evt.simulatedTime).getTime();
  const expected = offsetHours * 3600000;
  assert.ok(
    sim - wall >= expected - 1000 && sim - wall <= expected + 1000,
    `expected simulatedTime - wallTime ≈ ${expected}ms, got ${sim - wall}ms`,
  );
});

test('POST /admin/time: returns 403 for a non-admin user', async () => {
  const response = await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: authHeaders(user.idToken),
    body: JSON.stringify({ commandId: randomUUID(), action: 'reset' }),
  });
  assert.equal(response.status, 403);
});

test('POST /admin/time: returns 401 without a JWT', async () => {
  const response = await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID(), action: 'reset' }),
  });
  assert.equal(response.status, 401);
});

test('POST /admin/time: returns 400 for invalid action', async () => {
  const response = await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: authHeaders(admin.idToken),
    body: JSON.stringify({ commandId: randomUUID(), action: 'bogus' }),
  });
  assert.equal(response.status, 400);
});
