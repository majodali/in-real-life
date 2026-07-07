// Functional tests for slice-8 debrief endpoint. Relies on the workshop
// time controls (POST /admin/time) to advance past the event's endTime.

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

// Relative to real now so fixtures never rot: the event runs +1h..+2h, and
// AFTER_END is where the workshop clock jumps to make it debriefable.
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
    email: `organizer-${randomUUID()}@example.test`,
    admin: true,
  });
  other = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `other-${randomUUID()}@example.test`,
  });
  createdEventIds = [];
});

afterEach(async () => {
  // Reset workshop clock so other tests start at real time.
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

async function proposeEvent(token, startIn = START, endAt = END) {
  const body = {
    commandId: randomUUID(),
    title: `Coffee walk ${randomUUID().slice(0, 6)}`,
    startTime: startIn,
    endTime: endAt,
    location: 'Blackbird Bakery',
    organizerName: 'Organizer',
  };
  const res = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`propose failed: ${res.status}`);
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

async function setLevel(token, eventId, level) {
  return fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), level }),
  });
}

async function jumpClockTo(datetime) {
  return fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), action: 'set', datetime }),
  });
}

test('debrief: confirmed attendee can debrief once event is over', async () => {
  const eventId = await proposeEvent(admin.idToken);
  await fetch(`${config.apiUrl}/events/${eventId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  await setLevel(other.idToken, eventId, 'confirmed');

  // Advance the clock past endTime.
  const jump = await jumpClockTo(AFTER_END);
  assert.equal(jump.status, 201);

  const res = await fetch(`${config.apiUrl}/events/${eventId}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), rating: 4, notes: 'Lovely.' }),
  });
  assert.equal(res.status, 201);

  const row = await readEvent(other.idToken, eventId);
  assert.ok(row.myDebrief, 'expected myDebrief on the list response');
  assert.equal(row.myDebrief.rating, 4);
  assert.equal(row.myDebrief.notes, 'Lovely.');
});

test('debrief: 409 if user was not confirmed', async () => {
  const eventId = await proposeEvent(admin.idToken);
  await fetch(`${config.apiUrl}/events/${eventId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  await jumpClockTo(AFTER_END);

  const res = await fetch(`${config.apiUrl}/events/${eventId}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), rating: 4 }),
  });
  assert.equal(res.status, 409);
});

test('debrief: 409 if event not yet over', async () => {
  const eventId = await proposeEvent(admin.idToken, '2099-01-01T00:00:00Z', '2099-01-01T01:00:00Z');
  await fetch(`${config.apiUrl}/events/${eventId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  await setLevel(other.idToken, eventId, 'confirmed');

  const res = await fetch(`${config.apiUrl}/events/${eventId}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), rating: 4 }),
  });
  assert.equal(res.status, 409);
});
