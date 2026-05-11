// Specifications for PUT /me/profile.
//
// Updates an existing user profile (name, avatar, vibeMessage). Reads the
// current state row to: (a) determine the next seq, and (b) fill in any
// fields the client didn't include so the UserProfileUpdated event always
// captures the full new shape. Returns 200 on success, 200 on idempotent
// retry, 404 if no profile exists, 409 on conflict.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateProfileHandler } from './profile-update.mjs';

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

let runner, client, handler;
let runCommandResult;
let getItemResult;

beforeEach(() => {
  runCommandResult = { cached: false, events: [], result: { userId: 'abc' } };
  // Default: a user that has registered + completed profile.
  getItemResult = {
    Item: {
      userId: 'abc',
      seq: 5,
      email: 'a@b.c',
      name: 'Matthew',
      avatar: '\u{1F33F}',
      vibeMessage: 'walks',
    },
  };
  runner = { runCommand: spy(async () => runCommandResult) };
  client = { send: spy(async () => getItemResult) };
  handler = createUpdateProfileHandler({ runner, client, usersTable: 'irl-users-test' });
});

// ─── Happy path ───

test('returns 200 on first successful update', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt', avatar: '\u{1F340}', vibeMessage: 'baking bread' },
  }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.userId, 'abc');
});

test('passes the merged result (full new shape) to the runner', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt', avatar: '\u{1F340}', vibeMessage: 'baking bread' },
  }));
  const [args] = runner.runCommand.calls[0];
  assert.deepEqual(args.result, {
    userId: 'abc',
    name: 'Matt',
    avatar: '\u{1F340}',
    vibeMessage: 'baking bread',
  });
});

test('emits UserProfileUpdated with seq = currentSeq + 1', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt' },
  }));

  assert.equal(runner.runCommand.calls.length, 1);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.commandId, 'cmd-1');
  assert.equal(args.aggregateId, 'user#abc');
  assert.equal(args.actorId, 'user#abc');
  assert.equal(args.events.length, 1);
  const e = args.events[0];
  assert.equal(e.eventType, 'UserProfileUpdated');
  assert.equal(e.version, 1);
  assert.equal(e.seq, 6); // currentSeq (5) + 1
});

test('event captures the full new shape — unchanged fields filled from current state', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt' }, // only name changed
  }));

  const [args] = runner.runCommand.calls[0];
  const data = args.events[0].data;
  assert.equal(data.userId, 'abc');
  assert.equal(data.name, 'Matt');
  assert.equal(data.avatar, '\u{1F33F}'); // from current state
  assert.equal(data.vibeMessage, 'walks'); // from current state
});

test('all three fields update when all are provided', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: {
      commandId: 'cmd-1',
      name: 'Matt',
      avatar: '\u{1F340}',
      vibeMessage: 'baking bread',
    },
  }));

  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.name, 'Matt');
  assert.equal(data.avatar, '\u{1F340}');
  assert.equal(data.vibeMessage, 'baking bread');
});

test('empty string is treated as a real value (allows clearing the vibe)', async () => {
  await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', vibeMessage: '' },
  }));

  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.name, 'Matthew'); // unchanged from state
  assert.equal(data.vibeMessage, '');
});

// ─── Idempotent retry ───

test('returns 200 with cached: true result on idempotent retry', async () => {
  runCommandResult = { cached: true, events: [], result: { userId: 'abc', name: 'Matt' } };
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt' },
  }));
  assert.equal(response.statusCode, 200);
});

// ─── Validation ───

test('returns 400 when commandId is missing', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { name: 'Matt' },
  }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when no updatable fields are provided', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1' },
  }));
  assert.equal(response.statusCode, 400);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('returns 400 when name is provided but empty', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: '' },
  }));
  assert.equal(response.statusCode, 400);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('returns 400 when the body is not valid JSON', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: 'nope' }));
  assert.equal(response.statusCode, 400);
});

// ─── State guards ───

test('returns 404 when no users state row exists', async () => {
  getItemResult = {};
  client = { send: spy(async () => getItemResult) };
  handler = createUpdateProfileHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt' },
  }));
  assert.equal(response.statusCode, 404);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('returns 404 when the state row exists but has no profile yet', async () => {
  getItemResult = { Item: { userId: 'abc', seq: 1, email: 'a@b.c' } }; // registered, no profile
  client = { send: spy(async () => getItemResult) };
  handler = createUpdateProfileHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt' },
  }));
  assert.equal(response.statusCode, 404);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('returns 409 when the runner throws TransactionCanceledException', async () => {
  runner.runCommand = spy(async () => {
    const err = new Error('Transaction cancelled');
    err.name = 'TransactionCanceledException';
    throw err;
  });
  handler = createUpdateProfileHandler({ runner, client, usersTable: 'irl-users-test' });

  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt' },
  }));
  assert.equal(response.statusCode, 409);
});

test('rethrows non-conditional runner errors', async () => {
  runner.runCommand = spy(async () => { throw new Error('boom'); });
  handler = createUpdateProfileHandler({ runner, client, usersTable: 'irl-users-test' });

  await assert.rejects(
    () => handler(makeEvent({ claims: validClaims, body: { commandId: 'cmd-1', name: 'Matt' } })),
    /boom/,
  );
});

// ─── Auth guards ───

test('returns 401 without JWT claims', async () => {
  const response = await handler({ body: JSON.stringify({ commandId: 'cmd-1', name: 'Matt' }) });
  assert.equal(response.statusCode, 401);
});

test('returns 403 when email_verified is not "true"', async () => {
  const response = await handler(makeEvent({
    claims: { ...validClaims, email_verified: 'false' },
    body: { commandId: 'cmd-1', name: 'Matt' },
  }));
  assert.equal(response.statusCode, 403);
});

// ─── Response shape ───

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', name: 'Matt' },
  }));
  assert.equal(response.headers['Content-Type'], 'application/json');
});
