// Functional tests for event shape (D56, docs/event-shape-prompt.md):
// the propose-time extraction (deterministic stub on this workshop-mode
// stack — tags derived from the title), organizer correction (source
// flips to 'organizer', normalization applies), and clearing.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeEventAggregate } from '../helpers/cleanup.mjs';
import { isoFromNow, HOUR } from '../helpers/time.mjs';

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
    await purgeEventAggregate({
      eventId, userIds: [organizer?.sub].filter(Boolean), tables: config.tables,
    }).catch(() => {});
  }
  if (organizer) {
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: organizer.email }); } catch { /* ignore */ }
  }
  organizer = null;
});

async function propose(title) {
  const res = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(),
      title,
      startTime: isoFromNow(2 * HOUR),
      endTime: isoFromNow(3 * HOUR),
      location: 'The hall',
      organizerName: 'Organizer',
    }),
  });
  assert.equal(res.status, 201);
  const { eventId } = await res.json();
  createdEventIds.push(eventId);
  return eventId;
}

async function readEvent(eventId) {
  const res = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${organizer.idToken}` },
  });
  const body = await res.json();
  return body.events.find((e) => e.eventId === eventId);
}

async function editShape(eventId, shape) {
  return fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), shape }),
  });
}

test('shape: extracted at propose time and lands on the event row', async () => {
  const eventId = await propose('Board games night');
  const row = await readEvent(eventId);
  // The stub derives tags deterministically from the title.
  assert.deepEqual(row.shape, {
    activityTags: ['board', 'games'],
    structure: 'semi-structured',
    doors: ['connect'],
    source: 'extracted',
  });
});

test('event type (D63): served register, derived at propose, organizer-corrected, untyped first-class', async () => {
  // The register serves the organizer picker.
  const regRes = await fetch(`${config.apiUrl}/event-types`, {
    headers: { Authorization: `Bearer ${organizer.idToken}` },
  });
  assert.equal(regRes.status, 200);
  const { eventTypes } = await regRes.json();
  const pottery = eventTypes.find((t) => t.id === 'pottery-class');
  assert.ok(pottery, 'strawman register served');
  assert.equal(pottery.family, 'making');

  // Derived deterministically from the stub shape's tags.
  const eventId = await propose('Pottery wheel intro');
  let row = await readEvent(eventId);
  assert.equal(row.eventTypeId, 'pottery-class');
  assert.equal(row.eventTypeSource, 'derived');

  // The organizer's word replaces the match and is stamped as theirs.
  const correct = await fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), eventTypeId: 'board-game-night' }),
  });
  assert.equal(correct.status, 201);
  row = await readEvent(eventId);
  assert.equal(row.eventTypeId, 'board-game-night');
  assert.equal(row.eventTypeSource, 'organizer');

  // Unknown types are refused; a one-off matches nothing and stays untyped.
  const bad = await fetch(`${config.apiUrl}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), eventTypeId: 'disco-fridays' }),
  });
  assert.equal(bad.status, 400);

  const oneOffId = await propose('Zorbing extravaganza');
  const oneOff = await readEvent(oneOffId);
  assert.equal(oneOff.eventTypeId, undefined, 'untyped, first-class');
});

test('shape: the organizer\'s correction replaces it wholesale, normalized and stamped', async () => {
  const eventId = await propose('Thursday thing');

  const res = await editShape(eventId, {
    activityTags: ['Board  Games!', 'board games', 'Pizza'],
    structure: 'structured',
    doors: ['connect', 'make-learn', 'connect'],
  });
  assert.equal(res.status, 201);

  const row = await readEvent(eventId);
  assert.deepEqual(row.shape, {
    activityTags: ['board games', 'pizza'],
    structure: 'structured',
    doors: ['connect', 'make-learn'],
    source: 'organizer',
  });
});

test('shape: invalid corrections are 400; null clears', async () => {
  const eventId = await propose('Quiet reading hour');

  const badStructure = await editShape(eventId, {
    activityTags: [], structure: 'loose', doors: [],
  });
  assert.equal(badStructure.status, 400);

  const badDoor = await editShape(eventId, {
    activityTags: [], structure: 'structured', doors: ['fun'],
  });
  assert.equal(badDoor.status, 400);

  const cleared = await editShape(eventId, null);
  assert.equal(cleared.status, 201);
  const row = await readEvent(eventId);
  assert.equal(row.shape, null);
});
