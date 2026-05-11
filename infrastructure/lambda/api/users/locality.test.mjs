// Specifications for POST /me/locality.
//
// In workshop mode the handler runs three sequential commands on the user
// aggregate: LocalityVerificationRequested → LocalityVerified → UserActivated.
// Each is its own atomic transaction with a derived commandId so retries
// pick up where the previous attempt left off. (Production mode would only
// emit the first; that branch is added when a prod stack arrives.)

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalityHandler } from './locality.mjs';

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

const validClaims = { sub: 'abc', email: 'a@b.c', email_verified: 'true' };
const validBody = {
  commandId: 'cmd-1',
  city: 'Bainbridge Island',
  postalCode: '98110',
  country: 'US',
};

let runner, client, handler;
let runCommandResults;
let runCommandCallIndex;
let getItemResult;

beforeEach(() => {
  runCommandResults = [
    { cached: false, events: [], result: { userId: 'abc' } },
    { cached: false, events: [], result: { userId: 'abc' } },
    { cached: false, events: [], result: { userId: 'abc' } },
  ];
  runCommandCallIndex = 0;
  // user has registered + profile created → seq=2
  getItemResult = { Item: { userId: 'abc', seq: 2, name: 'Matthew', email: 'a@b.c' } };
  runner = { runCommand: spy(async () => runCommandResults[runCommandCallIndex++]) };
  client = { send: spy(async () => getItemResult) };
  handler = createLocalityHandler({ runner, client, usersTable: 'irl-users-test' });
});

// ─── Happy path: full activation in workshop mode ───

test('runs three sequential commands: Requested → Verified → Activated', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));

  assert.equal(runner.runCommand.calls.length, 3);

  const [r1] = runner.runCommand.calls[0];
  assert.equal(r1.commandId, 'cmd-1');
  assert.equal(r1.events[0].eventType, 'LocalityVerificationRequested');
  assert.equal(r1.events[0].seq, 3); // currentSeq (2) + 1

  const [r2] = runner.runCommand.calls[1];
  assert.equal(r2.commandId, 'cmd-1:verify');
  assert.equal(r2.events[0].eventType, 'LocalityVerified');
  assert.equal(r2.events[0].seq, 4);

  const [r3] = runner.runCommand.calls[2];
  assert.equal(r3.commandId, 'cmd-1:activate');
  assert.equal(r3.events[0].eventType, 'UserActivated');
  assert.equal(r3.events[0].seq, 5);
});

test('LocalityVerificationRequested event carries city, postalCode, country', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const [r1] = runner.runCommand.calls[0];
  assert.deepEqual(r1.events[0].data, {
    userId: 'abc',
    city: 'Bainbridge Island',
    postalCode: '98110',
    country: 'US',
  });
});

test('LocalityVerified event sets verifiedBy=system and method=auto in workshop mode', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const [r2] = runner.runCommand.calls[1];
  assert.equal(r2.events[0].data.userId, 'abc');
  assert.equal(r2.events[0].data.verifiedBy, 'system');
  assert.equal(r2.events[0].data.method, 'auto');
});

test('UserActivated event carries userId', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const [r3] = runner.runCommand.calls[2];
  assert.equal(r3.events[0].data.userId, 'abc');
});

test('returns 201 when at least one step did real work', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 201);
});

test('returns 200 when all three steps were cached (full retry)', async () => {
  runCommandResults = [
    { cached: true, events: [], result: { userId: 'abc' } },
    { cached: true, events: [], result: { userId: 'abc' } },
    { cached: true, events: [], result: { userId: 'abc' } },
  ];
  runner = { runCommand: spy(async () => runCommandResults[runCommandCallIndex++]) };
  handler = createLocalityHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
});

test('returns 201 on a partial-retry where step 1 was cached but step 2/3 ran', async () => {
  runCommandResults = [
    { cached: true, events: [], result: { userId: 'abc' } },
    { cached: false, events: [], result: { userId: 'abc' } },
    { cached: false, events: [], result: { userId: 'abc' } },
  ];
  runner = { runCommand: spy(async () => runCommandResults[runCommandCallIndex++]) };
  handler = createLocalityHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 201);
});

// ─── Errors mid-sequence ───

test('returns 409 when step 1 throws TransactionCanceledException; steps 2/3 do not run', async () => {
  runner.runCommand = spy(async () => {
    const err = new Error('Transaction cancelled');
    err.name = 'TransactionCanceledException';
    throw err;
  });
  handler = createLocalityHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 409);
  assert.equal(runner.runCommand.calls.length, 1);
});

test('returns 409 when step 2 throws TransactionCanceledException; step 3 does not run', async () => {
  let i = 0;
  runner.runCommand = spy(async () => {
    if (i++ === 0) return { cached: false, events: [], result: { userId: 'abc' } };
    const err = new Error('Transaction cancelled');
    err.name = 'TransactionCanceledException';
    throw err;
  });
  handler = createLocalityHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 409);
  assert.equal(runner.runCommand.calls.length, 2);
});

test('rethrows non-TCE errors from the runner', async () => {
  runner.runCommand = spy(async () => { throw new Error('boom'); });
  handler = createLocalityHandler({ runner, client, usersTable: 'irl-users-test' });

  await assert.rejects(
    () => handler(makeEvent({ claims: validClaims, body: validBody })),
    /boom/,
  );
});

// ─── Not registered ───

test('returns 404 when no users state row exists', async () => {
  getItemResult = {};
  client = { send: spy(async () => getItemResult) };
  handler = createLocalityHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 404);
  assert.equal(runner.runCommand.calls.length, 0);
});

// ─── Auth + body validation ───

test('returns 401 without JWT claims', async () => {
  const response = await handler({ body: JSON.stringify(validBody) });
  assert.equal(response.statusCode, 401);
});

test('returns 403 when email_verified is not "true"', async () => {
  const response = await handler(makeEvent({
    claims: { ...validClaims, email_verified: 'false' },
    body: validBody,
  }));
  assert.equal(response.statusCode, 403);
});

test('returns 400 when commandId is missing', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { city: 'Bainbridge' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when city is missing', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', postalCode: '98110' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when postalCode is missing', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', city: 'Bainbridge Island' },
  }));
  assert.equal(response.statusCode, 400);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('returns 422 when postalCode is not in the supported allowlist', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'cmd-1',
      city: 'San Francisco',
      postalCode: '94110',
    },
  }));
  assert.equal(response.statusCode, 422);
  const body = JSON.parse(response.body);
  assert.match(body.error, /supported|allow/i);
  assert.equal(body.postalCode, '94110');
  assert.equal(runner.runCommand.calls.length, 0); // never even tried
});

test('returns 400 when body is not valid JSON', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: 'not-json',
  }));
  assert.equal(response.statusCode, 400);
});
