// Functional tests for the time-derived lifecycle states (in-progress, over)
// and the gating that keys off them. Uses the workshop clock (POST /admin/time)
// to move a scheduled event across its start and end boundaries, then asserts
// both the feed's effectiveState and that change surfaces (interest,
// suggestions, edits, cancel) open and close at the right moments.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb } from '../helpers/cleanup.mjs';
import { isoFromNow, HOUR, MINUTE } from '../helpers/time.mjs';

let config;
let admin;
let other;
let createdEventIds;

// The event sits an hour in the (real) future so it is genuinely planned at
// test time; the clock jumps land inside and after it. Relative, never pinned.
const START = isoFromNow(1 * HOUR);
const END = isoFromNow(2 * HOUR + 30 * MINUTE);
const DURING = isoFromNow(1 * HOUR + 45 * MINUTE);
const AFTER = isoFromNow(3 * HOUR);

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
  // Reset the workshop clock so other suites start at real time.
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

async function proposeEvent(token, overrides = {}) {
  const body = {
    commandId: randomUUID(),
    title: `Coffee walk ${randomUUID().slice(0, 6)}`,
    startTime: START,
    endTime: END,
    location: 'Blackbird Bakery',
    organizerName: 'Organizer',
    ...overrides,
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

function putAt(path, token, body = {}) {
  return fetch(`${config.apiUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), ...body }),
  });
}

function postAt(path, token, body = {}) {
  return fetch(`${config.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), ...body }),
  });
}

async function schedule(eventId) {
  return putAt(`/events/${eventId}/schedule`, admin.idToken);
}

function jumpClockTo(datetime) {
  return postAt('/admin/time', admin.idToken, { action: 'set', datetime });
}

async function effectiveStateOf(eventId) {
  const res = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${other.idToken}` },
  });
  const body = await res.json();
  return body.events.find((e) => e.eventId === eventId)?.effectiveState;
}

test('400: endTime is now required at propose time', async () => {
  const res = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(), title: 'No end', startTime: START, location: 'x',
    }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /endTime/);
});

test('timesApproximate round-trips onto the event row', async () => {
  const eventId = await proposeEvent(admin.idToken, { timesApproximate: true });
  const res = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${admin.idToken}` },
  });
  const row = (await res.json()).events.find((e) => e.eventId === eventId);
  assert.equal(row.timesApproximate, true);
});

test('effectiveState moves planned → in-progress → over as the clock advances', async () => {
  const eventId = await proposeEvent(admin.idToken);
  assert.equal((await schedule(eventId)).status, 201);

  // Before the start: still planned.
  assert.equal(await effectiveStateOf(eventId), 'planned');

  // Between start and end: in-progress.
  assert.equal((await jumpClockTo(DURING)).status, 201);
  assert.equal(await effectiveStateOf(eventId), 'in-progress');

  // Past the end: over.
  assert.equal((await jumpClockTo(AFTER)).status, 201);
  assert.equal(await effectiveStateOf(eventId), 'over');
});

test('interest, suggestions and edits all close once the event is in-progress', async () => {
  const eventId = await proposeEvent(admin.idToken);
  await schedule(eventId);

  // While planned, registering interest works.
  assert.equal((await putAt(`/events/${eventId}/interaction`, other.idToken, { level: 'interested' })).status, 201);

  await jumpClockTo(DURING);

  assert.equal((await putAt(`/events/${eventId}/interaction`, other.idToken, { level: 'confirmed' })).status, 409);
  assert.equal((await postAt(`/events/${eventId}/suggestions`, other.idToken, { text: 'too late' })).status, 409);
  assert.equal((await putAt(`/events/${eventId}`, admin.idToken, { title: 'Renamed' })).status, 409);
});

test('cancel is allowed while in-progress but rejected once over', async () => {
  const inProgress = await proposeEvent(admin.idToken);
  await schedule(inProgress);
  await jumpClockTo(DURING);
  assert.equal((await putAt(`/events/${inProgress}/cancel`, admin.idToken)).status, 201);

  const finished = await proposeEvent(admin.idToken);
  await schedule(finished);
  await jumpClockTo(AFTER);
  const res = await putAt(`/events/${finished}/cancel`, admin.idToken);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /over/);
});
