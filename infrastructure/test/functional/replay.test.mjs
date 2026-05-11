// Functional test: state can be rebuilt from the event log alone.
//
// This is the core proof that hybrid event sourcing buys what the design
// promised. We register users via the live API (creates events + projects
// state), snapshot the state, wipe it, replay events through the same
// projection functions the live system uses, and assert the state matches.

import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  GetCommand,
  QueryCommand,
  DeleteCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate, ddb } from '../helpers/cleanup.mjs';
import { createProjector } from '../../lambda/api/lib/projection.mjs';
import { projectUserRegistered } from '../../lambda/api/users/projections.mjs';

let config;
let users = [];

before(async () => {
  config = await loadTestConfig();
});

afterEach(async () => {
  for (const user of users) {
    try { await purgeUserAggregate({ userId: user.sub, tables: config.tables }); } catch { /* ignore */ }
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: user.email }); } catch { /* ignore */ }
  }
  users = [];
});

async function registerUser() {
  const email = `test-${randomUUID()}@example.test`;
  const user = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email,
  });
  users.push(user);

  const response = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${user.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(response.status, 201, `registration failed for ${email}`);
  return user;
}

async function readUserRow(userId) {
  const out = await ddb.send(new GetCommand({
    TableName: config.tables.users,
    Key: { userId },
    ConsistentRead: true,
  }));
  return out.Item;
}

async function readEventsForAggregate(aggregateId) {
  const out = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': aggregateId },
    ConsistentRead: true,
  }));
  return out.Items ?? [];
}

test('replay: state can be rebuilt exactly from the event log alone', async () => {
  // Register two users via the live API. Each call writes a UserRegistered
  // event to the log AND projects a row to the users state table.
  const u1 = await registerUser();
  const u2 = await registerUser();

  // Snapshot current state.
  const before1 = await readUserRow(u1.sub);
  const before2 = await readUserRow(u2.sub);
  assert.ok(before1, 'state row missing for u1');
  assert.ok(before2, 'state row missing for u2');

  // Wipe state. Events remain in the log.
  await ddb.send(new DeleteCommand({
    TableName: config.tables.users,
    Key: { userId: u1.sub },
  }));
  await ddb.send(new DeleteCommand({
    TableName: config.tables.users,
    Key: { userId: u2.sub },
  }));
  assert.equal(await readUserRow(u1.sub), undefined);
  assert.equal(await readUserRow(u2.sub), undefined);

  // Replay events through the same projection function the live system uses.
  const projector = createProjector({
    registry: { UserRegistered: projectUserRegistered },
    tables: { usersTable: config.tables.users },
  });

  for (const user of [u1, u2]) {
    const events = await readEventsForAggregate(`user#${user.sub}`);
    assert.ok(events.length > 0, `expected at least one event for ${user.email}`);
    const writes = projector.applyTo(events);
    await ddb.send(new TransactWriteCommand({ TransactItems: writes }));
  }

  // State has been rebuilt and matches what we snapshotted.
  const after1 = await readUserRow(u1.sub);
  const after2 = await readUserRow(u2.sub);
  assert.deepEqual(after1, before1);
  assert.deepEqual(after2, before2);
});
