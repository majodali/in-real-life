// Specifications for POST /me/agreement (agreement re-acceptance).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createReacceptAgreementHandler } from './agreement.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims, body } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    body: JSON.stringify(body ?? {}),
  };
}

const validClaims = { sub: 'abc', email: 'a@b.c', email_verified: 'true' };

let runner, userItem, requiredVersion, handler;

beforeEach(() => {
  runner = { runCommand: spy(async (input) => ({ cached: false, events: [], result: input.result })) };
  userItem = { userId: 'abc', agreementVersion: 'v1', seq: 6 };
  requiredVersion = 'v2';
  handler = createReacceptAgreementHandler({
    runner,
    client: { send: async () => (userItem ? { Item: userItem } : {}) },
    usersTable: 'irl-users-test',
    getRequiredAgreement: async () => ({ version: requiredVersion, seq: 1, updatedAt: null }),
  });
});

test('emits UserAgreementReaccepted at the next seq', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'cmd-1', agreementVersion: 'v2' },
  }));

  assert.equal(response.statusCode, 201);
  assert.deepEqual(JSON.parse(response.body), {
    userId: 'abc', agreementVersion: 'v2', status: 'reaccepted',
  });

  const [input] = runner.runCommand.calls[0];
  assert.equal(input.aggregateId, 'user#abc');
  assert.equal(input.actorId, 'user#abc');
  const [event] = input.events;
  assert.equal(event.eventType, 'UserAgreementReaccepted');
  assert.equal(event.seq, 7);
  assert.deepEqual(event.data, { userId: 'abc', agreementVersion: 'v2' });
});

test('400 when the posted version is not the required one (stale client)', async () => {
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c', agreementVersion: 'v1' },
  }));
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).requiredAgreementVersion, 'v2');
  assert.equal(runner.runCommand.calls.length, 0);
});

test('409 when the user is already current', async () => {
  userItem = { ...userItem, agreementVersion: 'v2' };
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c', agreementVersion: 'v2' },
  }));
  assert.equal(response.statusCode, 409);
});

test('409 when no required version is configured', async () => {
  requiredVersion = null;
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c', agreementVersion: 'v2' },
  }));
  assert.equal(response.statusCode, 409);
});

test('404 when the user is not registered', async () => {
  userItem = null;
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c', agreementVersion: 'v2' },
  }));
  assert.equal(response.statusCode, 404);
});

test('auth rejections: 401 without claims, 403 unverified email', async () => {
  assert.equal((await handler(makeEvent({ body: {} }))).statusCode, 401);
  const claims = { ...validClaims, email_verified: 'false' };
  assert.equal((await handler(makeEvent({ claims, body: {} }))).statusCode, 403);
});

test('409 on a concurrent-update transaction cancel', async () => {
  const boom = new Error('cancelled');
  boom.name = 'TransactionCanceledException';
  runner = { runCommand: spy(async () => { throw boom; }) };
  handler = createReacceptAgreementHandler({
    runner,
    client: { send: async () => ({ Item: userItem }) },
    usersTable: 'irl-users-test',
    getRequiredAgreement: async () => ({ version: 'v2', seq: 1, updatedAt: null }),
  });
  const response = await handler(makeEvent({
    claims: validClaims,
    body: { commandId: 'c', agreementVersion: 'v2' },
  }));
  assert.equal(response.statusCode, 409);
});
