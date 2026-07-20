// Functional tests for GET /events/:eventId/attendees — the roster behind
// the counts (docs/external-events.md, docs/debrief.md → people step).
//
// The privacy contract is the point: first names + opaque per-event refs
// only, userIds never reach a client. The refs are the handles the debrief
// people step posts back, so this suite also proves that round trip
// end-to-end: roster ref → debrief tap → 201.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeEventAggregate } from '../helpers/cleanup.mjs';
import { isoFromNow, HOUR } from '../helpers/time.mjs';

let config;
let admin;
let m1;
let m2;
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
  m1 = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `member1-${randomUUID()}@example.test`,
  });
  m2 = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `member2-${randomUUID()}@example.test`,
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
      userIds: [admin, m1, m2].filter(Boolean).map((u) => u.sub),
      tables: config.tables,
    }).catch(() => {});
  }
  for (const u of [admin, m1, m2]) {
    if (!u) continue;
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: u.email }); } catch { /* ignore */ }
  }
  admin = null; m1 = null; m2 = null;
});

async function proposeEvent(token) {
  const res = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      commandId: randomUUID(),
      title: `Roster walk ${randomUUID().slice(0, 6)}`,
      startTime: START,
      endTime: END,
      location: 'Blackbird Bakery',
      organizerName: 'Organizer',
    }),
  });
  assert.equal(res.status, 201);
  const out = await res.json();
  createdEventIds.push(out.eventId);
  return out.eventId;
}

async function setLevel(token, eventId, level) {
  const res = await fetch(`${config.apiUrl}/events/${eventId}/interaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), level }),
  });
  assert.ok([200, 201].includes(res.status), `setLevel ${level}: ${res.status}`);
}

test('attendees: roster groups by level, marks me, and never leaks userIds', async () => {
  const eventId = await proposeEvent(admin.idToken);
  await setLevel(m1.idToken, eventId, 'confirmed');
  await setLevel(m2.idToken, eventId, 'interested');

  const res = await fetch(`${config.apiUrl}/events/${eventId}/attendees`, {
    headers: { Authorization: `Bearer ${m1.idToken}` },
  });
  assert.equal(res.status, 200);
  const raw = await res.text();
  const body = JSON.parse(raw);

  assert.equal(body.eventId, eventId);
  assert.equal(body.confirmed.length, 1);
  assert.equal(body.interested.length, 1);

  // The caller's own entry is flagged, not identified.
  assert.equal(body.confirmed[0].me, true);
  assert.equal('me' in body.interested[0], false);

  // Refs are 16-hex opaque handles; names are strings; no userIds anywhere.
  for (const entry of [...body.confirmed, ...body.interested]) {
    assert.match(entry.ref, /^[0-9a-f]{16}$/);
    assert.equal(typeof entry.name, 'string');
  }
  for (const u of [admin, m1, m2]) {
    assert.equal(raw.includes(u.sub), false, 'roster response must never contain a userId');
  }
});

test('attendees: refs are stable within an event and different across events', async () => {
  const event1 = await proposeEvent(admin.idToken);
  const event2 = await proposeEvent(admin.idToken);
  await setLevel(m1.idToken, event1, 'confirmed');
  await setLevel(m1.idToken, event2, 'confirmed');

  const read = async (eventId) => {
    const res = await fetch(`${config.apiUrl}/events/${eventId}/attendees`, {
      headers: { Authorization: `Bearer ${m1.idToken}` },
    });
    const body = await res.json();
    return body.confirmed.find((e) => e.me).ref;
  };

  const ref1a = await read(event1);
  const ref1b = await read(event1);
  const ref2 = await read(event2);
  assert.equal(ref1a, ref1b, 'ref must be stable within an event');
  assert.notEqual(ref1a, ref2, 'refs must not correlate across events');
});

test('attendees: roster refs round-trip through the debrief people step', async () => {
  const eventId = await proposeEvent(admin.idToken);
  await fetch(`${config.apiUrl}/events/${eventId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  await setLevel(m1.idToken, eventId, 'confirmed');
  await setLevel(m2.idToken, eventId, 'confirmed');

  const rosterRes = await fetch(`${config.apiUrl}/events/${eventId}/attendees`, {
    headers: { Authorization: `Bearer ${m1.idToken}` },
  });
  const roster = await rosterRes.json();
  const otherRef = roster.confirmed.find((e) => !e.me).ref;

  const jump = await fetch(`${config.apiUrl}/admin/time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), action: 'set', datetime: AFTER_END }),
  });
  assert.equal(jump.status, 201);

  // An unknown ref is rejected before anything lands.
  const bad = await fetch(`${config.apiUrl}/events/${eventId}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m1.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(), attended: true, again: 'yes',
      people: [{ ref: 'deadbeefdeadbeef', seeAgain: true }],
    }),
  });
  assert.equal(bad.status, 400);

  // A contradictory mark (tap + avoid) is rejected whole (D49 capture).
  const contradictory = await fetch(`${config.apiUrl}/events/${eventId}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m1.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(), attended: true, again: 'yes',
      people: [{ ref: otherRef, seeAgain: true, avoid: 'didnt-click' }],
    }),
  });
  assert.equal(contradictory.status, 400);

  // A real ref resolves server-side and the debrief lands.
  const good = await fetch(`${config.apiUrl}/events/${eventId}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m1.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(), attended: true, again: 'yes',
      people: [{ ref: otherRef, seeAgain: true }],
    }),
  });
  assert.equal(good.status, 201);

  // The other member's debrief carries a quiet avoidance mark (D49) —
  // accepted, soft de-weight only, and the response reveals nothing.
  const m2Roster = await fetch(`${config.apiUrl}/events/${eventId}/attendees`, {
    headers: { Authorization: `Bearer ${m2.idToken}` },
  }).then((r) => r.json());
  const m1Ref = m2Roster.confirmed.find((e) => !e.me).ref;
  const avoided = await fetch(`${config.apiUrl}/events/${eventId}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m2.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(), attended: true, again: 'yes',
      people: [{ ref: m1Ref, avoid: 'didnt-click' }],
    }),
  });
  assert.equal(avoided.status, 201);
  assert.doesNotMatch(JSON.stringify(await avoided.json()), /avoid/);
});

test('attendees: 404 for an unknown event', async () => {
  const res = await fetch(`${config.apiUrl}/events/no-such-event/attendees`, {
    headers: { Authorization: `Bearer ${m1.idToken}` },
  });
  assert.equal(res.status, 404);
});
