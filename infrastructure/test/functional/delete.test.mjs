// Functional tests for DELETE /me against the real test stack.
//
// End-to-end proof that the right-to-erasure works: state row deleted,
// crypto-shred key deleted (so the user's PII in the event log becomes
// permanently undecryptable), Cognito user removed (email freed), and a
// UserDeleted audit event left in the log.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate, ddb, readDataKey, decryptEventPii } from '../helpers/cleanup.mjs';

let config;
let user;
let cognito;

before(async () => {
  config = await loadTestConfig();
  cognito = new CognitoIdentityProviderClient({ region: config.region });
});

beforeEach(async () => {
  const email = `test-${randomUUID()}@example.test`;
  user = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email,
  });

  // Register + profile so there's a real aggregate to delete.
  const headers = authHeaders();
  const reg = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST', headers,
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(reg.status, 201);
  const prof = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'POST', headers,
    body: JSON.stringify({
      commandId: randomUUID(),
      name: 'Matthew', avatar: '\u{1F33F}', vibeMessage: 'walks',
    }),
  });
  assert.equal(prof.status, 201);
});

afterEach(async () => {
  if (!user) return;
  // Best-effort cleanup — if the test already deleted everything, these
  // are no-ops.
  try { await purgeUserAggregate({ userId: user.sub, tables: config.tables }); } catch { /* ignore */ }
  try { await deleteTestUser({ userPoolId: config.userPoolId, email: user.email }); } catch { /* ignore */ }
  user = null;
});

function authHeaders() {
  return {
    'Authorization': `Bearer ${user.idToken}`,
    'Content-Type': 'application/json',
  };
}

async function cognitoUserExists(username) {
  try {
    await cognito.send(new AdminGetUserCommand({
      UserPoolId: config.userPoolId,
      Username: username,
    }));
    return true;
  } catch (err) {
    if (err?.name === 'UserNotFoundException') return false;
    throw err;
  }
}

test('DELETE /me: removes state row, shreds the key, deletes Cognito, leaves an audit event', async () => {
  // Sanity: everything exists going in.
  const beforeKey = await readDataKey({ aggregateId: `user#${user.sub}`, tables: config.tables });
  assert.ok(beforeKey, 'pre-test: expected a crypto-shred key');
  assert.equal(await cognitoUserExists(user.email), true);

  const response = await fetch(`${config.apiUrl}/me`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'deleted' });

  // State row is gone.
  const row = await ddb.send(new GetCommand({
    TableName: config.tables.users,
    Key: { userId: user.sub },
    ConsistentRead: true,
  }));
  assert.equal(row.Item, undefined);

  // Key is gone — PII in the event log is now unrecoverable.
  const afterKey = await readDataKey({ aggregateId: `user#${user.sub}`, tables: config.tables });
  assert.equal(afterKey, null);

  // Cognito user is gone — email is freed.
  assert.equal(await cognitoUserExists(user.email), false);

  // Event log: registered + profile + deleted = 3 events; last is UserDeleted.
  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 3);
  const deleted = events.Items.find((e) => e.eventType === 'UserDeleted');
  assert.ok(deleted, 'expected a UserDeleted audit event');
  assert.equal(deleted.seq, 3);
  assert.deepEqual(deleted.data, { userId: user.sub });
  // wallTime is enriched by the runner — proves the audit timestamp is there.
  assert.ok(deleted.wallTime);
});

test('DELETE /me: a prior-user PII event in the log is no longer decryptable after the shred', async () => {
  // Snapshot a PII event before deletion (encrypted).
  const before = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `user#${user.sub}` },
    ConsistentRead: true,
  }));
  const profileEvt = before.Items.find((e) => e.eventType === 'UserProfileCreated');
  assert.ok(profileEvt);

  // Decrypts fine before deletion (key still exists).
  const keyBefore = await readDataKey({ aggregateId: `user#${user.sub}`, tables: config.tables });
  const cleartextBefore = decryptEventPii(profileEvt, keyBefore);
  assert.equal(cleartextBefore.data.name, 'Matthew');

  // Delete.
  await fetch(`${config.apiUrl}/me`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID() }),
  });

  // Key is gone; ciphertext remains in the event we snapshotted, but
  // there's no key to decrypt it with. This is the crypto-shred guarantee.
  const keyAfter = await readDataKey({ aggregateId: `user#${user.sub}`, tables: config.tables });
  assert.equal(keyAfter, null);
  assert.notEqual(profileEvt.data.name, 'Matthew'); // still ciphertext on the snapshot
});

test('DELETE /me: a second DELETE with a new commandId after the row is gone still returns 200', async () => {
  // First deletion.
  const r1 = await fetch(`${config.apiUrl}/me`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(r1.status, 200);

  // The token is still technically valid (Cognito deletes the user but
  // outstanding JWTs remain valid until expiry). A retry with a fresh
  // commandId should still converge to 200.
  const r2 = await fetch(`${config.apiUrl}/me`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(r2.status, 200);
});

test('DELETE /me: returns 400 without a commandId', async () => {
  const response = await fetch(`${config.apiUrl}/me`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
});

test('DELETE /me: returns 401 without auth', async () => {
  const response = await fetch(`${config.apiUrl}/me`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(response.status, 401);
});
