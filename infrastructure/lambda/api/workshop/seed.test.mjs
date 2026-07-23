// Spec for the two-phase workshop seeder (D64 slice 2). Mocked runner,
// Cognito, and DynamoDB document client — the fixture's own invariants
// live in seed-fixture.test.mjs; here we pin the COMMAND shapes the
// seeder emits (they must match what the real handlers emit, or replay
// and projections diverge), the resume logic, the binding rules, and
// the admin gate.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedHandlers } from './seed.mjs';
import {
  SEED_PERSONAS, SEED_EVENTS, seedEventById, personaEmail, SEED_PASSWORD,
} from './seed-fixture.mjs';

const TABLES = {
  usersTable: 'users',
  eventsTable: 'events',
  configTable: 'config',
};

let runnerCalls;
let cognitoCalls;
let userRows; //   email → state row (what the users-table scan returns)
let configItem; // the workshop-seed config row, if any
let eventRows; //  Set of existing catalog eventIds

function makeRunner() {
  return {
    async runCommand(input) {
      runnerCalls.push(input);
      return { cached: false, result: input.result };
    },
  };
}

function makeCognito() {
  return {
    async send(cmd) {
      cognitoCalls.push(cmd);
      const name = cmd.constructor.name;
      const username = cmd.input?.Username;
      if (name === 'AdminCreateUserCommand') {
        return { User: { Attributes: [{ Name: 'sub', Value: `sub-${username}` }] } };
      }
      if (name === 'AdminGetUserCommand') {
        return { UserAttributes: [{ Name: 'sub', Value: `sub-${username}` }] };
      }
      if (name === 'AdminSetUserPasswordCommand') return {};
      throw new Error(`unexpected cognito command ${name}`);
    },
  };
}

function makeClient() {
  return {
    async send(cmd) {
      const name = cmd.constructor.name;
      if (name === 'GetCommand') {
        assert.equal(cmd.input.TableName, TABLES.configTable);
        return { Item: configItem ?? undefined };
      }
      if (name === 'ScanCommand') {
        return { Items: [...userRows.values()] };
      }
      if (name === 'BatchGetCommand') {
        const keys = cmd.input.RequestItems[TABLES.eventsTable].Keys;
        return {
          Responses: {
            [TABLES.eventsTable]: keys
              .filter(({ eventId }) => eventRows.has(eventId))
              .map(({ eventId }) => ({ eventId })),
          },
        };
      }
      throw new Error(`unexpected ddb command ${name}`);
    },
  };
}

function buildHandlers() {
  return createSeedHandlers({
    runner: makeRunner(),
    client: makeClient(),
    cognito: makeCognito(),
    ...TABLES,
    userPoolId: 'pool-1',
    getOffset: async () => ({ offsetMs: 0 }),
    getRequiredAgreement: async () => ({ version: 'v3' }),
  });
}

function makeEvent({ admin = true, body } = {}) {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'admin-1',
            ...(admin ? { 'custom:role': 'admin' } : {}),
          },
        },
      },
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

function completedRow(persona, sub, seq = 6) {
  return {
    userId: sub,
    email: persona.email,
    seq,
    name: persona.name,
    city: 'Somewhere',
    localityVerified: true,
    activated: true,
    onboardingCompletedAt: '2026-07-01T00:00:00Z',
  };
}

beforeEach(() => {
  runnerCalls = [];
  cognitoCalls = [];
  userRows = new Map();
  configItem = null;
  eventRows = new Set();
});

test('both routes are admin-gated', async () => {
  const { getSeedHandler, postSeedHandler } = buildHandlers();
  assert.equal((await getSeedHandler(makeEvent({ admin: false }))).statusCode, 403);
  assert.equal(
    (await postSeedHandler(makeEvent({ admin: false, body: { personas: true } }))).statusCode,
    403,
  );
});

test('personas phase: full chain in order with the admin as actor', async () => {
  const { postSeedHandler } = buildHandlers();
  const first = SEED_PERSONAS[0];
  const res = await postSeedHandler(makeEvent({
    body: { personas: true, personaIds: [first.id] },
  }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.processed, [first.id]);
  assert.equal(body.remaining, 0);
  assert.equal(body.seeded, 1);
  assert.equal(body.bindings.A, 'bainbridge-island');

  // Command 0 pins the bindings + generation on the seed aggregate; the
  // generation salts everything so a torn-down stack re-seeds cleanly.
  const generation = runnerCalls[0].events[0].data.generation;
  assert.ok(generation);
  assert.equal(runnerCalls[0].commandId, `seed:config:${generation}`);
  assert.equal(runnerCalls[0].aggregateId, 'system#workshop-seed');
  assert.equal(runnerCalls[0].events[0].eventType, 'WorkshopSeedConfigured');

  // Then the persona chain, seq 1..6, admin as audited actor.
  const chain = runnerCalls.slice(1);
  assert.deepEqual(
    chain.map((c) => c.events[0].eventType),
    ['UserRegistered', 'UserProfileCreated', 'LocalityVerificationRequested',
      'LocalityVerified', 'UserActivated', 'OnboardingCompleted'],
  );
  assert.deepEqual(chain.map((c) => c.events[0].seq), [1, 2, 3, 4, 5, 6]);
  const sub = `sub-${first.email}`;
  for (const c of chain) {
    assert.equal(c.aggregateId, `user#${sub}`);
    assert.equal(c.actorId, 'user#admin-1');
    assert.match(c.commandId, new RegExp(`^seed:${generation}:p:${first.id}:`));
  }
  const registered = chain[0].events[0].data;
  assert.equal(registered.agreementVersion, 'v3');
  assert.equal(registered.path, 'seed');
  const locality = chain[2].events[0].data;
  assert.equal(locality.postalCode, '98110'); // slot A default: the home locality
  assert.equal(chain[3].events[0].data.method, 'seed');
  const onboarding = chain[5].events[0].data;
  assert.ok(Array.isArray(onboarding.transcript));
  assert.equal(onboarding.extraction.provisional, true);

  // Cognito: create + permanent fixture password.
  assert.deepEqual(
    cognitoCalls.map((c) => c.constructor.name),
    ['AdminCreateUserCommand', 'AdminSetUserPasswordCommand'],
  );
  assert.equal(cognitoCalls[1].input.Password, SEED_PASSWORD);
  assert.equal(cognitoCalls[1].input.Permanent, true);
});

test('personas phase resumes a partial chain from the state row', async () => {
  const persona = SEED_PERSONAS[1];
  const sub = `sub-${persona.email}`;
  userRows.set(persona.email, {
    userId: sub, email: persona.email, seq: 3, name: persona.name, city: 'Poulsbo',
  });
  configItem = {
    localityBindings: { A: 'bainbridge-island', B: 'poulsbo', C: 'seattle' },
    generation: 'gen-1',
  };

  const { postSeedHandler } = buildHandlers();
  const res = await postSeedHandler(makeEvent({
    body: { personas: true, personaIds: [persona.id] },
  }));
  assert.equal(res.statusCode, 200);

  // No config re-emit; only the missing steps, continuing the seq.
  assert.deepEqual(
    runnerCalls.map((c) => c.events[0].eventType),
    ['LocalityVerified', 'UserActivated', 'OnboardingCompleted'],
  );
  assert.deepEqual(runnerCalls.map((c) => c.events[0].seq), [4, 5, 6]);
  // The stored generation salts the resumed steps' commandIds too.
  assert.ok(runnerCalls.every((c) => c.commandId.startsWith('seed:gen-1:p:')));
});

test('fully seeded personas are skipped without touching Cognito', async () => {
  const persona = SEED_PERSONAS[2];
  userRows.set(persona.email, completedRow(persona, `sub-${persona.email}`));
  configItem = { localityBindings: { A: 'bainbridge-island', B: 'poulsbo', C: 'seattle' } };

  const { postSeedHandler } = buildHandlers();
  const res = await postSeedHandler(makeEvent({
    body: { personas: true, personaIds: [persona.id] },
  }));
  const body = JSON.parse(res.body);
  assert.deepEqual(body.processed, []);
  assert.equal(body.seeded, 1);
  assert.equal(body.remaining, 0);
  assert.equal(runnerCalls.length, 0);
  assert.equal(cognitoCalls.length, 0);
});

test('bindings: partial override merges with defaults; invalid ones are refused', async () => {
  const { postSeedHandler } = buildHandlers();
  const res = await postSeedHandler(makeEvent({
    body: { personas: true, personaIds: [], localityBindings: { A: 'poulsbo' } },
  }));
  const body = JSON.parse(res.body);
  assert.deepEqual(body.bindings, { A: 'poulsbo', B: 'poulsbo', C: 'seattle' });

  const bad = await postSeedHandler(makeEvent({
    body: { personas: true, localityBindings: { A: 'atlantis' } },
  }));
  assert.equal(bad.statusCode, 400);

  const badSlot = await postSeedHandler(makeEvent({
    body: { personas: true, localityBindings: { Z: 'poulsbo' } },
  }));
  assert.equal(badSlot.statusCode, 400);
});

test('re-seeding with different bindings is refused; same bindings converge', async () => {
  configItem = { localityBindings: { A: 'bainbridge-island', B: 'poulsbo', C: 'seattle' } };
  const { postSeedHandler } = buildHandlers();

  const conflict = await postSeedHandler(makeEvent({
    body: { personas: true, personaIds: [], localityBindings: { A: 'poulsbo' } },
  }));
  assert.equal(conflict.statusCode, 409);

  const same = await postSeedHandler(makeEvent({
    body: { personas: true, personaIds: [] },
  }));
  assert.equal(same.statusCode, 200);
  assert.equal(runnerCalls.length, 0); // stored config → no re-emit
});

test('events phase requires the personas phase first', async () => {
  const { postSeedHandler } = buildHandlers();
  const res = await postSeedHandler(makeEvent({ body: { events: ['seed-e01'] } }));
  assert.equal(res.statusCode, 409);

  configItem = { localityBindings: { A: 'bainbridge-island', B: 'poulsbo', C: 'seattle' } };
  const unseeded = await postSeedHandler(makeEvent({ body: { events: ['seed-e01'] } }));
  assert.equal(unseeded.statusCode, 409);
  assert.match(JSON.parse(unseeded.body).error, /not seeded yet/);
});

test('unknown catalog event ids are refused', async () => {
  const { postSeedHandler } = buildHandlers();
  const res = await postSeedHandler(makeEvent({ body: { events: ['seed-e99'] } }));
  assert.equal(res.statusCode, 400);
});

test('events phase: propose + schedule + roster + canned debriefs, all deterministic', async () => {
  const spec = seedEventById.get('seed-e01'); // past, planned, debriefed
  configItem = { localityBindings: { A: 'bainbridge-island', B: 'poulsbo', C: 'seattle' } };
  const referenced = new Set([spec.organizer, ...spec.confirmed, ...spec.interested]);
  for (const d of spec.debriefs) {
    referenced.add(d.personaId);
    for (const tap of d.people ?? []) referenced.add(tap.personaId);
  }
  for (const pid of referenced) {
    const persona = SEED_PERSONAS.find((p) => p.id === pid);
    userRows.set(persona.email, completedRow(persona, `sub:${pid}`));
  }

  const { postSeedHandler } = buildHandlers();
  const res = await postSeedHandler(makeEvent({ body: { events: [spec.id] } }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.results, [{ id: spec.id, status: 'added' }]);
  assert.deepEqual(body.remaining, []);

  const proposed = runnerCalls[0];
  assert.equal(proposed.events[0].eventType, 'EventProposed');
  assert.equal(proposed.aggregateId, `event#${spec.id}`);
  assert.equal(proposed.actorId, 'user#admin-1');
  const data = proposed.events[0].data;
  assert.equal(data.organizerId, `sub:${spec.organizer}`);
  assert.equal(data.localityId, 'bainbridge-island'); // slot A binding
  assert.equal(data.source, 'community');
  assert.equal(data.eventTypeId, 'board-game-night');
  assert.equal(data.eventTypeSource, 'derived');
  assert.ok(Date.parse(data.endTime) < Date.now(), 'past event should be over');

  const scheduled = runnerCalls[1];
  assert.equal(scheduled.events[0].eventType, 'EventScheduled');
  assert.equal(scheduled.events[0].seq, 2);

  const interactions = runnerCalls.filter((c) => c.events[0].eventType === 'AttendanceConfirmed'
    || c.events[0].eventType === 'InterestExpressed');
  assert.equal(interactions.length, spec.confirmed.length + spec.interested.length);
  for (const c of interactions) {
    assert.equal(c.events[0].seq, 1);
    assert.equal(c.events[0].data.previousLevel, null);
    assert.match(c.aggregateId, /^interaction#sub:/);
  }

  const debriefs = runnerCalls.filter((c) => c.events[0].eventType === 'DebriefSubmitted');
  assert.equal(debriefs.length, spec.debriefs.length);
  for (const c of debriefs) {
    assert.equal(c.events[0].seq, 2);
    const d = c.events[0].data;
    if (d.attended) {
      assert.ok(['yes', 'maybe', 'no'].includes(d.again));
      assert.equal(d.eventTypeId, 'board-game-night');
      for (const tap of d.people ?? []) {
        assert.match(tap.userId, /^sub:/);
        assert.equal(tap.met, true);
      }
    } else {
      assert.equal(d.again, undefined);
    }
  }
});

test('an idea event seeds untimed, unscheduled, interest-only', async () => {
  const spec = SEED_EVENTS.find((e) => e.status === 'idea');
  configItem = { localityBindings: { A: 'bainbridge-island', B: 'poulsbo', C: 'seattle' } };
  const referenced = new Set([spec.organizer, ...spec.interested]);
  for (const pid of referenced) {
    const persona = SEED_PERSONAS.find((p) => p.id === pid);
    userRows.set(persona.email, completedRow(persona, `sub:${pid}`));
  }

  const { postSeedHandler } = buildHandlers();
  const res = await postSeedHandler(makeEvent({ body: { events: [spec.id] } }));
  assert.equal(res.statusCode, 200);

  const proposed = runnerCalls[0].events[0].data;
  assert.equal(proposed.startTime, undefined);
  assert.equal(runnerCalls.some((c) => c.events[0].eventType === 'EventScheduled'), false);
  assert.equal(runnerCalls.some((c) => c.events[0].eventType === 'AttendanceConfirmed'), false);
  assert.ok(runnerCalls.some((c) => c.events[0].eventType === 'InterestExpressed'));
});

test('GET /admin/seed reports catalog, bindings, fixture password, and live flags', async () => {
  const persona = SEED_PERSONAS[0];
  userRows.set(persona.email, completedRow(persona, 'sub-x'));
  configItem = { localityBindings: { A: 'poulsbo', B: 'poulsbo', C: 'seattle' } };
  eventRows.add('seed-e01');

  const { getSeedHandler } = buildHandlers();
  const res = await getSeedHandler(makeEvent());
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.password, SEED_PASSWORD);
  assert.deepEqual(body.bindings, configItem.localityBindings);
  assert.equal(body.totalPersonas, 50);
  assert.equal(body.seededPersonas, 1);
  assert.equal(body.personas.find((p) => p.id === persona.id).seeded, true);
  assert.equal(body.personas.filter((p) => p.seeded).length, 1);
  const e01 = body.events.find((e) => e.id === 'seed-e01');
  assert.equal(e01.added, true);
  assert.equal(e01.past, true);
  assert.ok(e01.debriefCount >= 3);
  assert.equal(body.events.find((e) => e.id === 'seed-e11').added, false);
});
