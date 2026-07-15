// Functional tests for reflection/coaching (docs/reflection-and-coaching.md):
// POST /me/reflection/turn (ephemeral conversational turns) and
// POST /me/reflection (the close → ReflectionRecorded). Reflection opens
// from a debrief (D44), so the runway is the standard debriefable event.
// The workshop-mode stack answers turns with the deterministic stub (D37).

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate, purgeEventAggregate } from '../helpers/cleanup.mjs';
import { isoFromNow, HOUR } from '../helpers/time.mjs';

let config;
let admin;
let member;
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
    email: `organizer-${randomUUID()}@example.test`,
    admin: true,
  });
  member = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `member-${randomUUID()}@example.test`,
  });
  createdEventIds = [];

  // Reflection is a user-aggregate command — the member must be registered.
  const res = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(res.status, 201);
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
  if (member) {
    try { await purgeUserAggregate({ userId: member.sub, tables: config.tables }); } catch { /* ignore */ }
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: member.email }); } catch { /* ignore */ }
  }
  if (admin) {
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: admin.email }); } catch { /* ignore */ }
  }
  admin = null; member = null;
});

async function makeDebriefedEvent() {
  const proposeRes = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(),
      title: `Reflection walk ${randomUUID().slice(0, 6)}`,
      startTime: START,
      endTime: END,
      location: 'Blackbird Bakery',
      organizerName: 'Organizer',
    }),
  });
  assert.equal(proposeRes.status, 201);
  const { eventId } = await proposeRes.json();
  createdEventIds.push(eventId);

  await fetch(`${config.apiUrl}/events/${eventId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  await fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), level: 'confirmed' }),
  });
  const jump = await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), action: 'set', datetime: AFTER_END }),
  });
  assert.equal(jump.status, 201);

  const debriefRes = await fetch(`${config.apiUrl}/events/${eventId}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), attended: true, again: 'yes' }),
  });
  assert.equal(debriefRes.status, 201);
  return eventId;
}

async function reflectionTurn(eventId, transcript) {
  const res = await fetch(`${config.apiUrl}/me/reflection/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ eventId, transcript }),
  });
  return { status: res.status, body: await res.json() };
}

test('reflection: opens only from a debrief, turns run, and the close records', async () => {
  const eventId = await makeDebriefedEvent();

  // A different (undebriefed) event does not open reflection.
  const closed = await reflectionTurn('no-debrief-here', []);
  assert.equal(closed.status, 409);

  // Turns: the stub opens the space and keeps the envelope contract.
  const first = await reflectionTurn(eventId, []);
  assert.equal(first.status, 200);
  assert.equal(first.body.done, false);
  assert.equal(typeof first.body.message, 'string');
  assert.equal(first.body.perspectiveOffered, 'none');

  // The close: transcript + dual-scope extras ride in ReflectionRecorded.
  const commandId = randomUUID();
  const complete = await fetch(`${config.apiUrl}/me/reflection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({
      commandId,
      eventId,
      transcript: [
        { role: 'member', text: 'It went better than I expected, honestly.' },
        { role: 'us', text: 'That is worth noticing. What made the difference?' },
      ],
      processFeedback: ['The venue was hard to find.'],
      organizerFeedback: { text: 'Thanks for hosting this.', sharing: 'named' },
    }),
  });
  assert.equal(complete.status, 201);
  const body = await complete.json();
  assert.equal(body.status, 'reflection-recorded');
  assert.equal(body.eventId, eventId);

  // Idempotent retry converges.
  const retry = await fetch(`${config.apiUrl}/me/reflection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({
      commandId,
      eventId,
      transcript: [{ role: 'member', text: 'It went better than I expected, honestly.' }],
    }),
  });
  assert.equal(retry.status, 200);
});

test('reflection: close validation — transcript required, vocabulary enforced', async () => {
  const eventId = await makeDebriefedEvent();

  const noTranscript = await fetch(`${config.apiUrl}/me/reflection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), eventId, transcript: [] }),
  });
  assert.equal(noTranscript.status, 400);

  const badPerspective = await fetch(`${config.apiUrl}/me/reflection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(),
      eventId,
      transcript: [{ role: 'member', text: 'hello' }],
      perspectivesOffered: ['made-up-perspective'],
    }),
  });
  assert.equal(badPerspective.status, 400);

  const badSharing = await fetch(`${config.apiUrl}/me/reflection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(),
      eventId,
      transcript: [{ role: 'member', text: 'hello' }],
      organizerFeedback: { text: 'hi', sharing: 'broadcast' },
    }),
  });
  assert.equal(badSharing.status, 400);
});
