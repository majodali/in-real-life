// Functional tests for the Safety panel's backend (activity register
// E2) on the deployed IrlStackTest: a conduct-flagged debrief reaches
// the admin queue with the decrypted note, acknowledgment is
// event-sourced and empties the queue, health carries the count, and
// the routes are admin-gated.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb } from '../helpers/cleanup.mjs';
import { isoFromNow, HOUR } from '../helpers/time.mjs';

let config;
let admin;
let other;
let createdEventIds;

const START = isoFromNow(1 * HOUR);
const END = isoFromNow(2 * HOUR);
const AFTER_END = isoFromNow(3 * HOUR);

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  admin = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `conduct-admin-${randomUUID()}@example.test`,
    admin: true,
  });
  other = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `conduct-member-${randomUUID()}@example.test`,
  });
  createdEventIds = [];
});

afterEach(async () => {
  await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), action: 'reset' }),
  }).catch(() => {});

  for (const eventId of createdEventIds) {
    await ddb.send(new DeleteCommand({ TableName: config.tables.events, Key: { eventId } }));
    for (const u of [admin, other]) {
      if (!u) continue;
      await ddb.send(new DeleteCommand({
        TableName: config.tables.interactions,
        Key: { userId: u.sub, eventId },
      })).catch(() => {});
    }
    const aggs = [
      `event#${eventId}`,
      admin && `interaction#${admin.sub}#${eventId}`,
      other && `interaction#${other.sub}#${eventId}`,
    ].filter(Boolean);
    for (const aggregateId of aggs) {
      const evs = await ddb.send(new QueryCommand({
        TableName: config.tables.eventsLog,
        KeyConditionExpression: 'aggregateId = :a',
        ExpressionAttributeValues: { ':a': aggregateId },
      }));
      for (const ev of evs.Items ?? []) {
        await ddb.send(new DeleteCommand({
          TableName: config.tables.eventsLog,
          Key: { aggregateId: ev.aggregateId, seq: ev.seq },
        }));
      }
    }
  }
  createdEventIds = [];

  for (const u of [admin, other]) {
    if (!u) continue;
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: u.email }); } catch { /* ignore */ }
  }
  admin = null; other = null;
});

async function api(token, method, path, body) {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function makeReportedDebrief(note) {
  const propose = await api(admin.idToken, 'POST', '/events', {
    commandId: randomUUID(),
    title: `Trivia ${randomUUID().slice(0, 6)}`,
    startTime: START,
    endTime: END,
    location: 'The hall',
    organizerName: 'Org',
  });
  assert.equal(propose.status, 201);
  const eventId = propose.body.eventId;
  createdEventIds.push(eventId);

  await api(admin.idToken, 'PUT', `/events/${eventId}/schedule`, { commandId: randomUUID() });
  await api(other.idToken, 'PUT', `/events/${eventId}/interaction`, {
    commandId: randomUUID(), level: 'confirmed',
  });
  const jump = await api(admin.idToken, 'POST', '/admin/time', {
    commandId: randomUUID(), action: 'set', datetime: AFTER_END,
  });
  assert.equal(jump.status, 201);

  const debrief = await api(other.idToken, 'POST', `/events/${eventId}/debrief`, {
    commandId: randomUUID(),
    attended: true,
    conductConcern: true,
    conductNote: note,
  });
  assert.equal(debrief.status, 201);
  assert.equal(debrief.body.conductAcknowledged, true);
  return eventId;
}

test('conduct: flagged debrief reaches the queue with note; ack empties it; health counts it', async () => {
  const note = `functional test note ${randomUUID().slice(0, 8)}`;
  const eventId = await makeReportedDebrief(note);

  const queue = await api(admin.idToken, 'GET', '/admin/conduct-concerns');
  assert.equal(queue.status, 200);
  const mine = queue.body.concerns.find(
    (c) => c.userId === other.sub && c.eventId === eventId,
  );
  assert.ok(mine, 'expected the concern in the queue');
  assert.equal(mine.note, note, 'expected the decrypted conduct note');
  assert.equal(mine.reporterEmail, other.email);
  assert.ok(mine.eventTitle);

  const health = await api(admin.idToken, 'GET', '/admin/health');
  assert.equal(health.body.safety.ok, true, JSON.stringify(health.body.safety));
  assert.ok(health.body.safety.openConductConcerns >= 1);

  const ack = await api(admin.idToken, 'POST', '/admin/conduct-concerns/ack', {
    commandId: randomUUID(), userId: other.sub, eventId,
  });
  assert.equal(ack.status, 201);

  const after = await api(admin.idToken, 'GET', '/admin/conduct-concerns');
  assert.equal(
    after.body.concerns.some((c) => c.userId === other.sub && c.eventId === eventId),
    false,
    'acknowledged concern must leave the queue',
  );

  const reAck = await api(admin.idToken, 'POST', '/admin/conduct-concerns/ack', {
    commandId: randomUUID(), userId: other.sub, eventId,
  });
  assert.equal(reAck.status, 409);
});

test('conduct: routes are admin-gated', async () => {
  const queue = await api(other.idToken, 'GET', '/admin/conduct-concerns');
  assert.equal(queue.status, 403);
  const ack = await api(other.idToken, 'POST', '/admin/conduct-concerns/ack', {
    commandId: randomUUID(), userId: other.sub, eventId: 'x',
  });
  assert.equal(ack.status, 403);
});
