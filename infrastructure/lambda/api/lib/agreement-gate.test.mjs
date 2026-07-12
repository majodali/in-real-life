// Specifications for the agreement re-acceptance gate.
//
// Wraps state-changing member routes; blocks with 403 +
// agreement_reacceptance_required only when a required version is set,
// the user exists, and their accepted version doesn't satisfy it. All
// other cases pass through so wrapped handlers keep their own semantics.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAgreementGate } from './agreement-gate.mjs';

let requiredVersion, userItem, gate, handlerCalls, handler;

function makeEvent(claims = { sub: 'abc' }) {
  return { requestContext: claims ? { authorizer: { jwt: { claims } } } : {} };
}

beforeEach(() => {
  requiredVersion = 'v2';
  userItem = { userId: 'abc', agreementVersion: 'v1', seq: 4 };
  handlerCalls = [];
  handler = async (event) => { handlerCalls.push(event); return { statusCode: 201 }; };
  gate = createAgreementGate({
    client: { send: async () => (userItem ? { Item: userItem } : {}) },
    usersTable: 'irl-users-test',
    getRequiredAgreement: async () => ({ version: requiredVersion, seq: 1, updatedAt: null }),
  });
});

test('blocks a stale user with 403 and the machine-readable code', async () => {
  const response = await gate(handler)(makeEvent());

  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.code, 'agreement_reacceptance_required');
  assert.equal(body.requiredAgreementVersion, 'v2');
  assert.equal(handlerCalls.length, 0);
});

test('passes a current user through', async () => {
  userItem = { ...userItem, agreementVersion: 'v2' };
  const response = await gate(handler)(makeEvent());
  assert.equal(response.statusCode, 201);
  assert.equal(handlerCalls.length, 1);
});

test('passes through when no required version is configured', async () => {
  requiredVersion = null;
  const response = await gate(handler)(makeEvent());
  assert.equal(response.statusCode, 201);
});

test('passes through unauthenticated requests (handler owns its 401)', async () => {
  const response = await gate(handler)(makeEvent(null));
  assert.equal(response.statusCode, 201);
  assert.equal(handlerCalls.length, 1);
});

test('passes through unregistered users (handler owns its 404)', async () => {
  userItem = null;
  const response = await gate(handler)(makeEvent());
  assert.equal(response.statusCode, 201);
});
