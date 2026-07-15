// Test-helper: purge a user's state row + event log entries.
//
// Command records have native TTL so we don't bother deleting them.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { decryptPii } from '../../lambda/api/lib/crypto-shred.mjs';
import { piiFieldsFor } from '../../lambda/api/lib/pii-registry.mjs';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// Read an aggregate's crypto-shred key (null if it has none — e.g. an
// aggregate with no PII events, or a deleted/shredded one).
export async function readDataKey({ aggregateId, tables }) {
  const out = await ddb.send(new GetCommand({
    TableName: tables.userKeys,
    Key: { aggregateId },
    ConsistentRead: true,
  }));
  return out.Item?.dataKey ?? null;
}

// Decrypt a raw event-log item's PII fields with the given key, so tests
// can assert on cleartext. Mirrors the export/replay read path.
export function decryptEventPii(event, key) {
  const fields = piiFieldsFor(event.eventType);
  if (!key || fields.length === 0) return event;
  return { ...event, data: decryptPii(event.data, fields, key) };
}

export async function purgeUserAggregate({ userId, tables }) {
  await ddb.send(new DeleteCommand({
    TableName: tables.users,
    Key: { userId },
  }));

  // Derived user-model rows (async projector output) — purge the partition
  // so a test user leaves nothing behind in the read store.
  if (tables.userModel) {
    let lastKey;
    do {
      const page = await ddb.send(new QueryCommand({
        TableName: tables.userModel,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ProjectionExpression: 'sk',
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }));
      for (const item of page.Items ?? []) {
        await ddb.send(new DeleteCommand({
          TableName: tables.userModel,
          Key: { userId, sk: item.sk },
        }));
      }
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);
  }

  const aggregateId = `user#${userId}`;
  const events = await ddb.send(new QueryCommand({
    TableName: tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': aggregateId },
  }));
  for (const ev of events.Items ?? []) {
    await ddb.send(new DeleteCommand({
      TableName: tables.eventsLog,
      Key: { aggregateId: ev.aggregateId, seq: ev.seq },
    }));
  }

  if (tables.userKeys) {
    await ddb.send(new DeleteCommand({
      TableName: tables.userKeys,
      Key: { aggregateId },
    }));
  }
}

export { ddb };

// Purge one event's footprint: state row, interactions, event-log entries
// for the event and interaction aggregates, and the per-event roster key.
export async function purgeEventAggregate({ eventId, userIds = [], tables }) {
  await ddb.send(new DeleteCommand({
    TableName: tables.events,
    Key: { eventId },
  }));
  for (const userId of userIds) {
    await ddb.send(new DeleteCommand({
      TableName: tables.interactions,
      Key: { userId, eventId },
    })).catch(() => {});
  }
  const aggregates = [
    `event#${eventId}`,
    ...userIds.map((u) => `interaction#${u}#${eventId}`),
  ];
  for (const aggregateId of aggregates) {
    const events = await ddb.send(new QueryCommand({
      TableName: tables.eventsLog,
      KeyConditionExpression: 'aggregateId = :a',
      ExpressionAttributeValues: { ':a': aggregateId },
    }));
    for (const ev of events.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: tables.eventsLog,
        Key: { aggregateId: ev.aggregateId, seq: ev.seq },
      }));
    }
  }
  if (tables.userKeys) {
    await ddb.send(new DeleteCommand({
      TableName: tables.userKeys,
      Key: { aggregateId: `roster#${eventId}` },
    })).catch(() => {});
  }
}
