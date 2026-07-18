// Round-trip spec: the projector driven by a REAL stream-record shape.
//
// Every other projector spec hands applyEvent a plain object. On a live
// stack the record passes through DynamoDB marshalling and arrives as a
// stream NewImage that the handler unmarshalls — this suite drives that
// exact path (marshall(logItem) === what the stream delivers) so a
// serialization mismatch can never hide behind plain-object fixtures.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { createStreamHandler } from './stream-handler.mjs';
import { createUserModelProjector } from './user-model.mjs';
import { generateDataKey, encryptValue, encryptPii, decryptValue } from '../lib/crypto-shred.mjs';

let dataKey, writes, client, keyStore, handler;

beforeEach(() => {
  dataKey = generateDataKey();
  writes = [];
  client = {
    send: async (cmd) => {
      const name = cmd.constructor.name;
      if (name === 'PutCommand') { writes.push(cmd.input.Item); return {}; }
      if (name === 'GetCommand') {
        const found = writes.find((w) => w.sk === cmd.input.Key.sk);
        return found ? { Item: found } : {};
      }
      if (name === 'QueryCommand') return { Items: [] };
      throw new Error(`unexpected command ${name}`);
    },
  };
  keyStore = { getKey: async () => dataKey };
  handler = createStreamHandler({
    projectors: [createUserModelProjector({ client, userModelTable: 't', keyStore })],
    unmarshall,
  });
});

function record(logItem, eventName = 'INSERT') {
  return {
    eventName,
    dynamodb: { SequenceNumber: '111', NewImage: marshall(logItem) },
  };
}

test('OnboardingCompleted round-trips marshalling and seeds the store', async () => {
  const extraction = {
    narrative: { selfDescription: 's', goal: 'g', stories: [] },
    doors: [{ door: 'connect', weight: 0.7, provenance: 'stated', confidence: 'medium' }],
    interests: [{ tag: 'pottery', weight: 0.8, provenance: 'stated', confidence: 'medium' }],
    strengthsToOffer: [],
    envelope: { groupSize: { comfort: 'small', provenance: 'inferred', confidence: 'medium' } },
    constraints: {},
    barriers: [],
    provisional: true,
  };
  const logItem = {
    aggregateId: 'user#abc',
    seq: 3,
    eventId: '01TEST',
    eventType: 'OnboardingCompleted',
    version: 1,
    actorId: 'user#abc',
    wallTime: '2026-07-15T10:00:00.000Z',
    simulatedTime: '2026-07-15T10:00:00.000Z',
    bucket: '2026-07',
    traceId: 'trace-1',
    data: {
      userId: 'abc',
      transcript: encryptValue([{ role: 'member', text: 'hi' }], dataKey),
      extraction: encryptValue(extraction, dataKey),
    },
  };

  const out = await handler({ Records: [record(logItem)] });
  assert.deepEqual(out.batchItemFailures, []);
  const core = writes.find((w) => w.sk === 'profile#core');
  assert.ok(core, 'profile#core seeded through the marshalled path');
  assert.equal(core.asOf, '2026-07-15T10:00:00.000Z');
  assert.ok(decryptValue(core.model, dataKey).envelope.groupSize);
  assert.ok(writes.find((w) => w.sk === 'interest#pottery'));
});

test('DebriefSubmitted round-trips marshalling: affinity edge + stats land', async () => {
  const data = {
    userId: 'abc',
    eventId: 'evt-9',
    attended: true,
    ...encryptPii({
      again: 'yes',
      people: [{ userId: 'other-1', met: true, seeAgain: true }],
    }, ['again', 'people'], dataKey),
  };
  const logItem = {
    aggregateId: 'interaction#abc#evt-9',
    seq: 3,
    eventId: '01DBRF',
    eventType: 'DebriefSubmitted',
    version: 1,
    actorId: 'user#abc',
    wallTime: '2026-07-20T10:00:00.000Z',
    simulatedTime: '2026-07-20T10:00:00.000Z',
    bucket: '2026-07',
    data,
  };

  const out = await handler({ Records: [record(logItem)] });
  assert.deepEqual(out.batchItemFailures, []);
  assert.ok(writes.find((w) => w.sk === 'affinity#other-1'));
  const stats = writes.find((w) => w.sk === 'stats#affinity');
  assert.ok(stats);
  assert.equal(decryptValue(stats.model, dataKey).tapsGiven, 1);
});

test('non-INSERT records and non-model events pass through untouched', async () => {
  const out = await handler({
    Records: [
      record({ aggregateId: 'user#abc', seq: 1, eventId: 'e1', eventType: 'UserRegistered', data: { userId: 'abc' } }, 'REMOVE'),
      record({ aggregateId: 'event#e-1', seq: 1, eventId: 'e2', eventType: 'EventProposed', data: { eventId: 'e-1' } }),
      record({ aggregateId: 'system#config', seq: 4, eventId: 'e3', eventType: 'WorkshopTimeAdvanced', data: {} }),
    ],
  });
  assert.deepEqual(out.batchItemFailures, []);
  assert.deepEqual(writes, []);
});
