// Functional tests for the locality register + structured constraints
// (D62, docs/localities-and-constraints.md): the served register, the
// organizer-declared event locality, the wish capture, and the
// constraint correction — end to end against the deployed stack.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate, purgeEventAggregate } from '../helpers/cleanup.mjs';
import { HOUR } from '../helpers/time.mjs';

let config;
let user;
let createdEventIds;

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  user = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `traveler-${randomUUID()}@example.test`,
  });
  createdEventIds = [];
  const res = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(res.status, 201);
});

afterEach(async () => {
  for (const eventId of createdEventIds) {
    await purgeEventAggregate({
      eventId, userIds: [user?.sub].filter(Boolean), tables: config.tables,
    }).catch(() => {});
  }
  if (user) {
    try { await purgeUserAggregate({ userId: user.sub, tables: config.tables }); } catch { /* ignore */ }
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: user.email }); } catch { /* ignore */ }
  }
  user = null;
});

async function authed(method, path, body) {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

test('localities: the served register, event locality, wish capture, and reach correction', async () => {
  // The register is served — curated entries with symmetric typed edges.
  const register = await authed('GET', '/localities');
  assert.equal(register.status, 200);
  const byId = new Map(register.body.localities.map((l) => [l.id, l]));
  assert.equal(register.body.community.homeLocalityId, 'bainbridge-island');
  assert.ok(byId.get('bainbridge-island').neighbors.includes('poulsbo'));
  assert.ok(byId.get('seattle').crossings.includes('bainbridge-island'));

  // Organizer-declared event locality: validated, projected onto the row.
  const timeRes = await authed('GET', '/time');
  const simulatedNow = Date.parse(timeRes.body.simulatedTime);
  const propose = await authed('POST', '/events', {
    commandId: randomUUID(),
    title: `Wood-shop night ${randomUUID().slice(0, 6)}`,
    startTime: new Date(simulatedNow + 2 * HOUR).toISOString(),
    endTime: new Date(simulatedNow + 3 * HOUR).toISOString(),
    location: 'The maker space',
    localityId: 'bremerton',
    organizerName: 'Traveler',
  });
  assert.equal(propose.status, 201);
  createdEventIds.push(propose.body.eventId);

  const bad = await authed('POST', '/events', {
    commandId: randomUUID(), title: 'Nowhere night', localityId: 'atlantis',
  });
  assert.equal(bad.status, 400);

  const feed = await authed('GET', '/events');
  assert.equal(feed.status, 200);
  assert.equal(feed.body.homeLocalityId, 'bainbridge-island');
  const row = feed.body.events.find((e) => e.eventId === propose.body.eventId);
  assert.equal(row.localityId, 'bremerton');

  // "I wish this was closer": capture-only; idempotent retry converges;
  // the response reveals nothing beyond acknowledgment.
  const wishId = randomUUID();
  const wish = await authed('POST', `/events/${propose.body.eventId}/wish`, {
    commandId: wishId,
  });
  assert.equal(wish.status, 201);
  assert.equal(wish.body.status, 'wish-recorded');
  const retry = await authed('POST', `/events/${propose.body.eventId}/wish`, {
    commandId: wishId,
  });
  assert.equal(retry.status, 200);
  assert.equal((await authed('POST', `/events/${propose.body.eventId}/wish`, {
    commandId: randomUUID(), wish: 'cheaper',
  })).status, 400);

  // Constraint corrections round-trip the same command path as D59.
  assert.equal((await authed('POST', '/me/model/correction', {
    commandId: randomUUID(),
    correction: { type: 'constraint', travelReach: 'nearby' },
  })).status, 201);
  assert.equal((await authed('POST', '/me/model/correction', {
    commandId: randomUUID(),
    correction: { type: 'constraint', localityId: 'bremerton', feels: 'closer' },
  })).status, 201);
  assert.equal((await authed('POST', '/me/model/correction', {
    commandId: randomUUID(),
    correction: { type: 'constraint', travelReach: 'the-moon' },
  })).status, 400);
});
