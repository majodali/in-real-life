// Specifications for GET /me/export.
//
// Honors the terms-of-use promise: "ask us and we'll send you everything
// we have about you." Returns the user's state row plus their full event
// history (paginated through), as JSON the frontend turns into a file.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createExportHandler } from './export.mjs';
import { piiFieldsFor } from '../lib/pii-registry.mjs';
import { generateDataKey, encryptPii } from '../lib/crypto-shred.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims } = {}) {
  return { requestContext: claims ? { authorizer: { jwt: { claims } } } : {} };
}

const validClaims = { sub: 'abc', email: 'a@b.c', email_verified: 'true' };

let client, handler;
let userItem;
let queryPages;

function buildClient() {
  let queryCall = 0;
  return {
    send: spy(async (cmd) => {
      const kind = cmd.constructor.name;
      if (kind === 'GetCommand') {
        return { Item: userItem };
      }
      if (kind === 'QueryCommand') {
        return queryPages[queryCall++];
      }
      throw new Error(`unexpected command ${kind}`);
    }),
  };
}

beforeEach(() => {
  userItem = {
    userId: 'abc',
    email: 'a@b.c',
    name: 'Matthew',
    avatar: '\u{1F33F}',
    seq: 2,
  };
  queryPages = [
    {
      Items: [
        { aggregateId: 'user#abc', seq: 1, eventType: 'UserRegistered', data: { userId: 'abc' } },
        { aggregateId: 'user#abc', seq: 2, eventType: 'UserProfileCreated', data: { name: 'Matthew' } },
      ],
    },
  ];
  client = buildClient();
  handler = createExportHandler({ client, usersTable: 'irl-users-test', eventsLogTable: 'irl-events-log-test' });
});

// ─── Happy path ───

test('returns 200 with profile and events', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.userId, 'abc');
  assert.deepEqual(body.profile, userItem);
  assert.equal(body.events.length, 2);
  assert.equal(body.events[0].eventType, 'UserRegistered');
});

test('includes an exportedAt ISO timestamp', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.ok(body.exportedAt);
  assert.ok(!Number.isNaN(Date.parse(body.exportedAt)));
});

test('queries usersTable by sub and eventsLog by user#<sub>', async () => {
  await handler(makeEvent({ claims: validClaims }));
  const calls = client.send.calls.map(([c]) => c);
  const get = calls.find((c) => c.constructor.name === 'GetCommand');
  const query = calls.find((c) => c.constructor.name === 'QueryCommand');
  assert.equal(get.input.TableName, 'irl-users-test');
  assert.deepEqual(get.input.Key, { userId: 'abc' });
  assert.equal(query.input.TableName, 'irl-events-log-test');
  assert.equal(query.input.ExpressionAttributeValues[':a'], 'user#abc');
});

test('paginates through every event page', async () => {
  queryPages = [
    {
      Items: [{ aggregateId: 'user#abc', seq: 1, eventType: 'UserRegistered' }],
      LastEvaluatedKey: { aggregateId: 'user#abc', seq: 1 },
    },
    {
      Items: [{ aggregateId: 'user#abc', seq: 2, eventType: 'UserProfileCreated' }],
    },
  ];
  client = buildClient();
  handler = createExportHandler({ client, usersTable: 'irl-users-test', eventsLogTable: 'irl-events-log-test' });

  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.events.length, 2);
  assert.equal(body.events[1].seq, 2);

  // Second query carried the ExclusiveStartKey from the first page.
  const queries = client.send.calls.map(([c]) => c).filter((c) => c.constructor.name === 'QueryCommand');
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[1].input.ExclusiveStartKey, { aggregateId: 'user#abc', seq: 1 });
});

// ─── Not found ───

test('returns 404 when there is no user state row', async () => {
  userItem = undefined;
  client = buildClient();
  handler = createExportHandler({ client, usersTable: 'irl-users-test', eventsLogTable: 'irl-events-log-test' });

  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.statusCode, 404);
});

// ─── Auth guards ───

test('returns 401 without JWT claims', async () => {
  const response = await handler({});
  assert.equal(response.statusCode, 401);
  assert.equal(client.send.calls.length, 0);
});

test('returns 403 when email is not verified', async () => {
  const response = await handler(makeEvent({ claims: { ...validClaims, email_verified: 'false' } }));
  assert.equal(response.statusCode, 403);
  assert.equal(client.send.calls.length, 0);
});

// ─── Response shape ───

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.headers['Content-Type'], 'application/json');
});

// ─── Crypto-shred: decrypt-on-read ───

test('decrypts shredded PII so the export is human-readable', async () => {
  const key = generateDataKey();
  const keyStore = {
    getKey: spy(async () => key),
    getOrCreateKey: spy(async () => key),
    deleteKey: spy(async () => {}),
  };

  // Event log holds encrypted PII (as the runner would have written it).
  queryPages = [{
    Items: [
      {
        aggregateId: 'user#abc', seq: 1, eventType: 'UserRegistered',
        data: encryptPii({ userId: 'abc', email: 'a@b.c', agreementVersion: 'v1' }, ['email'], key),
      },
      {
        aggregateId: 'user#abc', seq: 2, eventType: 'UserProfileCreated',
        data: encryptPii(
          { userId: 'abc', name: 'Matthew', avatar: '\u{1F33F}', vibeMessage: 'walks' },
          ['name', 'avatar', 'vibeMessage', 'interviewResponses'], key,
        ),
      },
    ],
  }];
  client = buildClient();
  handler = createExportHandler({
    client,
    usersTable: 'irl-users-test',
    eventsLogTable: 'irl-events-log-test',
    keyStore,
    piiFieldsFor,
  });

  const response = await handler(makeEvent({ claims: validClaims }));
  const body = JSON.parse(response.body);

  const reg = body.events.find((e) => e.eventType === 'UserRegistered');
  assert.equal(reg.data.email, 'a@b.c');           // decrypted
  assert.equal(reg.data.agreementVersion, 'v1');   // was always cleartext

  const prof = body.events.find((e) => e.eventType === 'UserProfileCreated');
  assert.equal(prof.data.name, 'Matthew');
  assert.equal(prof.data.avatar, '\u{1F33F}');
});

test('skips decryption gracefully when no key exists (no PII events)', async () => {
  const keyStore = {
    getKey: spy(async () => null),
    getOrCreateKey: spy(async () => null),
    deleteKey: spy(async () => {}),
  };
  client = buildClient(); // default cleartext fixture from beforeEach
  handler = createExportHandler({
    client,
    usersTable: 'irl-users-test',
    eventsLogTable: 'irl-events-log-test',
    keyStore,
    piiFieldsFor,
  });

  const response = await handler(makeEvent({ claims: validClaims }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.events.length, 2);
});
