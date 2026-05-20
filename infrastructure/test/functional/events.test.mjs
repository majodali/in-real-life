// Functional tests for POST /events and GET /events against the real test stack.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb } from '../helpers/cleanup.mjs';

let config;
let organizer;
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
  createdEventIds = [];
});

afterEach(async () => {
  for (const eventId of createdEventIds) {
    // Clean state row.
    await ddb.send(new DeleteCommand({
      TableName: config.tables.events,
      Key: { eventId },
    }));
    // Clean event log entries for that aggregate.
    const aggregateId = `event#${eventId}`;
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
  createdEventIds = [];

  if (organizer) {
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: organizer.email }); } catch { /* ignore */ }
    organizer = null;
  }
});

const sampleBody = () => ({
  commandId: randomUUID(),
  title: `Coffee walk ${randomUUID().slice(0, 6)}`,
  description: 'Easy walk along the waterfront, coffee after.',
  startTime: '2026-06-01T16:00:00.000Z',
  endTime: '2026-06-01T17:30:00.000Z',
  location: 'Blackbird Bakery',
  organizerName: 'Test Organizer',
  minimumAttendance: 3,
});

// ─── POST /events ───

test('POST /events: authenticated user proposes an event', async () => {
  const body = sampleBody();
  const response = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201);
  const out = await response.json();
  assert.ok(out.eventId, 'expected eventId in response');
  createdEventIds.push(out.eventId);
});

test('POST /events: retry with same commandId returns 200 + same eventId', async () => {
  const body = sampleBody();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` };

  const first = await fetch(`${config.apiUrl}/events`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(first.status, 201);
  const { eventId } = await first.json();
  createdEventIds.push(eventId);

  const second = await fetch(`${config.apiUrl}/events`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(second.status, 200);
  const out2 = await second.json();
  assert.equal(out2.eventId, eventId);
});

test('POST /events: without auth returns 401', async () => {
  const response = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleBody()),
  });
  assert.equal(response.status, 401);
});

test('POST /events: missing title returns 400', async () => {
  const body = sampleBody();
  delete body.title;
  const response = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 400);
});

// ─── GET /events ───

test('GET /events: returns the proposed event with its state-row shape', async () => {
  const proposeBody = sampleBody();
  const propose = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify(proposeBody),
  });
  assert.equal(propose.status, 201);
  const { eventId } = await propose.json();
  createdEventIds.push(eventId);

  const list = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${organizer.idToken}` },
  });
  assert.equal(list.status, 200);
  const body = await list.json();
  const ours = body.events.find((e) => e.eventId === eventId);
  assert.ok(ours, 'expected the proposed event in the list');
  assert.equal(ours.title, proposeBody.title);
  assert.equal(ours.source, 'community');
  assert.equal(ours.lifecycleState, 'proposed');
  assert.equal(ours.location, 'Blackbird Bakery');
  assert.equal(ours.organizerName, 'Test Organizer');
  assert.equal(ours.interestCount, 0);
  assert.equal(ours.confirmedCount, 0);
});

test('GET /events: without auth returns 401', async () => {
  const response = await fetch(`${config.apiUrl}/events`);
  assert.equal(response.status, 401);
});
