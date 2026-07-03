// Functional tests for slice-7 event edits + suggestion gate on planned events.

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
    const evs = await ddb.send(new QueryCommand({
      TableName: config.tables.eventsLog,
      KeyConditionExpression: 'aggregateId = :a',
      ExpressionAttributeValues: { ':a': `event#${eventId}` },
    }));
    for (const ev of evs.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: config.tables.eventsLog,
        Key: { aggregateId: ev.aggregateId, seq: ev.seq },
      }));
    }
    const sugs = await ddb.send(new QueryCommand({
      TableName: config.tables.suggestions,
      KeyConditionExpression: 'eventId = :e',
      ExpressionAttributeValues: { ':e': eventId },
    }));
    for (const s of sugs.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: config.tables.suggestions,
        Key: { eventId: s.eventId, suggestionId: s.suggestionId },
      }));
      const sugAgg = `suggestion#${s.suggestionId}`;
      const logs = await ddb.send(new QueryCommand({
        TableName: config.tables.eventsLog,
        KeyConditionExpression: 'aggregateId = :a',
        ExpressionAttributeValues: { ':a': sugAgg },
      }));
      for (const ev of logs.Items ?? []) {
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

async function proposeEvent(token) {
  const body = {
    commandId: randomUUID(),
    title: `Coffee walk ${randomUUID().slice(0, 6)}`,
    startTime: '2026-12-01T16:00:00.000Z',
    endTime: '2026-12-01T17:30:00.000Z',
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

test('edit: organizer can change title + location on a proposed event', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const res = await fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), title: 'New title', location: 'New venue' }),
  });
  assert.equal(res.status, 201);
  const row = await readEvent(organizer.idToken, eventId);
  assert.equal(row.title, 'New title');
  assert.equal(row.location, 'New venue');
  assert.ok(row.lastEditedAt, 'expected lastEditedAt to be set');
});

test('edit: non-organizer gets 403', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const res = await fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), title: 'Sneaky' }),
  });
  assert.equal(res.status, 403);
});

test('edit: works on a planned event', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  await fetch(`${config.apiUrl}/events/${eventId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  const res = await fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), location: 'Alternative venue' }),
  });
  assert.equal(res.status, 201);
});

test('suggestions: still open after event is planned', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  await fetch(`${config.apiUrl}/events/${eventId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  const res = await fetch(`${config.apiUrl}/events/${eventId}/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), text: 'Could we move it 30 min later?', tags: ['time'] }),
  });
  assert.equal(res.status, 201);
});

test('edit: 409 on cancelled event', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  await fetch(`${config.apiUrl}/events/${eventId}/cancel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  const res = await fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), title: 'Too late' }),
  });
  assert.equal(res.status, 409);
});
