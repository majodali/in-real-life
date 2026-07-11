// Specifications for POST /me/interview/turn.
//
// The per-turn interviewer loop: ephemeral (no events, no persistence),
// grounded in real upcoming events (D18), branch-validated with one retry
// and a templated fallback (open-risks #18). The client re-posts the
// transcript each turn; done: true means the client should proceed to
// POST /me/onboarding.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInterviewTurnHandler } from './interview.mjs';
import { createStubLlmProvider } from '../lib/llm.mjs';

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
const NOW = new Date();
const inDays = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

let userItem, eventItems, client, llm, handler;

function buildClient() {
  return {
    send: spy(async (cmd) => {
      if (cmd.input.TableName === 'irl-users-test') {
        return userItem ? { Item: userItem } : {};
      }
      if (cmd.input.TableName === 'irl-events-test') {
        return { Items: eventItems };
      }
      throw new Error(`unexpected table ${cmd.input.TableName}`);
    }),
  };
}

function buildHandler(overrides = {}) {
  return createInterviewTurnHandler({
    client,
    usersTable: 'irl-users-test',
    eventsTable: 'irl-events-test',
    llm,
    getOffset: async () => ({ offsetMs: 0 }),
    ...overrides,
  });
}

beforeEach(() => {
  userItem = { userId: 'abc', seq: 2, name: 'Matthew' };
  eventItems = [
    { eventId: 'evt-1', title: 'Pottery night', startTime: inDays(3), location: 'Studio', lifecycleState: 'planned' },
    { eventId: 'evt-2', title: 'Trivia', startTime: inDays(1), location: 'Pub', lifecycleState: 'planned' },
    { eventId: 'evt-old', title: 'Past picnic', startTime: inDays(-2), endTime: inDays(-1.9), lifecycleState: 'planned' },
    { eventId: 'evt-x', title: 'Cancelled walk', startTime: inDays(2), lifecycleState: 'cancelled' },
  ];
  client = buildClient();
  llm = createStubLlmProvider();
  handler = buildHandler();
});

// ─── Happy path ───

test('first turn returns a card, not done', async () => {
  const response = await handler(makeEvent({ claims: validClaims, body: { transcript: [] } }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.done, false);
  assert.equal(typeof body.card.prompt, 'string');
  assert.equal(typeof body.card.inputType, 'string');
});

test('a long transcript reaches done with a closing', async () => {
  const transcript = [
    { role: 'interviewer', text: 'q1' }, { role: 'member', text: 'a1' },
    { role: 'interviewer', text: 'q2' }, { role: 'member', text: 'a2' },
    { role: 'interviewer', text: 'q3' }, { role: 'member', text: 'a3' },
  ];
  const response = await handler(makeEvent({ claims: validClaims, body: { transcript } }));
  const body = JSON.parse(response.body);
  assert.equal(body.done, true);
  assert.equal(typeof body.closing.message, 'string');
  assert.equal(typeof body.closing.nextStep, 'string');
});

test('grounds the turn in upcoming events only — sorted, no past or cancelled', async () => {
  const seen = [];
  llm = { complete: async (request) => { seen.push(request); return (await createStubLlmProvider().complete(request)); } };
  handler = buildHandler();

  await handler(makeEvent({ claims: validClaims, body: { transcript: [] } }));

  const [request] = seen;
  const content = request.messages[0].content;
  assert.match(content, /\[evt-2\] Trivia/);
  assert.match(content, /\[evt-1\] Pottery night/);
  assert.ok(content.indexOf('evt-2') < content.indexOf('evt-1'), 'sorted by startTime');
  assert.doesNotMatch(content, /Past picnic/);
  assert.doesNotMatch(content, /Cancelled walk/);
  assert.match(content, /TRANSCRIPT SO FAR: \(none/);

  // Frozen system prompt + turn schema + snappy-turn settings.
  assert.match(request.system, /warm voice that welcomes new members/);
  assert.equal(request.task, 'onboarding-turn');
  assert.equal(request.effort, 'low');
  assert.equal(request.schema.properties.done.type, 'boolean');
});

test('with no upcoming events, tells the model to speak in general terms', async () => {
  eventItems = [];
  client = buildClient();
  const seen = [];
  llm = { complete: async (request) => { seen.push(request); return createStubLlmProvider().complete(request); } };
  handler = buildHandler();

  await handler(makeEvent({ claims: validClaims, body: { transcript: [] } }));
  assert.match(seen[0].messages[0].content, /EVENTS: none currently listed/);
});

// ─── Branch validation (open-risks #18) ───

test('retries once when the branch is malformed, then returns the good turn', async () => {
  const good = { done: false, doorRead: 'unclear', card: { prompt: 'p', inputType: 'text' } };
  const outputs = [{ done: true, doorRead: 'unclear' /* no closing */ }, good];
  llm = { complete: spy(async () => outputs.shift()) };
  handler = buildHandler();

  const response = await handler(makeEvent({ claims: validClaims, body: { transcript: [] } }));
  assert.equal(llm.complete.calls.length, 2);
  assert.deepEqual(JSON.parse(response.body), good);
});

test('falls back to a templated closing when done:true stays malformed', async () => {
  llm = { complete: spy(async () => ({ done: true, doorRead: 'connect' })) };
  handler = buildHandler();

  const response = await handler(makeEvent({ claims: validClaims, body: { transcript: [] } }));
  assert.equal(llm.complete.calls.length, 2);
  const body = JSON.parse(response.body);
  assert.equal(body.done, true);
  assert.equal(typeof body.closing.message, 'string');
  assert.equal(typeof body.closing.nextStep, 'string');
});

test('falls back to a templated card when done:false stays malformed', async () => {
  llm = { complete: spy(async () => ({ done: false, doorRead: 'unclear' })) };
  handler = buildHandler();

  const response = await handler(makeEvent({ claims: validClaims, body: { transcript: [] } }));
  const body = JSON.parse(response.body);
  assert.equal(body.done, false);
  assert.equal(typeof body.card.prompt, 'string');
  assert.equal(body.card.inputType, 'text');
});

// ─── Rejections ───

test('returns 401 without claims', async () => {
  const response = await handler(makeEvent({ body: { transcript: [] } }));
  assert.equal(response.statusCode, 401);
});

test('returns 403 when email is not verified', async () => {
  const claims = { ...validClaims, email_verified: 'false' };
  const response = await handler(makeEvent({ claims, body: { transcript: [] } }));
  assert.equal(response.statusCode, 403);
});

test('returns 400 on a non-array or malformed transcript', async () => {
  for (const transcript of ['nope', [{ role: 'member' }]]) {
    const response = await handler(makeEvent({ claims: validClaims, body: { transcript } }));
    assert.equal(response.statusCode, 400);
  }
});

test('returns 404 when the user is not registered', async () => {
  userItem = undefined;
  client = buildClient();
  handler = buildHandler();
  const response = await handler(makeEvent({ claims: validClaims, body: { transcript: [] } }));
  assert.equal(response.statusCode, 404);
});

test('returns 409 when onboarding is already completed', async () => {
  userItem = { ...userItem, onboardingCompletedAt: '2026-07-01T00:00:00Z' };
  client = buildClient();
  handler = buildHandler();
  const response = await handler(makeEvent({ claims: validClaims, body: { transcript: [] } }));
  assert.equal(response.statusCode, 409);
});
