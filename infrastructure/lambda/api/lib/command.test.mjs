// Specifications for the command idempotency wrapper.
//
// runCommand is the only path that writes to the event log. Each invocation:
//   - checks the irl-commands table for a prior result with the same commandId
//     (returns cached if found)
//   - otherwise enriches the input events with metadata (eventId, wallTime,
//     simulatedTime, etc.), passes them to the projector to compute state
//     writes, and emits a single TransactWriteItems containing:
//       * a Put on irl-commands (conditional on attribute_not_exists(commandId))
//       * one Put per event on irl-events-log (conditional on attribute_not_exists(seq))
//       * the projector's state writes
//   - returns { cached, events, result }
//
// Concurrent races on the same commandId are detected via the first cancellation
// reason: if it's ConditionalCheckFailed, we re-fetch and return the cached result.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { decodeTime } from './ulid.mjs';
import { createCommandRunner } from './command.mjs';
import { piiFieldsFor } from './pii-registry.mjs';
import { decryptValue } from './crypto-shred.mjs';

const ddbMock = mockClient(DynamoDBDocumentClient);

const COMMANDS_TABLE = 'irl-commands-test';
const EVENTS_LOG_TABLE = 'irl-events-log-test';

let runner;
let projector;
let workshopOffset;

beforeEach(() => {
  ddbMock.reset();
  projector = { applyTo: () => [] };
  workshopOffset = { offsetMs: 0, description: 'real time', updatedAt: null };
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  runner = createCommandRunner({
    client,
    commandsTable: COMMANDS_TABLE,
    eventsLogTable: EVENTS_LOG_TABLE,
    projector,
    getOffset: async () => workshopOffset,
  });
});

function baseInput(overrides = {}) {
  return {
    commandId: 'cmd-1',
    aggregateId: 'user#abc',
    events: [{ eventType: 'UserRegistered', version: 1, seq: 1, data: { email: 'a@b.c' } }],
    result: { userId: 'abc' },
    ...overrides,
  };
}

// ─── Cache miss / first invocation ───

test('runs the command and returns the result on cache miss', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  const out = await runner.runCommand(baseInput());

  assert.equal(out.cached, false);
  assert.deepEqual(out.result, { userId: 'abc' });
  assert.equal(ddbMock.commandCalls(TransactWriteCommand).length, 1);
});

// ─── Cache hit / duplicate commandId ───

test('returns the cached result on duplicate commandId without re-executing', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      commandId: 'cmd-1',
      result: { userId: 'cached-user' },
      eventId: '01HX0000000000000000000000',
      createdAt: '2026-05-05T00:00:00.000Z',
    },
  });

  const out = await runner.runCommand(baseInput({ result: { userId: 'this-call' } }));

  assert.equal(out.cached, true);
  assert.deepEqual(out.result, { userId: 'cached-user' });
  assert.equal(ddbMock.commandCalls(TransactWriteCommand).length, 0);
});

// ─── Event metadata generation ───

test('writes events with generated eventId, wallTime, and simulatedTime', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  const before = Date.now();
  await runner.runCommand(baseInput());
  const after = Date.now();

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const eventPut = txn.TransactItems.find(i => i.Put?.TableName === EVENTS_LOG_TABLE);
  assert.ok(eventPut, 'event log put missing from transaction');

  const item = eventPut.Put.Item;
  assert.match(item.eventId, /^[0-9A-HJKMNP-TV-Z]{26}$/);

  const eventTime = decodeTime(item.eventId);
  assert.ok(eventTime >= before && eventTime <= after, `eventId time ${eventTime} outside [${before}, ${after}]`);

  const wallTime = new Date(item.wallTime).getTime();
  assert.ok(wallTime >= before && wallTime <= after, `wallTime ${item.wallTime} outside window`);

  // simulatedTime defaults to wallTime (no offset support yet)
  assert.equal(item.simulatedTime, item.wallTime);
});

test('events copy aggregateId, eventType, version, seq, data, and commandId from input', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  await runner.runCommand(baseInput());

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const item = txn.TransactItems.find(i => i.Put?.TableName === EVENTS_LOG_TABLE).Put.Item;

  assert.equal(item.aggregateId, 'user#abc');
  assert.equal(item.eventType, 'UserRegistered');
  assert.equal(item.version, 1);
  assert.equal(item.seq, 1);
  assert.deepEqual(item.data, { email: 'a@b.c' });
  assert.equal(item.commandId, 'cmd-1');
});

test('passes through actorId and traceId on events', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  await runner.runCommand(baseInput({ actorId: 'user#abc', traceId: '1-trace-id' }));

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const item = txn.TransactItems.find(i => i.Put?.TableName === EVENTS_LOG_TABLE).Put.Item;
  assert.equal(item.actorId, 'user#abc');
  assert.equal(item.traceId, '1-trace-id');
});

test('defaults actorId to "system" when not provided', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  await runner.runCommand(baseInput());

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const item = txn.TransactItems.find(i => i.Put?.TableName === EVENTS_LOG_TABLE).Put.Item;
  assert.equal(item.actorId, 'system');
});

// ─── Workshop time offset ───

test('applies the workshop-time offset to simulatedTime (wallTime is unaffected)', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  const offsetMs = 7200000; // 2h
  workshopOffset = { offsetMs, description: 'advanced 2h', updatedAt: null };

  const before = Date.now();
  await runner.runCommand(baseInput());
  const after = Date.now();

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const item = txn.TransactItems.find(i => i.Put?.TableName === EVENTS_LOG_TABLE).Put.Item;

  const wallTime = new Date(item.wallTime).getTime();
  const simulatedTime = new Date(item.simulatedTime).getTime();

  assert.ok(wallTime >= before && wallTime <= after, `wallTime ${item.wallTime} outside window`);
  assert.ok(
    simulatedTime >= before + offsetMs && simulatedTime <= after + offsetMs,
    `simulatedTime ${item.simulatedTime} not offset by ${offsetMs}ms from wall window`,
  );
});

// ─── Projector integration ───

test('projector receives enriched events (with eventId, wallTime, simulatedTime, etc.)', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  let receivedEvents;
  projector.applyTo = (events) => { receivedEvents = events; return []; };

  const before = Date.now();
  await runner.runCommand(baseInput({ actorId: 'user#abc' }));
  const after = Date.now();

  assert.equal(receivedEvents.length, 1);
  const e = receivedEvents[0];
  assert.equal(e.aggregateId, 'user#abc');
  assert.equal(e.seq, 1);
  assert.equal(e.eventType, 'UserRegistered');
  assert.equal(e.version, 1);
  assert.equal(e.commandId, 'cmd-1');
  assert.equal(e.actorId, 'user#abc');
  assert.match(e.eventId, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  const wallTime = new Date(e.wallTime).getTime();
  assert.ok(wallTime >= before && wallTime <= after);
  assert.equal(e.simulatedTime, e.wallTime);
  assert.deepEqual(e.data, { email: 'a@b.c' });
});

test('stateWrites returned by the projector are included in the transaction', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  const stateWrite1 = { Put: { TableName: 'irl-users-test', Item: { userId: 'abc' } } };
  const stateWrite2 = {
    Update: {
      TableName: 'irl-users-test',
      Key: { userId: 'abc' },
      UpdateExpression: 'SET seq = :s',
      ExpressionAttributeValues: { ':s': 1 },
    },
  };
  projector.applyTo = () => [stateWrite1, stateWrite2];

  await runner.runCommand(baseInput());

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  // 1 command put + 1 event put + 2 state writes = 4
  assert.equal(txn.TransactItems.length, 4);
  assert.ok(txn.TransactItems.includes(stateWrite1));
  assert.ok(txn.TransactItems.includes(stateWrite2));
});

// ─── Multiple events ───

test('writes multiple events with sequential seqs, each with its own eventId', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  await runner.runCommand(baseInput({
    events: [
      { eventType: 'UserRegistered', version: 1, seq: 1, data: {} },
      { eventType: 'UserProfileCreated', version: 1, seq: 2, data: {} },
      { eventType: 'UserActivated', version: 1, seq: 3, data: {} },
    ],
  }));

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const eventPuts = txn.TransactItems.filter(i => i.Put?.TableName === EVENTS_LOG_TABLE);
  assert.equal(eventPuts.length, 3);

  const seqs = eventPuts.map(p => p.Put.Item.seq);
  assert.deepEqual(seqs, [1, 2, 3]);

  const types = eventPuts.map(p => p.Put.Item.eventType);
  assert.deepEqual(types, ['UserRegistered', 'UserProfileCreated', 'UserActivated']);

  const eventIds = eventPuts.map(p => p.Put.Item.eventId);
  assert.equal(new Set(eventIds).size, 3, 'each event must have a unique eventId');
});

// ─── Transaction shape ───

test('command record is written with the result and a 24h TTL', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  const beforeSec = Math.floor(Date.now() / 1000);
  await runner.runCommand(baseInput({ result: { userId: 'abc' } }));
  const afterSec = Math.floor(Date.now() / 1000);

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const cmdPut = txn.TransactItems.find(i => i.Put?.TableName === COMMANDS_TABLE);
  assert.ok(cmdPut);

  const item = cmdPut.Put.Item;
  assert.equal(item.commandId, 'cmd-1');
  assert.deepEqual(item.result, { userId: 'abc' });

  const expected = beforeSec + 24 * 3600;
  assert.ok(item.ttl >= expected - 5 && item.ttl <= afterSec + 24 * 3600 + 5, `ttl ${item.ttl} not within ~24h window`);
});

test('command record Put is conditional on attribute_not_exists(commandId)', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  await runner.runCommand(baseInput());

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const cmdPut = txn.TransactItems.find(i => i.Put?.TableName === COMMANDS_TABLE);
  assert.match(cmdPut.Put.ConditionExpression || '', /attribute_not_exists/);
  assert.match(cmdPut.Put.ConditionExpression || '', /commandId/);
});

test('event log Put is conditional on attribute_not_exists(seq)', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});

  await runner.runCommand(baseInput());

  const txn = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
  const eventPut = txn.TransactItems.find(i => i.Put?.TableName === EVENTS_LOG_TABLE);
  assert.match(eventPut.Put.ConditionExpression || '', /attribute_not_exists/);
  assert.match(eventPut.Put.ConditionExpression || '', /seq/);
});

// ─── Concurrent idempotency conflict ───

test('on TransactWrite ConditionalCheckFailed for commandId, fetches and returns the cached result', async () => {
  ddbMock.on(GetCommand)
    .resolvesOnce({}) // initial idempotency check: no record
    .resolves({ Item: { commandId: 'cmd-1', result: { userId: 'concurrent' } } });

  const tce = new Error('Transaction cancelled');
  tce.name = 'TransactionCanceledException';
  tce.CancellationReasons = [
    { Code: 'ConditionalCheckFailed' }, // command record (slot 0)
    { Code: 'None' },                   // event log
  ];
  ddbMock.on(TransactWriteCommand).rejects(tce);

  const out = await runner.runCommand(baseInput({ result: { userId: 'this-call' } }));

  assert.equal(out.cached, true);
  assert.deepEqual(out.result, { userId: 'concurrent' });
});

test('propagates TransactionCanceledException when the failure is not the commandId condition', async () => {
  ddbMock.on(GetCommand).resolves({});

  const tce = new Error('Transaction cancelled');
  tce.name = 'TransactionCanceledException';
  tce.CancellationReasons = [
    { Code: 'None' },                   // command record OK
    { Code: 'ConditionalCheckFailed' }, // event log seq conflict
  ];
  ddbMock.on(TransactWriteCommand).rejects(tce);

  await assert.rejects(() => runner.runCommand(baseInput()), /Transaction/);
});

// ─── Crypto-shred: PII encryption on the event-log path ───

function fakeKeyStore(initialKey) {
  const keys = new Map();
  if (initialKey) keys.set('user#abc', initialKey);
  return {
    created: [],
    async getOrCreateKey(aggregateId) {
      if (!keys.has(aggregateId)) {
        keys.set(aggregateId, Buffer.alloc(32, 7).toString('base64'));
        this.created.push(aggregateId);
      }
      return keys.get(aggregateId);
    },
    async getKey(aggregateId) { return keys.get(aggregateId) ?? null; },
    async deleteKey(aggregateId) { keys.delete(aggregateId); },
  };
}

function shreddingRunner(keyStore) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  return createCommandRunner({
    client,
    commandsTable: COMMANDS_TABLE,
    eventsLogTable: EVENTS_LOG_TABLE,
    projector,
    getOffset: async () => workshopOffset,
    keyStore,
    piiFieldsFor,
  });
}

function loggedEventItems() {
  const call = ddbMock.commandCalls(TransactWriteCommand)[0];
  return call.args[0].input.TransactItems
    .filter((t) => t.Put?.TableName === EVENTS_LOG_TABLE)
    .map((t) => t.Put.Item);
}

test('encrypts PII fields on the persisted event; non-PII stays cleartext', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});
  const keyStore = fakeKeyStore();
  const runner2 = shreddingRunner(keyStore);

  await runner2.runCommand({
    commandId: 'cmd-1',
    aggregateId: 'user#abc',
    events: [{
      eventType: 'UserRegistered',
      version: 1,
      seq: 1,
      data: { userId: 'abc', email: 'a@b.c', agreementVersion: 'v1', path: 'self' },
    }],
    result: { userId: 'abc' },
  });

  const [item] = loggedEventItems();
  assert.notEqual(item.data.email, 'a@b.c');                 // encrypted
  assert.equal(item.data.userId, 'abc');                     // cleartext (not PII)
  assert.equal(item.data.agreementVersion, 'v1');            // cleartext (compliance)
  assert.equal(item.data.path, 'self');                      // cleartext

  const key = await keyStore.getKey('user#abc');
  assert.equal(decryptValue(item.data.email, key), 'a@b.c'); // round-trips
});

test('the returned events stay cleartext for in-process callers', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});
  const runner2 = shreddingRunner(fakeKeyStore());

  const out = await runner2.runCommand({
    commandId: 'cmd-1',
    aggregateId: 'user#abc',
    events: [{ eventType: 'UserRegistered', version: 1, seq: 1, data: { email: 'a@b.c' } }],
    result: { userId: 'abc' },
  });

  assert.equal(out.events[0].data.email, 'a@b.c');
});

test('projector receives cleartext events even with shredding enabled', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});
  let seen;
  projector.applyTo = (events) => { seen = events; return []; };

  await shreddingRunner(fakeKeyStore()).runCommand({
    commandId: 'cmd-1',
    aggregateId: 'user#abc',
    events: [{ eventType: 'UserProfileCreated', version: 1, seq: 2, data: { name: 'Matthew' } }],
    result: { userId: 'abc' },
  });

  assert.equal(seen[0].data.name, 'Matthew');
});

test('no key is created for aggregates whose events carry no PII', async () => {
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});
  const keyStore = fakeKeyStore();

  await shreddingRunner(keyStore).runCommand({
    commandId: 'cmd-1',
    aggregateId: 'system#workshop-time',
    events: [{ eventType: 'WorkshopTimeAdvanced', version: 1, seq: 1, data: { offsetMs: 1000 } }],
    result: { ok: true },
  });

  assert.deepEqual(keyStore.created, []);
  const [item] = loggedEventItems();
  assert.deepEqual(item.data, { offsetMs: 1000 });
});
