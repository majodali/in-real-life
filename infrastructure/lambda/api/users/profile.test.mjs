// Specifications for POST /me/profile.
//
// Called after registration to set the user's name, avatar, vibe message, and
// initial interview responses. Reads current seq from the users state row to
// build the next event (seq + 1). Returns 201 on first creation, 200 on
// idempotent retry, 409 if the profile is already set, 404 if the user
// hasn't registered yet.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createProfileHandler } from './profile.mjs';

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
  name: 'Matthew',
  avatar: '\u{1F33F}',
  vibeMessage: 'Always up for a walk',
  interviewResponses: [{ questionId: 'name', questionText: 'What should we call you?', response: 'Matthew', timestamp: '2026-05-08T09:55:00.000Z' }],
};

let runner, client, handler;
let runCommandResult;
let getItemResult;

beforeEach(() => {
  runCommandResult = { cached: false, events: [], result: { userId: 'abc' } };
  getItemResult = { Item: { userId: 'abc', seq: 1, email: 'a@b.c' } }; // registered, no profile
  runner = { runCommand: spy(async () => runCommandResult) };
  client = { send: spy(async () => getItemResult) };
  handler = createProfileHandler({ runner, client, usersTable: 'irl-users-test' });
});

// ─── Happy path ───

test('returns 201 on first profile creation', async () => {
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
  const e = args.events[0];
  assert.equal(e.eventType, 'UserProfileCreated');
  assert.equal(e.version, 1);
  assert.equal(e.seq, 2); // currentSeq (1) + 1
  assert.equal(e.data.userId, 'abc');
  assert.equal(e.data.name, 'Matthew');
  assert.equal(e.data.avatar, '\u{1F33F}');
  assert.equal(e.data.vibeMessage, 'Always up for a walk');
  assert.equal(e.data.interviewResponses, undefined); // basics only (D42)
});

test('seq is currentSeq + 1, sourced from the users state row', async () => {
  getItemResult = { Item: { userId: 'abc', seq: 5, name: undefined, email: 'a@b.c' } };
  client = { send: spy(async () => getItemResult) };
  handler = createProfileHandler({ runner, client, usersTable: 'irl-users-test' });

  await handler(makeEvent({ claims: validClaims, body: validBody }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.events[0].seq, 6);
});

// ─── Defaults ───

test('defaults avatar and vibeMessage if not provided', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matthew' },
  }));
  const [args] = runner.runCommand.calls[0];
  const { data } = args.events[0];
  assert.ok(typeof data.avatar === 'string' && data.avatar.length > 0, 'avatar should default to a non-empty string');
  assert.equal(data.vibeMessage, '');
});

// ─── Idempotent retry ───

test('returns 200 (not 201) when the runner reports a cached result', async () => {
  runCommandResult = { cached: true, events: [], result: { userId: 'abc' } };
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
});

// ─── Already-created (caught at write time) ───

test('returns 409 when the runner throws TransactionCanceledException', async () => {
  runner.runCommand = spy(async () => {
    const err = new Error('Transaction cancelled');
    err.name = 'TransactionCanceledException';
    throw err;
  });
  handler = createProfileHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 409);
});

test('rethrows other runner errors', async () => {
  runner.runCommand = spy(async () => { throw new Error('boom'); });
  handler = createProfileHandler({ runner, client, usersTable: 'irl-users-test' });

  await assert.rejects(
    () => handler(makeEvent({ claims: validClaims, body: validBody })),
    /boom/,
  );
});

// ─── Not registered ───

test('returns 404 when no users state row exists', async () => {
  getItemResult = {}; // no item
  client = { send: spy(async () => getItemResult) };
  handler = createProfileHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 404);
  assert.equal(runner.runCommand.calls.length, 0);
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
    body: { name: 'Matthew' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when name is missing', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when name is empty string', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: '' },
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
