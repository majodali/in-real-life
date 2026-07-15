// Specifications for POST /me/onboarding.
//
// Closes the onboarding interview: runs the extraction call through the
// injected LLM seam and emits OnboardingCompleted (the sole interview
// carrier, D42) at seq + 1. Returns 201 on first completion, 200 on
// idempotent retry, 409 if already completed, 404 if the user hasn't
// registered.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createOnboardingHandler } from './onboarding.mjs';
import { createStubLlmProvider, STUB_ONBOARDING_EXTRACTION } from '../lib/llm.mjs';

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
  commandId: 'cmd-ob-1',
  transcript: [
    { role: 'interviewer', text: 'What should we call you?' },
    { role: 'member', text: 'Matthew. I just moved here.' },
  ],
};

let runner, client, llm, handler;
let runCommandResult;
let getItemResult;

beforeEach(() => {
  runCommandResult = {
    cached: false,
    events: [],
    result: { userId: 'abc', status: 'onboarding-complete' },
  };
  getItemResult = { Item: { userId: 'abc', seq: 2, name: 'Matthew' } };
  runner = { runCommand: spy(async () => runCommandResult) };
  client = { send: spy(async () => getItemResult) };
  llm = createStubLlmProvider();
  handler = createOnboardingHandler({ runner, client, usersTable: 'irl-users-test', llm });
});

// ─── Happy path ───

test('returns 201 on first onboarding completion', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).status, 'onboarding-complete');
});

test('emits OnboardingCompleted with transcript + extraction at seq + 1', async () => {
  await handler(makeEvent({ claims: validClaims, body: validBody }));

  assert.equal(runner.runCommand.calls.length, 1);
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.commandId, 'cmd-ob-1');
  assert.equal(args.aggregateId, 'user#abc');
  assert.equal(args.actorId, 'user#abc');
  assert.equal(args.events.length, 1);

  const [event] = args.events;
  assert.equal(event.eventType, 'OnboardingCompleted');
  assert.equal(event.version, 1);
  assert.equal(event.seq, 3); // row seq 2 + 1
  assert.deepEqual(event.data.transcript, validBody.transcript);
  assert.deepEqual(event.data.extraction, STUB_ONBOARDING_EXTRACTION);
  assert.equal(event.data.extraction.provisional, true);
});

test('returns 200 for an idempotent retry (cached command)', async () => {
  runCommandResult = { ...runCommandResult, cached: true };
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
});

// ─── Rejections ───

test('returns 401 without claims', async () => {
  const response = await handler(makeEvent({ body: validBody }));
  assert.equal(response.statusCode, 401);
});

test('returns 403 when email is not verified', async () => {
  const claims = { ...validClaims, email_verified: 'false' };
  const response = await handler(makeEvent({ claims, body: validBody }));
  assert.equal(response.statusCode, 403);
});

test('returns 400 without commandId', async () => {
  const body = { transcript: validBody.transcript };
  const response = await handler(makeEvent({ claims: validClaims, body }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 on a missing or empty transcript', async () => {
  for (const transcript of [undefined, [], 'not-an-array']) {
    const response = await handler(makeEvent({
      claims: validClaims,
      body: { commandId: 'c', transcript },
    }));
    assert.equal(response.statusCode, 400);
  }
});

test('returns 400 on malformed transcript entries', async () => {
  const body = { commandId: 'c', transcript: [{ role: 'member' }] };
  const response = await handler(makeEvent({ claims: validClaims, body }));
  assert.equal(response.statusCode, 400);
});

test('returns 404 when the user is not registered', async () => {
  getItemResult = {};
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 404);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('an already-completed row never short-circuits an idempotent retry (register.mjs convention)', async () => {
  // Same commandId, row already shows completed: the runner's cache
  // answers 200 — the completed row must not pre-empt it with a 409.
  getItemResult = { Item: { userId: 'abc', seq: 3, onboardingCompletedAt: '2026-07-01T00:00:00Z' } };
  runner.runCommand = spy(async ({ result }) => ({ cached: true, events: [], result }));
  handler = createOnboardingHandler({ runner, client, usersTable: 'irl-users-test', llm });
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 200);
  assert.equal(runner.runCommand.calls.length, 1);
});

test('returns 409 when the projection condition rejects a concurrent completion', async () => {
  runner.runCommand = spy(async () => {
    const err = new Error('canceled');
    err.name = 'TransactionCanceledException';
    throw err;
  });
  handler = createOnboardingHandler({ runner, client, usersTable: 'irl-users-test', llm });
  const response = await handler(makeEvent({ claims: validClaims, body: validBody }));
  assert.equal(response.statusCode, 409);
});

test('propagates llm failures rather than writing a partial event', async () => {
  llm = { complete: async () => { throw new Error('llm request failed: 500'); } };
  handler = createOnboardingHandler({ runner, client, usersTable: 'irl-users-test', llm });
  await assert.rejects(
    () => handler(makeEvent({ claims: validClaims, body: validBody })),
    /llm request failed/,
  );
  assert.equal(runner.runCommand.calls.length, 0);
});
