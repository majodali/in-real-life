// Functional tests for the slice-4 lifecycle endpoints
// (PUT /events/:id/schedule, /cancel, /auto-plan) and the auto-plan side
// effect on confirm.

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
    startTime: '2026-12-01T16:00:00.000Z',
    endTime: '2026-12-01T17:30:00.000Z',
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

async function readEvent(token, eventId) {
  const res = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.events.find((e) => e.eventId === eventId);
}

async function putAt(path, token, body = {}) {
  return fetch(`${config.apiUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), ...body }),
  });
}

// ─── Schedule ───

test('schedule: organizer can schedule a proposed event', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const res = await putAt(`/events/${eventId}/schedule`, organizer.idToken);
  assert.equal(res.status, 201);
  const row = await readEvent(organizer.idToken, eventId);
  assert.equal(row.lifecycleState, 'planned');
});

test('schedule: non-organizer gets 403', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const res = await putAt(`/events/${eventId}/schedule`, other.idToken);
  assert.equal(res.status, 403);
});

test('schedule: scheduling an already-planned event returns 409', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r1 = await putAt(`/events/${eventId}/schedule`, organizer.idToken);
  assert.equal(r1.status, 201);
  const r2 = await putAt(`/events/${eventId}/schedule`, organizer.idToken);
  assert.equal(r2.status, 409);
});

// ─── Cancel ───

test('cancel: organizer can cancel a proposed event', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const res = await putAt(`/events/${eventId}/cancel`, organizer.idToken, { reason: 'Low interest' });
  assert.equal(res.status, 201);
  const row = await readEvent(organizer.idToken, eventId);
  assert.equal(row.lifecycleState, 'cancelled');
  assert.equal(row.cancellationReason, 'Low interest');
});

test('cancel: organizer can cancel a planned event (rare path)', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  await putAt(`/events/${eventId}/schedule`, organizer.idToken);
  const res = await putAt(`/events/${eventId}/cancel`, organizer.idToken);
  assert.equal(res.status, 201);
});

test('cancel: interactions on a cancelled event return 409', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  await putAt(`/events/${eventId}/cancel`, organizer.idToken);
  const res = await fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), level: 'interested' }),
  });
  assert.equal(res.status, 409);
});

// ─── Auto-plan ───

test('auto-plan: organizer can opt in then opt out', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r1 = await putAt(`/events/${eventId}/auto-plan`, organizer.idToken, { autoPlanOnThreshold: true });
  assert.equal(r1.status, 201);
  let row = await readEvent(organizer.idToken, eventId);
  assert.equal(row.autoPlanOnThreshold, true);

  const r2 = await putAt(`/events/${eventId}/auto-plan`, organizer.idToken, { autoPlanOnThreshold: false });
  assert.equal(r2.status, 201);
  row = await readEvent(organizer.idToken, eventId);
  assert.equal(row.autoPlanOnThreshold, false);
});

test('auto-plan: confirming up to threshold auto-schedules the event', async () => {
  // Propose with min=3. Organizer counts as implicit +1, so one confirm
  // tips us to "2 confirmed users + 1 organizer = 3 → threshold reached".
  const eventId = await proposeEvent(organizer.idToken, { minimumAttendance: 3 });
  await putAt(`/events/${eventId}/auto-plan`, organizer.idToken, { autoPlanOnThreshold: true });

  // Organizer confirms (counted in confirmedCount).
  await fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), level: 'confirmed' }),
  });

  // Other confirms — auto-plan should trip.
  await fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), level: 'confirmed' }),
  });

  const row = await readEvent(organizer.idToken, eventId);
  assert.equal(row.lifecycleState, 'planned');
  assert.equal(row.autoTriggered, true);
});

// ─── Effective state ───

test('GET /events: every event has effectiveState computed', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const row = await readEvent(organizer.idToken, eventId);
  assert.equal(row.effectiveState, 'proposed');
});
