// Functional tests for the slice-3 interaction endpoints
// (PUT/DELETE /events/:eventId/interaction) and the myLevel field on
// GET /events. Runs against the real test stack.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb } from '../helpers/cleanup.mjs';

let config;
let organizer;
let other;
let createdEventIds;

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  organizer = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `organizer-${randomUUID()}@example.test`,
  });
  other = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `other-${randomUUID()}@example.test`,
  });
  createdEventIds = [];
});

afterEach(async () => {
  for (const eventId of createdEventIds) {
    // Clean state row + any interactions + event-log entries.
    await ddb.send(new DeleteCommand({ TableName: config.tables.events, Key: { eventId } }));
    for (const u of [organizer, other]) {
      if (!u) continue;
      await ddb.send(new DeleteCommand({
        TableName: config.tables.interactions,
        Key: { userId: u.sub, eventId },
      })).catch(() => {});
    }
    const aggregateIds = [
      `event#${eventId}`,
      organizer && `interaction#${organizer.sub}#${eventId}`,
      other && `interaction#${other.sub}#${eventId}`,
    ].filter(Boolean);
    for (const aggregateId of aggregateIds) {
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
    }
  }
  createdEventIds = [];

  for (const u of [organizer, other]) {
    if (!u) continue;
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: u.email }); } catch { /* ignore */ }
  }
  organizer = null; other = null;
});

async function proposeEvent(token, overrides = {}) {
  const body = {
    commandId: randomUUID(),
    title: `Coffee walk ${randomUUID().slice(0, 6)}`,
    startTime: '2026-06-01T16:00:00.000Z',
    endTime: '2026-06-01T17:30:00.000Z',
    location: 'Blackbird Bakery',
    organizerName: 'Organizer',
    ...overrides,
  };
  const res = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`propose failed: ${res.status} ${await res.text()}`);
  const out = await res.json();
  createdEventIds.push(out.eventId);
  return out.eventId;
}

async function setInteraction(token, eventId, level) {
  return fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), level }),
  });
}

async function withdrawInteraction(token, eventId) {
  return fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
}

async function readEvent(token, eventId) {
  const res = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.events.find((e) => e.eventId === eventId);
}

// ─── Express interest, then confirm, then withdraw ───

test('full interaction lifecycle: interest → confirm → withdraw', async () => {
  const eventId = await proposeEvent(organizer.idToken);

  const r1 = await setInteraction(other.idToken, eventId, 'interested');
  assert.equal(r1.status, 201);
  let row = await readEvent(other.idToken, eventId);
  assert.equal(row.interestCount, 1);
  assert.equal(row.confirmedCount, 0);
  assert.equal(row.myLevel, 'interested');

  const r2 = await setInteraction(other.idToken, eventId, 'confirmed');
  assert.equal(r2.status, 201);
  row = await readEvent(other.idToken, eventId);
  assert.equal(row.interestCount, 0);
  assert.equal(row.confirmedCount, 1);
  assert.equal(row.myLevel, 'confirmed');

  const r3 = await withdrawInteraction(other.idToken, eventId);
  assert.equal(r3.status, 201);
  row = await readEvent(other.idToken, eventId);
  assert.equal(row.interestCount, 0);
  assert.equal(row.confirmedCount, 0);
  assert.equal(row.myLevel, null);
});

test('PUT same level twice: second is a 200 no-op', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r1 = await setInteraction(other.idToken, eventId, 'interested');
  assert.equal(r1.status, 201);
  const r2 = await setInteraction(other.idToken, eventId, 'interested');
  assert.equal(r2.status, 200);
  const row = await readEvent(other.idToken, eventId);
  assert.equal(row.interestCount, 1);
});

test('DELETE when nothing to withdraw: 200 no-op', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r = await withdrawInteraction(other.idToken, eventId);
  assert.equal(r.status, 200);
});

test('myLevel: distinct per caller', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  await setInteraction(other.idToken, eventId, 'interested');
  await setInteraction(organizer.idToken, eventId, 'confirmed');

  const otherView = await readEvent(other.idToken, eventId);
  const organizerView = await readEvent(organizer.idToken, eventId);
  assert.equal(otherView.myLevel, 'interested');
  assert.equal(organizerView.myLevel, 'confirmed');
  // Both see the same counts.
  assert.equal(otherView.interestCount, 1);
  assert.equal(otherView.confirmedCount, 1);
});

test('PUT without auth: 401', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r = await fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID(), level: 'interested' }),
  });
  assert.equal(r.status, 401);
});

test('PUT bad level: 400', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r = await fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), level: 'going' }),
  });
  assert.equal(r.status, 400);
});

test('PUT for unknown event: 404', async () => {
  const r = await setInteraction(other.idToken, 'does-not-exist', 'interested');
  assert.equal(r.status, 404);
});
