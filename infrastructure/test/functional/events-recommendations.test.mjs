// Functional tests for feed ranking (docs/matching-spec.md): GET /events
// carries an ordered `recommendations` eventId list. These tests pin the
// structural contract — hard constraints are the only gate, ordering is
// the only thing that leaves the server — not any particular order
// (ordering is deliberately noisy; the ranking mechanics are unit-tested).

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeEventAggregate } from '../helpers/cleanup.mjs';
import { isoFromNow, HOUR } from '../helpers/time.mjs';

let config;
let admin;
let member;
let createdEventIds;

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
  member = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `member-${randomUUID()}@example.test`,
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
    await purgeEventAggregate({
      eventId,
      userIds: [admin, member].filter(Boolean).map((u) => u.sub),
      tables: config.tables,
    }).catch(() => {});
  }
  for (const u of [admin, member]) {
    if (!u) continue;
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: u.email }); } catch { /* ignore */ }
  }
  admin = null; member = null;
});

async function propose(startMs, endMs, schedule = false) {
  const res = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(),
      title: `Walk ${randomUUID().slice(0, 6)}`,
      startTime: isoFromNow(startMs),
      endTime: isoFromNow(endMs),
      location: 'Waterfront',
      organizerName: 'Organizer',
    }),
  });
  assert.equal(res.status, 201);
  const { eventId } = await res.json();
  createdEventIds.push(eventId);
  if (schedule) {
    await fetch(`${config.apiUrl}/events/${eventId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
      body: JSON.stringify({ commandId: randomUUID() }),
    });
  }
  return eventId;
}

async function feedFor(token) {
  const res = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  return res.json();
}

test('recommendations: hard constraints are the only gate — committed and conflicting events drop out', async () => {
  const committed = await propose(1 * HOUR, 2 * HOUR, true);       // member will confirm
  const conflicting = await propose(1.5 * HOUR, 2.5 * HOUR, true); // overlaps `committed`
  const clear = await propose(4 * HOUR, 5 * HOUR, true);           // feasible

  const confirm = await fetch(`${config.apiUrl}/events/${committed}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), level: 'confirmed' }),
  });
  assert.ok([200, 201].includes(confirm.status));

  const feed = await feedFor(member.idToken);
  assert.ok(Array.isArray(feed.recommendations));
  assert.ok(feed.recommendations.includes(clear), 'feasible event should be recommended');
  assert.equal(feed.recommendations.includes(committed), false,
    'an event you already confirmed is a plan, not a recommendation');
  assert.equal(feed.recommendations.includes(conflicting), false,
    'an event overlapping a confirmed commitment is infeasible');

  // Every recommended id refers to a listed event, and no ranking
  // numbers ride on the rows — ordering is the only output.
  const listedIds = new Set(feed.events.map((e) => e.eventId));
  for (const id of feed.recommendations) {
    assert.ok(listedIds.has(id), `recommended id ${id} must be in the event list`);
  }
  for (const e of feed.events) {
    assert.equal('score' in e, false);
    assert.equal('fit' in e, false);
    assert.equal('nudge' in e, false);
  }
});

test('recommendations: past events are never recommended', async () => {
  const eventId = await propose(1 * HOUR, 2 * HOUR, true);

  const jump = await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), action: 'set', datetime: isoFromNow(3 * HOUR) }),
  });
  assert.equal(jump.status, 201);

  const feed = await feedFor(member.idToken);
  assert.equal(feed.recommendations.includes(eventId), false,
    'an over event is not a candidate');
});
