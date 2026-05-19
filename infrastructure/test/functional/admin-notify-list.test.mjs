// Functional tests for GET /admin/notify-list against the real test stack.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb } from '../helpers/cleanup.mjs';

let config;
let admin;
let normal;
let notifyEmail;

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  admin = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `admin-${randomUUID()}@example.test`,
    admin: true,
  });
  normal = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `user-${randomUUID()}@example.test`,
  });

  // Seed a notify-list entry via the public endpoint so the admin
  // browser has something to show.
  notifyEmail = `notify-${randomUUID()}@example.test`.toLowerCase();
  const res = await fetch(`${config.apiUrl}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commandId: randomUUID(),
      email: notifyEmail,
      postalCode: '94110',
    }),
  });
  assert.equal(res.status, 201);
});

afterEach(async () => {
  if (notifyEmail) {
    const aggregateId = `notify#${notifyEmail}`;
    const events = await ddb.send(new QueryCommand({
      TableName: config.tables.eventsLog,
      KeyConditionExpression: 'aggregateId = :a',
      ExpressionAttributeValues: { ':a': aggregateId },
    }));
    for (const ev of events.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: config.tables.eventsLog,
        Key: { aggregateId: ev.aggregateId, seq: ev.seq },
      }));
    }
    notifyEmail = null;
  }
  for (const u of [admin, normal]) {
    if (!u) continue;
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: u.email }); } catch { /* ignore */ }
  }
  admin = null; normal = null;
});

test('GET /admin/notify-list: admin sees the seeded entry', async () => {
  const response = await fetch(`${config.apiUrl}/admin/notify-list`, {
    headers: { 'Authorization': `Bearer ${admin.idToken}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.count >= 1);
  const ours = body.entries.find((e) => e.email === notifyEmail);
  assert.ok(ours, 'expected our notify entry in the list');
  assert.equal(ours.postalCode, '94110');
  assert.equal(ours.country, 'US');
  assert.ok(ours.requestedAt);
});

test('GET /admin/notify-list: non-admin user gets 403', async () => {
  const response = await fetch(`${config.apiUrl}/admin/notify-list`, {
    headers: { 'Authorization': `Bearer ${normal.idToken}` },
  });
  assert.equal(response.status, 403);
});

test('GET /admin/notify-list: without auth returns 401', async () => {
  const response = await fetch(`${config.apiUrl}/admin/notify-list`);
  assert.equal(response.status, 401);
});
