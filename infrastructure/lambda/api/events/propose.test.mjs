// Specifications for POST /events.
//
// The handler:
//   - extracts userId from the JWT claims
//   - validates the body (commandId, title, startTime, location required;
//     source defaults to 'community')
//   - generates a fresh eventId (ULID) for new commands; the command runner's
//     idempotency cache returns the prior eventId on retry
//   - composes an EventProposed event and runs the command
//   - returns 201 with { eventId } on first attempt, 200 on cached retry

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createProposeEventHandler } from './propose.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims, body } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  };
}

const validClaims = { sub: 'user-abc', email: 'a@b.c', email_verified: 'true' };
const validBody = {
  commandId: 'cmd-1',
  title: 'Morning coffee & walk',
  description: 'Easy walk along the waterfront.',
  startTime: '2026-06-01T16:00:00.000Z',
  endTime: '2026-06-01T17:30:00.000Z',
  location: 'Blackbird Bakery',
  organizerName: 'Matthew',
  minimumAttendance: 3,
};

let runner, handler, makeId;

beforeEach(() => {
  let counter = 0;
  makeId = spy(() => `evt-${++counter}`);
  runner = {
    runCommand: spy(async ({ result }) => ({ cached: false, events: [], result })),
  };
  handler = createProposeEventHandler({ runner, makeEventId: makeId });
});

// ─── Auth ───

test('401 when no JWT claims', async () => {
  const response = await handler(makeEvent({ body: validBody }));
  assert.equal(response.statusCode, 401);
});

test('401 when claims have no sub', async () => {
  const response = await handler(makeEvent({ claims: { email: 'a@b.c' }, body: validBody }));
  assert.equal(response.statusCode, 401);
});

// ─── Validation ───

test('400 when body is not valid JSON', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: 'not json' }));
  assert.equal(response.statusCode, 400);
});

test('400 when commandId is missing', async () => {
  const { commandId, ...rest } = validBody;
  const response = await handler(makeEvent({ claims: validClaims, body: rest }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /commandId/);
});

test('400 when title is missing', async () => {
  const { title, ...rest } = validBody;
  const response = await handler(makeEvent({ claims: validClaims, body: rest }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /title/);
});

test('400 when startTime is missing', async () => {
  const { startTime, ...rest } = validBody;
  const response = await handler(makeEvent({ claims: validClaims, body: rest }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /startTime/);
});

test('400 when location is missing', async () => {
  const { location, ...rest } = validBody;
  const response = await handler(makeEvent({ claims: validClaims, body: rest }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /location/);
});

test('400 when source is not one of community|external|platform', async () => {
  const body = { ...validBody, source: 'rogue' };
  const response = await handler(makeEvent({ claims: validClaims, body }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /source/);
});

test('400 when startTime is not a parseable ISO datetime', async () => {
  const body = { ...validBody, startTime: 'not a date' };
  const response = await handler(makeEvent({ claims: validClaims, body }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /startTime/i);
});

// ─── Happy path ───

test('returns 201 with the new eventId on first attempt', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 201);
  const out = JSON.parse(response.body);
  assert.equal(out.eventId, 'evt-1');
});

test('mints a fresh eventId via makeEventId', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(makeId.calls.length, 1);
});

test('passes the right command shape to the runner', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(runner.runCommand.calls.length, 1);
  const [args] = runner.runCommand.calls[0];

  assert.equal(args.commandId, 'cmd-1');
  assert.equal(args.aggregateId, 'event#evt-1');
  assert.equal(args.actorId, 'user#user-abc');
  assert.equal(args.events.length, 1);
  assert.equal(args.events[0].eventType, 'EventProposed');
  assert.equal(args.events[0].version, 1);
  assert.equal(args.events[0].seq, 1);
});

test('event data carries the proposed event fields', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const [args] = runner.runCommand.calls[0];
  const d = args.events[0].data;
  assert.equal(d.eventId, 'evt-1');
  assert.equal(d.source, 'community');
  assert.equal(d.title, 'Morning coffee & walk');
  assert.equal(d.description, 'Easy walk along the waterfront.');
  assert.equal(d.startTime, '2026-06-01T16:00:00.000Z');
  assert.equal(d.endTime, '2026-06-01T17:30:00.000Z');
  assert.equal(d.location, 'Blackbird Bakery');
  assert.equal(d.organizerId, 'user-abc');
  assert.equal(d.organizerName, 'Matthew');
  assert.equal(d.minimumAttendance, 3);
});

test('source defaults to "community" when omitted', async () => {
  const body = { ...validBody };
  delete body.source;
  await handler(makeEvent({ claims: validClaims, body }));
  const d = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(d.source, 'community');
});

test('accepts source=external and source=platform', async () => {
  for (const source of ['external', 'platform']) {
    runner.runCommand.calls.length = 0;
    await handler(makeEvent({ claims: validClaims, body: { ...validBody, source } }));
    assert.equal(runner.runCommand.calls[0][0].events[0].data.source, source);
  }
});

test('description and endTime are optional (omitted from data when absent)', async () => {
  const body = { ...validBody };
  delete body.description;
  delete body.endTime;
  await handler(makeEvent({ claims: validClaims, body }));
  const d = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(d.description, undefined);
  assert.equal(d.endTime, undefined);
});

test('minimumAttendance optional', async () => {
  const body = { ...validBody };
  delete body.minimumAttendance;
  await handler(makeEvent({ claims: validClaims, body }));
  const d = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(d.minimumAttendance, undefined);
});

test('caches eventId on the command result so retries return it', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const [args] = runner.runCommand.calls[0];
  assert.deepEqual(args.result, { eventId: 'evt-1' });
});

test('returns 200 (not 201) when the runner reports a cached retry', async () => {
  runner.runCommand = spy(async ({ result }) => ({ cached: true, events: [], result }));
  handler = createProposeEventHandler({ runner, makeEventId: makeId });
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
});

test('organizerName defaults to email-prefix when omitted', async () => {
  const body = { ...validBody };
  delete body.organizerName;
  await handler(makeEvent({ claims: validClaims, body }));
  const d = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(d.organizerName, 'a');
});
