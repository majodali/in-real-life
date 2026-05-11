// Specifications for the workshop-time offset loader.
//
// Reads the `workshop-time` row from irl-config and returns
// { offsetMs, description, updatedAt }. Defaults to a no-offset value
// when the row doesn't exist (the production case, where workshop time
// is never set, and the early workshop case, before any admin command).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createWorkshopOffsetLoader } from './workshop-time.mjs';

const ddbMock = mockClient(DynamoDBDocumentClient);
const CONFIG_TABLE = 'irl-config-test';

let getOffset;

beforeEach(() => {
  ddbMock.reset();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  getOffset = createWorkshopOffsetLoader({ client, configTable: CONFIG_TABLE });
});

test('returns offsetMs, description, updatedAt, and seq from the workshop-time row', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      configKey: 'workshop-time',
      offsetMs: 7200000,
      description: 'advanced 2h',
      updatedAt: '2026-05-07T10:00:00.000Z',
      seq: 3,
    },
  });

  const result = await getOffset();
  assert.equal(result.offsetMs, 7200000);
  assert.equal(result.description, 'advanced 2h');
  assert.equal(result.updatedAt, '2026-05-07T10:00:00.000Z');
  assert.equal(result.seq, 3);
});

test('returns default zero offset and seq=0 when the workshop-time row is absent', async () => {
  ddbMock.on(GetCommand).resolves({});

  const result = await getOffset();
  assert.equal(result.offsetMs, 0);
  assert.equal(result.description, 'real time');
  assert.equal(result.updatedAt, null);
  assert.equal(result.seq, 0);
});

test('queries irl-config with key { configKey: "workshop-time" }', async () => {
  ddbMock.on(GetCommand).resolves({});
  await getOffset();

  const calls = ddbMock.commandCalls(GetCommand);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0].input.TableName, CONFIG_TABLE);
  assert.deepEqual(calls[0].args[0].input.Key, { configKey: 'workshop-time' });
});

test('propagates DynamoDB errors', async () => {
  ddbMock.on(GetCommand).rejects(new Error('boom'));
  await assert.rejects(() => getOffset(), /boom/);
});
