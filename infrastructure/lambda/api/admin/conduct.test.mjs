// Spec for the Safety panel's backend (activity register E2): the
// conduct-concern queue decrypts the reporter's note server-side (the
// D64 discipline's one named exception), degrades gracefully when the
// reporter's key is gone, and empties only through an event-sourced,
// admin-attributed acknowledgment.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createConductQueueHandler,
  createAckConductHandler,
  countOpenConductConcerns,
} from './conduct.mjs';
import { projectConductConcernAcknowledged } from '../events/interaction-projections.mjs';
import { generateDataKey, encryptPii } from '../lib/crypto-shred.mjs';
import { piiFieldsFor } from '../lib/pii-registry.mjs';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLES = {
  interactionsTable: 'interactions',
  eventsTable: 'events',
  usersTable: 'users',
  eventsLogTable: 'events-log',
};

let interactionRows;
let eventRows;
let userRows;
let logRows; //     aggregateId → items
let keys; //        aggregateId → dataKey
let runnerCalls;

function makeClient() {
  return {
    async send(cmd) {
      const name = cmd.constructor.name;
      const input = cmd.input;
      if (name === 'ScanCommand') {
        assert.equal(input.TableName, TABLES.interactionsTable);
        const open = interactionRows.filter(
          (r) => r.debrief?.conductConcern === true && r.conductAckAt === undefined,
        );
        if (input.Select === 'COUNT') return { Count: open.length };
        return { Items: open };
      }
      if (name === 'GetCommand') {
        if (input.TableName === TABLES.eventsTable) {
          return { Item: eventRows[input.Key.eventId] };
        }
        if (input.TableName === TABLES.usersTable) {
          return { Item: userRows[input.Key.userId] };
        }
        if (input.TableName === TABLES.interactionsTable) {
          return {
            Item: interactionRows.find(
              (r) => r.userId === input.Key.userId && r.eventId === input.Key.eventId,
            ),
          };
        }
      }
      if (name === 'QueryCommand') {
        assert.equal(input.TableName, TABLES.eventsLogTable);
        return { Items: logRows[input.ExpressionAttributeValues[':a']] ?? [] };
      }
      throw new Error(`unexpected command ${name} on ${input.TableName}`);
    },
  };
}

const keyStore = { getKey: async (aggregateId) => keys[aggregateId] ?? null };

function makeEvent({ admin = true, body } = {}) {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims: { sub: 'admin-1', ...(admin ? { 'custom:role': 'admin' } : {}) } },
      },
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

// A reported debrief exactly as the runner would have written it: the
// note encrypted under the REPORTER's user# key (piiKeyIdFor).
function seedConcern({ userId, eventId, note, submittedAt, acked = false }) {
  interactionRows.push({
    userId,
    eventId,
    seq: 2,
    level: 'confirmed',
    debrief: { attended: true, conductConcern: true, submittedAt },
    ...(acked ? { conductAckAt: '2026-07-24T00:00:00Z' } : {}),
  });
  const key = generateDataKey();
  keys[`user#${userId}`] = key;
  const data = encryptPii(
    { userId, eventId, attended: true, conductConcern: true, suppressed: true, conductNote: note },
    piiFieldsFor('DebriefSubmitted').filter((f) => f === 'conductNote'),
    key,
  );
  logRows[`interaction#${userId}#${eventId}`] = [
    { aggregateId: `interaction#${userId}#${eventId}`, seq: 2, eventType: 'DebriefSubmitted', data },
  ];
}

beforeEach(() => {
  interactionRows = [];
  eventRows = { e1: { eventId: 'e1', title: 'Trivia night' } };
  userRows = { u1: { userId: 'u1', name: 'Priya', email: 'p@example.test' } };
  logRows = {};
  keys = {};
  runnerCalls = [];
});

function buildQueue() {
  return createConductQueueHandler({ client: makeClient(), ...TABLES, keyStore });
}

function buildAck() {
  return createAckConductHandler({
    runner: {
      async runCommand(input) {
        runnerCalls.push(input);
        return { cached: false, result: input.result };
      },
    },
    client: makeClient(),
    interactionsTable: TABLES.interactionsTable,
  });
}

test('both routes are admin-gated', async () => {
  assert.equal((await buildQueue()(makeEvent({ admin: false }))).statusCode, 403);
  assert.equal(
    (await buildAck()(makeEvent({ admin: false, body: { commandId: 'c', userId: 'u1', eventId: 'e1' } }))).statusCode,
    403,
  );
});

test('queue lists open concerns with decrypted note, reporter basics, event title', async () => {
  seedConcern({ userId: 'u1', eventId: 'e1', note: 'He would not stop following her.', submittedAt: '2026-07-20T00:00:00Z' });

  const res = await buildQueue()(makeEvent());
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.count, 1);
  const [c] = body.concerns;
  assert.equal(c.userId, 'u1');
  assert.equal(c.reporterName, 'Priya');
  assert.equal(c.eventTitle, 'Trivia night');
  assert.equal(c.note, 'He would not stop following her.');
});

test('acknowledged concerns leave the queue; missing key degrades to note null', async () => {
  seedConcern({ userId: 'u1', eventId: 'e1', note: 'x', submittedAt: '2026-07-20T00:00:00Z', acked: true });
  const res1 = await buildQueue()(makeEvent());
  assert.equal(JSON.parse(res1.body).count, 0);

  interactionRows = [];
  logRows = {};
  seedConcern({ userId: 'u1', eventId: 'e1', note: 'y', submittedAt: '2026-07-21T00:00:00Z' });
  delete keys['user#u1']; // reporter deleted their account → key shredded
  const res2 = await buildQueue()(makeEvent());
  const body = JSON.parse(res2.body);
  assert.equal(body.count, 1);
  assert.equal(body.concerns[0].note, null);
});

test('ack emits ConductConcernAcknowledged with the admin as actor; guards hold', async () => {
  seedConcern({ userId: 'u1', eventId: 'e1', note: 'z', submittedAt: '2026-07-20T00:00:00Z' });
  const ack = buildAck();

  const ok = await ack(makeEvent({ body: { commandId: 'c1', userId: 'u1', eventId: 'e1' } }));
  assert.equal(ok.statusCode, 201);
  const [call] = runnerCalls;
  assert.equal(call.aggregateId, 'interaction#u1#e1');
  assert.equal(call.actorId, 'user#admin-1');
  assert.deepEqual(call.events[0], {
    eventType: 'ConductConcernAcknowledged',
    version: 1,
    seq: 3,
    data: { userId: 'u1', eventId: 'e1', acknowledgedBy: 'admin-1' },
  });

  assert.equal(
    (await ack(makeEvent({ body: { commandId: 'c2', userId: 'ghost', eventId: 'e1' } }))).statusCode,
    404,
  );
  interactionRows[0].debrief.conductConcern = undefined;
  assert.equal(
    (await ack(makeEvent({ body: { commandId: 'c3', userId: 'u1', eventId: 'e1' } }))).statusCode,
    409,
  );
  interactionRows[0].debrief.conductConcern = true;
  interactionRows[0].conductAckAt = 'now';
  assert.equal(
    (await ack(makeEvent({ body: { commandId: 'c4', userId: 'u1', eventId: 'e1' } }))).statusCode,
    409,
  );
});

test('projection stamps ack fields with seq condition and no re-ack', async () => {
  const [write] = projectConductConcernAcknowledged({
    seq: 3,
    wallTime: '2026-07-24T01:00:00Z',
    data: { userId: 'u1', eventId: 'e1', acknowledgedBy: 'admin-1' },
  }, { interactionsTable: TABLES.interactionsTable });
  assert.equal(write.Update.TableName, TABLES.interactionsTable);
  assert.deepEqual(write.Update.Key, { userId: 'u1', eventId: 'e1' });
  assert.match(write.Update.ConditionExpression, /attribute_not_exists\(conductAckAt\)/);
  assert.equal(write.Update.ExpressionAttributeValues[':by'], 'admin-1');
  assert.equal(write.Update.ExpressionAttributeValues[':prevSeq'], 2);
});

test('countOpenConductConcerns counts only open concerns', async () => {
  seedConcern({ userId: 'u1', eventId: 'e1', note: 'a', submittedAt: '2026-07-20T00:00:00Z' });
  interactionRows.push({ userId: 'u2', eventId: 'e1', seq: 2, debrief: { attended: true } });
  const n = await countOpenConductConcerns({
    client: makeClient(), scanCommand: ScanCommand, interactionsTable: TABLES.interactionsTable,
  });
  assert.equal(n, 1);
});
