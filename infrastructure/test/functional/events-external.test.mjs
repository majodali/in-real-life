// Functional tests for external events (D53, docs/external-events.md):
// steward-listed events IRL didn't create — born planned with the full
// time/place trio, threshold semantics inapplicable, confirmations as
// mutual member commitments, steward-gated edits.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeEventAggregate } from '../helpers/cleanup.mjs';
import { isoFromNow, HOUR } from '../helpers/time.mjs';

let config;
let steward;
let member;
let createdEventIds;

const START = isoFromNow(2 * HOUR);
const END = isoFromNow(3 * HOUR);

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  steward = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `steward-${randomUUID()}@example.test`,
  });
  member = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `member-${randomUUID()}@example.test`,
  });
  createdEventIds = [];
});

afterEach(async () => {
  for (const eventId of createdEventIds) {
    await purgeEventAggregate({
      eventId,
      userIds: [steward, member].filter(Boolean).map((u) => u.sub),
      tables: config.tables,
    }).catch(() => {});
  }
  for (const u of [steward, member]) {
    if (!u) continue;
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: u.email }); } catch { /* ignore */ }
  }
  steward = null; member = null;
});

async function proposeExternal(token, overrides = {}) {
  const res = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      commandId: randomUUID(),
      source: 'external',
      title: `Trivia at the pub ${randomUUID().slice(0, 6)}`,
      startTime: START,
      endTime: END,
      location: 'The Harbour Pub',
      organizerName: 'Steward',
      ...overrides,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 201) createdEventIds.push(body.eventId);
  return { status: res.status, body };
}

async function readEvent(token, eventId) {
  const res = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.events.find((e) => e.eventId === eventId);
}

test('external: born planned with the trio; threshold fields are refused', async () => {
  const missingTrio = await proposeExternal(steward.idToken, { location: undefined });
  assert.equal(missingTrio.status, 400);

  const withThreshold = await proposeExternal(steward.idToken, { minimumAttendance: 3 });
  assert.equal(withThreshold.status, 400);

  const withAutoPlan = await proposeExternal(steward.idToken, { autoPlanOnThreshold: true });
  assert.equal(withAutoPlan.status, 400);

  const ok = await proposeExternal(steward.idToken);
  assert.equal(ok.status, 201);

  const row = await readEvent(steward.idToken, ok.body.eventId);
  assert.equal(row.source, 'external');
  assert.equal(row.lifecycleState, 'planned', 'external events are born planned');
  assert.equal(row.effectiveState, 'planned');
});

test('external: members can confirm (mutual commitment); edits stay steward-gated', async () => {
  const { status, body } = await proposeExternal(steward.idToken);
  assert.equal(status, 201);
  const { eventId } = body;

  // Confirmation is a commitment to other members — allowed and counted.
  const confirm = await fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), level: 'confirmed' }),
  });
  assert.ok([200, 201].includes(confirm.status));
  const row = await readEvent(member.idToken, eventId);
  assert.equal(row.confirmedCount, 1);

  // …but a confirmer gains no administrative power (social, never admin).
  const memberEdit = await fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), title: 'Hijacked title' }),
  });
  assert.equal(memberEdit.status, 403);

  // The steward keeps the listing current.
  const stewardEdit = await fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${steward.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), meetingSpot: 'Back tables, look for the quiz sheets' }),
  });
  assert.equal(stewardEdit.status, 201);
  const edited = await readEvent(steward.idToken, eventId);
  assert.equal(edited.meetingSpot, 'Back tables, look for the quiz sheets');
});
