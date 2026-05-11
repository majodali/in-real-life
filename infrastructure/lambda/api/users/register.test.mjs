// Specifications for POST /me/register.
//
// The handler:
//   - extracts userId/email/email_verified from the JWT claims
//   - validates the request body (commandId + agreementVersion required)
//   - rejects if email is unverified
//   - composes a UserRegistered event and runs the command (the runner
//     owns enrichment and projection internally)
//   - returns 201 (created) or 200 (cached retry) with { userId }
//   - returns 409 when the runner reports the user already registered
//     (signalled by TransactionCanceledException — the projection's
//      attribute_not_exists(userId) condition fails).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRegisterHandler } from './register.mjs';

// ─── Test fixtures ───

function spy(impl) {
  const fn = (...args) => {
    fn.calls.push(args);
    return impl(...args);
  };
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
const validBody = { commandId: 'cmd-1', agreementVersion: 'v1' };

let runner, handler;
let runCommandResult;

beforeEach(() => {
  runCommandResult = { cached: false, events: [], result: { userId: 'abc' } };
  runner = { runCommand: spy(async () => runCommandResult) };
  handler = createRegisterHandler({ runner });
});

// ─── Happy path ───

test('returns 201 and the new userId on first registration', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).userId, 'abc');
});

test('passes the right command shape to the runner', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));

  assert.equal(runner.runCommand.calls.length, 1);
  const [args] = runner.runCommand.calls[0];

  assert.equal(args.commandId, 'cmd-1');
  assert.equal(args.aggregateId, 'user#abc');
  assert.equal(args.actorId, 'user#abc');
  assert.equal(args.events.length, 1);
  assert.deepEqual(args.events[0], {
    eventType: 'UserRegistered',
    version: 1,
    seq: 1,
    data: {
      userId: 'abc',
      email: 'a@b.c',
      agreementVersion: 'v1',
      path: 'self',
    },
  });
});

test('caches the userId result on the command record (so retries return it)', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const [args] = runner.runCommand.calls[0];
  assert.deepEqual(args.result, { userId: 'abc' });
});

// ─── Idempotent retry ───

test('returns 200 (not 201) when the runner reports a cached result', async () => {
  runCommandResult = { cached: true, events: [], result: { userId: 'abc' } };
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).userId, 'abc');
});

// ─── Already-registered (caught at write time) ───

test('returns 409 when the runner throws TransactionCanceledException', async () => {
  runner.runCommand = spy(async () => {
    const err = new Error('Transaction cancelled');
    err.name = 'TransactionCanceledException';
    throw err;
  });
  handler = createRegisterHandler({ runner });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 409);
});

test('rethrows other runner errors (not TransactionCanceledException)', async () => {
  runner.runCommand = spy(async () => { throw new Error('something else'); });
  handler = createRegisterHandler({ runner });

  await assert.rejects(
    () => handler(makeEvent({ claims: validClaims, body: validBody })),
    /something else/,
  );
});

// ─── Auth guards ───

test('returns 401 when the request has no JWT claims', async () => {
  const response = await handler({ body: JSON.stringify(validBody) });
  assert.equal(response.statusCode, 401);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('returns 403 when email_verified is not "true"', async () => {
  const response = await handler(makeEvent({
    claims: { ...validClaims, email_verified: 'false' },
    body: validBody,
  }));
  assert.equal(response.statusCode, 403);
});

// ─── Body validation ───

test('returns 400 when commandId is missing', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { agreementVersion: 'v1' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when agreementVersion is missing', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when the body is not valid JSON', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: 'not-json',
  }));
  assert.equal(response.statusCode, 400);
});

// ─── Response shape ───

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.headers['Content-Type'], 'application/json');
});
