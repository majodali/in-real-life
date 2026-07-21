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

test('times come as a pair: start without end (and end without start) are 400', async () => {
  const { endTime, ...noEnd } = validBody;
  let response = await handler(makeEvent({ claims: validClaims, body: noEnd }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /endTime required/);

  const { startTime, ...noStart } = validBody;
  response = await handler(makeEvent({ claims: validClaims, body: noStart }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /startTime required/);
});

// ─── Ideas (time/place-less proposals) ───

test('a title-only proposal is accepted as an idea — no time or place on the event', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', title: 'Anyone into scrabble?' },
  }));
  assert.equal(response.statusCode, 201);

  const [input] = runner.runCommand.calls[0];
  const data = input.events[0].data;
  assert.equal(data.title, 'Anyone into scrabble?');
  assert.equal('startTime' in data, false);
  assert.equal('endTime' in data, false);
  assert.equal('location' in data, false);
});

test('a timed proposal without a place is accepted (still an idea until located)', async () => {
  const { location, ...rest } = validBody;
  const response = await handler(makeEvent({ claims: validClaims, body: rest }));
  assert.equal(response.statusCode, 201);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.startTime, validBody.startTime);
  assert.equal('location' in data, false);
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

test('400 when minimumAttendance is below 3', async () => {
  for (const v of [0, 1, 2]) {
    const response = await handler(makeEvent({
      claims: validClaims, body: { ...validBody, minimumAttendance: v },
    }));
    assert.equal(response.statusCode, 400, `expected 400 for min=${v}`);
    assert.match(JSON.parse(response.body).error, /minimumAttendance/);
  }
});

test('400 when minimumAttendance is not an integer', async () => {
  const response = await handler(makeEvent({
    claims: validClaims, body: { ...validBody, minimumAttendance: 3.5 },
  }));
  assert.equal(response.statusCode, 400);
});

test('accepts minimumAttendance=3 (the floor)', async () => {
  const response = await handler(makeEvent({
    claims: validClaims, body: { ...validBody, minimumAttendance: 3 },
  }));
  assert.equal(response.statusCode, 201);
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
  // External events reject threshold fields (D53), so drop minimumAttendance.
  const { minimumAttendance, ...externalBody } = validBody;
  await handler(makeEvent({ claims: validClaims, body: { ...externalBody, source: 'external' } }));
  assert.equal(runner.runCommand.calls[0][0].events[0].data.source, 'external');

  runner.runCommand.calls.length = 0;
  await handler(makeEvent({ claims: validClaims, body: { ...validBody, source: 'platform' } }));
  assert.equal(runner.runCommand.calls[0][0].events[0].data.source, 'platform');
});

test('description is optional (omitted from data when absent)', async () => {
  const body = { ...validBody };
  delete body.description;
  await handler(makeEvent({ claims: validClaims, body }));
  const d = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(d.description, undefined);
});

test('400 when endTime is missing', async () => {
  const { endTime, ...rest } = validBody;
  const response = await handler(makeEvent({ claims: validClaims, body: rest }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /endTime/);
});

test('400 when endTime is not after startTime', async () => {
  const body = { ...validBody, endTime: validBody.startTime };
  const response = await handler(makeEvent({ claims: validClaims, body }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /endTime must be after startTime/);
});

test('timesApproximate defaults to false and is carried when true', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(runner.runCommand.calls[0][0].events[0].data.timesApproximate, false);

  runner.runCommand.calls.length = 0;
  await handler(makeEvent({ claims: validClaims, body: { ...validBody, timesApproximate: true } }));
  assert.equal(runner.runCommand.calls[0][0].events[0].data.timesApproximate, true);
});

test('400 when timesApproximate is not a boolean', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: { ...validBody, timesApproximate: 'yes' } }));
  assert.equal(response.statusCode, 400);
});

test('minimumAttendance defaults to 3 when omitted', async () => {
  const body = { ...validBody };
  delete body.minimumAttendance;
  await handler(makeEvent({ claims: validClaims, body }));
  const d = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(d.minimumAttendance, 3);
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

// ─── Richer event data: cost disclosure (D34) + capacity ───

test('cost and maxAttendance ride into EventProposed when valid', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { ...validBody, cost: { amount: 12, covers: 'materials' }, maxAttendance: 8 },
  }));
  assert.equal(response.statusCode, 201);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(data.cost, { amount: 12, covers: 'materials' });
  assert.equal(data.maxAttendance, 8);
});

test('cost without covers is 400 — disclosure required (D34)', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { ...validBody, cost: { amount: 12 } },
  }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /covers/);
});

test('maxAttendance below minimumAttendance is 400', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { ...validBody, minimumAttendance: 6, maxAttendance: 5 },
  }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /maxAttendance/);
});

test('omitted cost/maxAttendance leave the event data clean', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal('cost' in data, false);
  assert.equal('maxAttendance' in data, false);
});

// ─── External events (D53) + meeting spot (D54) ───

const externalBody = () => {
  const { minimumAttendance, ...rest } = validBody;
  return { ...rest, source: 'external' };
};

test('external events require the full time/place trio', async () => {
  for (const missing of ['startTime', 'endTime', 'location']) {
    const body = externalBody();
    delete body[missing];
    const response = await handler(makeEvent({ claims: validClaims, body }));
    assert.equal(response.statusCode, 400, `missing ${missing}`);
    assert.match(JSON.parse(response.body).error, /external events need/);
  }
});

test('external events reject threshold fields — the event happens regardless', async () => {
  for (const extra of [{ minimumAttendance: 4 }, { autoPlanOnThreshold: true }]) {
    const response = await handler(makeEvent({
      claims: validClaims, body: { ...externalBody(), ...extra },
    }));
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /do not apply to external/);
  }
});

test('external event data omits threshold fields entirely', async () => {
  await handler(makeEvent({ claims: validClaims, body: externalBody() }));
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal('minimumAttendance' in data, false);
  assert.equal('autoPlanOnThreshold' in data, false);
});

test('meetingSpot is trimmed, bounded, and carried for any source', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: { ...validBody, meetingSpot: '  back tables, blue scarf  ' },
  }));
  assert.equal(
    runner.runCommand.calls[0][0].events[0].data.meetingSpot,
    'back tables, blue scarf',
  );

  runner.runCommand.calls.length = 0;
  await handler(makeEvent({
    claims: validClaims, body: { ...validBody, meetingSpot: '   ' },
  }));
  assert.equal('meetingSpot' in runner.runCommand.calls[0][0].events[0].data, false);
});

test('localityId is register-validated and carried; absent means home by convention', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: { ...validBody, localityId: 'poulsbo' },
  }));
  assert.equal(runner.runCommand.calls[0][0].events[0].data.localityId, 'poulsbo');

  runner.runCommand.calls.length = 0;
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal('localityId' in runner.runCommand.calls[0][0].events[0].data, false);

  const bad = await handler(makeEvent({
    claims: validClaims, body: { ...validBody, localityId: 'atlantis' },
  }));
  assert.equal(bad.statusCode, 400);
});

// ─── Event shape extraction (D56, docs/event-shape-prompt.md) ───

test('an injected llm yields one event-shape call; the shape rides in EventProposed', async () => {
  const seen = [];
  const llm = {
    complete: spy(async (req) => {
      seen.push(req);
      return { activityTags: ['coffee walk'], structure: 'semi-structured', doors: ['connect'] };
    }),
  };
  handler = createProposeEventHandler({ runner, makeEventId: makeId, llm });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 201);
  assert.equal(llm.complete.calls.length, 1);
  assert.equal(seen[0].task, 'event-shape');
  assert.match(seen[0].messages[0].content, /^TITLE: Morning coffee & walk$/m);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(data.shape, {
    activityTags: ['coffee walk'],
    structure: 'semi-structured',
    doors: ['connect'],
    source: 'extracted',
  });
});

test('extraction failure never fails the propose — event lands without shape', async () => {
  handler = createProposeEventHandler({
    runner, makeEventId: makeId,
    llm: { complete: async () => { throw new Error('provider down'); } },
  });
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 201);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal('shape' in data, false);
});

test('no llm injected (legacy wiring) — propose still works, no shape', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 201);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal('shape' in data, false);
});

test('idea proposals (title only) extract shape from the title alone', async () => {
  const seen = [];
  const llm = {
    complete: spy(async (req) => {
      seen.push(req);
      return { activityTags: ['scrabble'], structure: 'structured', doors: ['connect'] };
    }),
  };
  handler = createProposeEventHandler({ runner, makeEventId: makeId, llm });
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c1', title: 'Anyone into scrabble?' },
  }));
  assert.equal(response.statusCode, 201);
  assert.match(seen[0].messages[0].content, /^DESCRIPTION: \(none\)$/m);
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.deepEqual(data.shape.activityTags, ['scrabble']);
});
