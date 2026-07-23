// Specifications for the Members panel backend
// (docs/admin-and-support.md → Members): the production verification
// queue (verify-only — declines park with R3/R4), and the thin lookup.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createVerificationQueueHandler,
  createVerifyLocalityHandler,
  createMemberLookupHandler,
} from './verification.mjs';

function makeEvent({ claims, body, query } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(query ? { queryStringParameters: query } : {}),
  };
}

const admin = { sub: 'adm-1', 'custom:role': 'admin' };

const PENDING = {
  userId: 'u-pending', name: 'Priya', email: 'priya@example.test',
  city: 'Bainbridge Island', postalCode: '98110',
  localityRequestedAt: '2026-07-20T00:00:00Z', seq: 3,
  // Never surfaced by the panel:
  vibeMessage: 'private-ish', onboardingCompletedAt: '2026-07-20T01:00:00Z',
};

let scanned, users, runnerCalls;

function buildClient() {
  return {
    send: async (cmd) => {
      const kind = cmd.constructor.name;
      if (kind === 'ScanCommand') {
        scanned.push(cmd.input);
        return { Items: users };
      }
      if (kind === 'GetCommand') {
        return { Item: users.find((u) => u.userId === cmd.input.Key.userId) ?? null };
      }
      throw new Error(`unexpected ${kind}`);
    },
  };
}

beforeEach(() => {
  scanned = [];
  users = [PENDING];
  runnerCalls = [];
});

test('queue: admin-gated, minimal fields, oldest first', async () => {
  const handler = createVerificationQueueHandler({ client: buildClient(), usersTable: 'users-t' });
  assert.equal((await handler(makeEvent())).statusCode, 401);
  assert.equal((await handler(makeEvent({ claims: { sub: 'x', 'custom:role': 'member' } }))).statusCode, 403);

  users = [
    { ...PENDING, userId: 'u2', localityRequestedAt: '2026-07-21T00:00:00Z' },
    PENDING,
  ];
  const res = await handler(makeEvent({ claims: admin }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.count, 2);
  assert.equal(body.pending[0].userId, 'u-pending', 'oldest request first');
  assert.equal(body.pending[0].postalCode, '98110');
  assert.doesNotMatch(res.body, /vibeMessage|private-ish/, 'PII minimalism — state basics only');
  assert.match(scanned[0].FilterExpression, /localityRequestedAt/);
});

test('verify: emits LocalityVerified + UserActivated with the admin as actor', async () => {
  const runner = {
    runCommand: async (input) => { runnerCalls.push(input); return { cached: false, result: input.result }; },
  };
  const handler = createVerifyLocalityHandler({ runner, client: buildClient(), usersTable: 'users-t' });

  const res = await handler(makeEvent({
    claims: admin, body: { commandId: 'c1', userId: 'u-pending' },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(runnerCalls.length, 2);

  const [verify, activate] = runnerCalls;
  assert.equal(verify.actorId, 'user#adm-1', 'the admin is the audited actor');
  assert.equal(verify.events[0].eventType, 'LocalityVerified');
  assert.equal(verify.events[0].seq, 4);
  assert.deepEqual(verify.events[0].data, { userId: 'u-pending', verifiedBy: 'adm-1', method: 'admin' });
  assert.equal(activate.commandId, 'c1:activate', 'derived id — retries converge mid-chain');
  assert.equal(activate.events[0].eventType, 'UserActivated');
  assert.equal(activate.events[0].seq, 5);
});

test('verify: guards — unknown user 404, no request 409, already verified 409', async () => {
  const runner = { runCommand: async () => { throw new Error('must not run'); } };
  const handler = createVerifyLocalityHandler({ runner, client: buildClient(), usersTable: 'users-t' });

  assert.equal((await handler(makeEvent({
    claims: admin, body: { commandId: 'c1', userId: 'nobody' },
  }))).statusCode, 404);

  users = [{ userId: 'u-x', seq: 1 }];
  assert.equal((await handler(makeEvent({
    claims: admin, body: { commandId: 'c1', userId: 'u-x' },
  }))).statusCode, 409);

  users = [{ ...PENDING, localityVerified: true }];
  assert.equal((await handler(makeEvent({
    claims: admin, body: { commandId: 'c1', userId: 'u-pending' },
  }))).statusCode, 409);
});

test('lookup: by email, state basics only, 404 when absent', async () => {
  const handler = createMemberLookupHandler({ client: buildClient(), usersTable: 'users-t' });
  const res = await handler(makeEvent({
    claims: admin, query: { email: '  PRIYA@example.test ' },
  }));
  assert.equal(res.statusCode, 200);
  const { member } = JSON.parse(res.body);
  assert.equal(member.userId, 'u-pending');
  assert.equal(member.localityVerified, false);
  assert.doesNotMatch(res.body, /vibeMessage/);
  assert.equal(scanned[0].ExpressionAttributeValues[':e'], 'priya@example.test', 'normalized');

  users = [];
  assert.equal((await handler(makeEvent({
    claims: admin, query: { email: 'ghost@example.test' },
  }))).statusCode, 404);
  assert.equal((await handler(makeEvent({ claims: admin }))).statusCode, 400);
});
