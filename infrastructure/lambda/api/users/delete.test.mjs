// Specifications for DELETE /me.
//
// Honors the terms-of-use promise: "if you want it deleted, we'll delete
// it." Four steps:
//   1. Append a UserDeleted event (audit) AND atomically delete the user
//      state row (via projectUserDeleted). One TransactWriteItems.
//   2. Delete the per-aggregate crypto-shred key — PII in the event log
//      is now permanently unreadable.
//   3. AdminDeleteUser in Cognito — frees the email for re-signup.
//   4. Reply 200 { status: 'deleted' }.
//
// Steps run in order; the event-then-row atomic step is the durable
// commitment, the shred is the point-of-no-return for PII, Cognito last
// so earlier auth-bearing steps run before the token is invalidated.
//
// Idempotency: same commandId → cached 200. New commandId after the
// state row is already gone → no event, but key + Cognito deletion still
// attempted (best-effort convergence).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDeleteHandler } from './delete.mjs';

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
const validBody = { commandId: 'cmd-1' };

let runner, client, keyStore, cognito, handler;
let runCommandResult;
let userItem;

function buildClient() {
  return { send: spy(async () => ({ Item: userItem })) };
}

beforeEach(() => {
  runCommandResult = { cached: false, events: [], result: { status: 'deleted' } };
  userItem = { userId: 'abc', seq: 3, name: 'Matthew' };
  runner = { runCommand: spy(async () => runCommandResult) };
  client = buildClient();
  keyStore = {
    getOrCreateKey: spy(async () => 'key'),
    getKey: spy(async () => 'key'),
    deleteKey: spy(async () => {}),
  };
  cognito = { send: spy(async () => ({})) };
  handler = createDeleteHandler({
    runner,
    client,
    usersTable: 'irl-users-test',
    keyStore,
    cognito,
    userPoolId: 'us-east-1_xxxx',
  });
});

// ─── Happy path ───

test('returns 200 { status: deleted }', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'deleted' });
});

test('emits UserDeleted with seq = currentSeq + 1, data = { userId }', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(runner.runCommand.calls.length, 1);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.commandId, 'cmd-1');
  assert.equal(args.aggregateId, 'user#abc');
  assert.equal(args.actorId, 'user#abc');
  assert.equal(args.events.length, 1);
  const e = args.events[0];
  assert.equal(e.eventType, 'UserDeleted');
  assert.equal(e.version, 1);
  assert.equal(e.seq, 4); // currentSeq (3) + 1
  assert.deepEqual(e.data, { userId: 'abc' });
});

test('deletes the crypto-shred key for the aggregate', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(keyStore.deleteKey.calls.length, 1);
  assert.equal(keyStore.deleteKey.calls[0][0], 'user#abc');
});

test('calls Cognito AdminDeleteUser with the pool id and the user\'s email', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(cognito.send.calls.length, 1);
  const cmd = cognito.send.calls[0][0];
  // AdminDeleteUserCommand carries input.UserPoolId + input.Username.
  assert.equal(cmd.input.UserPoolId, 'us-east-1_xxxx');
  assert.equal(cmd.input.Username, 'a@b.c');
});

test('orders steps: event+row delete → key shred → Cognito', async () => {
  const order = [];
  runner.runCommand = spy(async () => { order.push('runner'); return runCommandResult; });
  keyStore.deleteKey = spy(async () => { order.push('key'); });
  cognito.send = spy(async () => { order.push('cognito'); return {}; });
  handler = createDeleteHandler({
    runner, client, usersTable: 'irl-users-test', keyStore, cognito, userPoolId: 'p',
  });

  await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.deepEqual(order, ['runner', 'key', 'cognito']);
});

// ─── No-row convergence (already-deleted retry with a new commandId) ───

test('when there is no state row, skips the event but still shreds the key and deletes Cognito', async () => {
  userItem = undefined;
  client = buildClient();
  handler = createDeleteHandler({
    runner, client, usersTable: 'irl-users-test', keyStore, cognito, userPoolId: 'p',
  });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 0); // nothing to write
  assert.equal(keyStore.deleteKey.calls.length, 1); // best-effort
  assert.equal(cognito.send.calls.length, 1);       // best-effort
});

// ─── Idempotent retry / racing deletions ───

test('cached runner result still returns 200 (same commandId retry)', async () => {
  runCommandResult = { cached: true, events: [], result: { status: 'deleted' } };
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
});

test('TransactionCanceledException is treated as converging (returns 200)', async () => {
  runner.runCommand = spy(async () => {
    const err = new Error('Transaction cancelled');
    err.name = 'TransactionCanceledException';
    throw err;
  });
  handler = createDeleteHandler({
    runner, client, usersTable: 'irl-users-test', keyStore, cognito, userPoolId: 'p',
  });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
  // Still proceeds to shred + Cognito so retries converge.
  assert.equal(keyStore.deleteKey.calls.length, 1);
  assert.equal(cognito.send.calls.length, 1);
});

test('rethrows non-conditional runner errors', async () => {
  runner.runCommand = spy(async () => { throw new Error('boom'); });
  handler = createDeleteHandler({
    runner, client, usersTable: 'irl-users-test', keyStore, cognito, userPoolId: 'p',
  });
  await assert.rejects(
    () => handler(makeEvent({ claims: validClaims, body: validBody })),
    /boom/,
  );
});

// ─── Cognito best-effort ───

test('tolerates Cognito UserNotFoundException (best-effort) and still returns 200', async () => {
  cognito.send = spy(async () => {
    const err = new Error('user not found');
    err.name = 'UserNotFoundException';
    throw err;
  });
  handler = createDeleteHandler({
    runner, client, usersTable: 'irl-users-test', keyStore, cognito, userPoolId: 'p',
  });

  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
});

test('rethrows non-NotFound Cognito errors so the client knows the email is still in use', async () => {
  cognito.send = spy(async () => { throw new Error('throttled'); });
  handler = createDeleteHandler({
    runner, client, usersTable: 'irl-users-test', keyStore, cognito, userPoolId: 'p',
  });
  await assert.rejects(
    () => handler(makeEvent({ claims: validClaims, body: validBody })),
    /throttled/,
  );
});

// ─── Validation ───

test('returns 400 when commandId is missing', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: {} }));
  assert.equal(response.statusCode, 400);
  assert.equal(runner.runCommand.calls.length, 0);
  assert.equal(keyStore.deleteKey.calls.length, 0);
  assert.equal(cognito.send.calls.length, 0);
});

test('returns 400 when the body is not valid JSON', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: 'nope' }));
  assert.equal(response.statusCode, 400);
});

// ─── Auth guards ───

test('returns 401 without JWT claims', async () => {
  const response = await handler({ body: JSON.stringify(validBody) });
  assert.equal(response.statusCode, 401);
});

test('returns 403 when email is not verified', async () => {
  const response = await handler(makeEvent({
    claims: { ...validClaims, email_verified: 'false' },
    body: validBody,
  }));
  assert.equal(response.statusCode, 403);
});

// ─── Response shape ───

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.headers['Content-Type'], 'application/json');
});
