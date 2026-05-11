// Test-helper: purge a user's state row + event log entries.
//
// Command records have native TTL so we don't bother deleting them.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

export async function purgeUserAggregate({ userId, tables }) {
  await ddb.send(new DeleteCommand({
    TableName: tables.users,
    Key: { userId },
  }));

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
}

export { ddb };
