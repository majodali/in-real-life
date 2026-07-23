// Functional coverage for the workshop seeder (D64 slice 2,
// docs/admin-and-support.md → §2 Workshop) against the deployed
// IrlStackTest. Seeds a SUBSET of personas via the test-only
// `personaIds` hook (real use loads the catalog whole — the hook keeps
// a shared test stack from carrying fifty standing accounts), adds one
// past event (canned debriefs) and one upcoming event, verifies through
// the same surfaces a facilitator would use — including signing in AS a
// seeded persona with the fixture password — then tears everything
// down, seed-generation config included, so the run repeats cleanly.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate, purgeEventAggregate, ddb } from '../helpers/cleanup.mjs';
import {
  seedEventById, personaEmail, SEED_PASSWORD,
} from '../../lambda/api/workshop/seed-fixture.mjs';

const PAST_EVENT = 'seed-e01'; //     past + planned + canned debriefs
const UPCOMING_EVENT = 'seed-e11'; // upcoming + planned

let config;
let admin;
let cognito;
let personaIds; //  the closed persona set the two events reference
let personaSubs; // personaId → sub, resolved after seeding

function referencedPersonas(eventIds) {
  const ids = new Set();
  for (const eventId of eventIds) {
    const spec = seedEventById.get(eventId);
    ids.add(spec.organizer);
    for (const pid of [...spec.confirmed, ...spec.interested]) ids.add(pid);
    for (const debrief of spec.debriefs ?? []) {
      ids.add(debrief.personaId);
      for (const tap of debrief.people ?? []) ids.add(tap.personaId);
    }
  }
  return [...ids];
}

async function asAdmin(method, path, body) {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  config = await loadTestConfig();
  cognito = new CognitoIdentityProviderClient({ region: config.region });
  admin = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `seed-admin-${Date.now()}@example.test`,
    admin: true,
  });
  personaIds = referencedPersonas([PAST_EVENT, UPCOMING_EVENT]);
  personaSubs = new Map();
});

after(async () => {
  // Tear down in reverse: event footprints, persona accounts + models,
  // then the seed config + its aggregate log, so the next run starts a
  // fresh generation instead of colliding with cached command records.
  const subs = [...personaSubs.values()];
  for (const eventId of [PAST_EVENT, UPCOMING_EVENT]) {
    try {
      await purgeEventAggregate({ eventId, userIds: subs, tables: config.tables });
    } catch { /* best-effort */ }
  }
  for (const pid of personaIds) {
    const sub = personaSubs.get(pid);
    if (sub) {
      try { await purgeUserAggregate({ userId: sub, tables: config.tables }); } catch { /* ignore */ }
    }
    try {
      await deleteTestUser({ userPoolId: config.userPoolId, email: personaEmail(pid) });
    } catch { /* ignore */ }
  }
  try {
    await ddb.send(new DeleteCommand({
      TableName: config.tables.config,
      Key: { configKey: 'workshop-seed' },
    }));
    const log = await ddb.send(new QueryCommand({
      TableName: config.tables.eventsLog,
      KeyConditionExpression: 'aggregateId = :a',
      ExpressionAttributeValues: { ':a': 'system#workshop-seed' },
    }));
    for (const ev of log.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: config.tables.eventsLog,
        Key: { aggregateId: ev.aggregateId, seq: ev.seq },
      }));
    }
  } catch { /* best-effort */ }
  if (admin) {
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: admin.email }); } catch { /* ignore */ }
  }
});

test('personas phase: subset seeds fully activated, onboarded members with default bindings', async () => {
  let out = await asAdmin('POST', '/admin/seed', { personas: true, personaIds });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.bindings.A, 'bainbridge-island');
  for (let i = 0; i < 10 && out.body.remaining > 0; i++) {
    out = await asAdmin('POST', '/admin/seed', { personas: true, personaIds });
    assert.equal(out.status, 200, JSON.stringify(out.body));
  }
  assert.equal(out.body.remaining, 0, JSON.stringify(out.body));
  assert.equal(out.body.seeded, personaIds.length);

  const status = await asAdmin('GET', '/admin/seed');
  assert.equal(status.status, 200);
  assert.equal(status.body.password, SEED_PASSWORD);
  for (const pid of personaIds) {
    const row = status.body.personas.find((p) => p.id === pid);
    assert.equal(row.seeded, true, pid);
  }

  // The state a facilitator's member-lookup would see: verified,
  // activated, onboarded — and capture the subs for cleanup.
  for (const pid of personaIds) {
    const lookup = await asAdmin(
      'GET', `/admin/member?email=${encodeURIComponent(personaEmail(pid))}`,
    );
    assert.equal(lookup.status, 200, pid);
    assert.equal(lookup.body.member.localityVerified, true, pid);
    assert.ok(lookup.body.member.activatedAt, pid);
    assert.ok(lookup.body.member.onboardingCompletedAt, pid);
    personaSubs.set(pid, lookup.body.member.userId);
  }
});

test('events phase: catalog events land with rosters + debriefs; re-adding converges', async () => {
  const out = await asAdmin('POST', '/admin/seed', { events: [PAST_EVENT, UPCOMING_EVENT] });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(
    out.body.results.map((r) => [r.id, r.status]),
    [[PAST_EVENT, 'added'], [UPCOMING_EVENT, 'added']],
  );

  const status = await asAdmin('GET', '/admin/seed');
  for (const id of [PAST_EVENT, UPCOMING_EVENT]) {
    assert.equal(status.body.events.find((e) => e.id === id).added, true, id);
  }

  // Idempotent per entity: a second add is a converged replay.
  const again = await asAdmin('POST', '/admin/seed', { events: [PAST_EVENT] });
  assert.equal(again.body.results[0].status, 'already');
});

test('open as: a seeded persona signs in with the fixture password and sees the seeded room', async () => {
  const spec = seedEventById.get(UPCOMING_EVENT);
  const personaId = spec.confirmed[0];
  const auth = await cognito.send(new AdminInitiateAuthCommand({
    UserPoolId: config.userPoolId,
    ClientId: config.userPoolClientId,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: personaEmail(personaId), PASSWORD: SEED_PASSWORD },
  }));
  const idToken = auth.AuthenticationResult?.IdToken;
  assert.ok(idToken, 'fixture credentials must authenticate');

  const res = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  const upcoming = (body.events ?? []).find((e) => e.eventId === UPCOMING_EVENT);
  assert.ok(upcoming, 'the added upcoming event is on the persona’s calendar');
  assert.ok(upcoming.confirmedCount >= spec.confirmed.length, 'pre-set roster projected');
});
