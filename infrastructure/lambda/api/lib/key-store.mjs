// Per-aggregate key store for crypto-shredding.
//
// One random AES-256 key per aggregate, in the keys table keyed by
// aggregateId. getOrCreateKey runs on the write path before the first PII
// event; deleteKey is the shred performed on account deletion.
//
// IMPORTANT: this table must NOT have point-in-time recovery / backups —
// a backed-up key would defeat the shred. Enforced in the CDK stack.

import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { generateDataKey } from './crypto-shred.mjs';

export function createKeyStore({ client, keysTable }) {
  async function read(aggregateId) {
    const res = await client.send(new GetCommand({
      TableName: keysTable,
      Key: { aggregateId },
    }));
    return res.Item?.dataKey ?? null;
  }

  async function getKey(aggregateId) {
    return read(aggregateId);
  }

  async function getOrCreateKey(aggregateId) {
    const existing = await read(aggregateId);
    if (existing) return existing;

    const dataKey = generateDataKey();
    try {
      await client.send(new PutCommand({
        TableName: keysTable,
        Item: { aggregateId, dataKey },
        ConditionExpression: 'attribute_not_exists(aggregateId)',
      }));
      return dataKey;
    } catch (err) {
      if (err?.name === 'ConditionalCheckFailedException') {
        // Lost a create race — return whoever won.
        const winner = await read(aggregateId);
        if (winner) return winner;
      }
      throw err;
    }
  }

  async function deleteKey(aggregateId) {
    await client.send(new DeleteCommand({
      TableName: keysTable,
      Key: { aggregateId },
    }));
  }

  return { getKey, getOrCreateKey, deleteKey };
}
