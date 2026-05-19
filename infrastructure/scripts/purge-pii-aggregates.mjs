// One-off PRE-LAUNCH RESET.
//
// Before crypto-shred there was no per-user key, so user# / notify#
// aggregates were written with cleartext PII in the event log. Keeping
// them risks a mixed cleartext+ciphertext aggregate if the same user is
// touched again (export/replay would try to decrypt a cleartext blob and
// throw). We have no real users yet, so the clean fix is to delete the
// pre-encryption aggregates and their projected state rows.
//
// Scope: deletes every user#* / notify#* item from irl-events-log-<stage>
// and every row from irl-users-<stage>. Leaves system#* (workshop-time)
// alone — non-PII, no key, stays cleartext by design.
//
// Usage:  node scripts/purge-pii-aggregates.mjs <stage>
//   e.g.  node scripts/purge-pii-aggregates.mjs workshop
//         node scripts/purge-pii-aggregates.mjs test

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const stage = process.argv[2];
if (!stage) {
  console.error('usage: node scripts/purge-pii-aggregates.mjs <stage>');
  process.exit(1);
}

const REGION = process.env.AWS_REGION || 'us-east-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const eventsLogTable = `irl-events-log-${stage}`;
const usersTable = `irl-users-${stage}`;

async function* scanAll(TableName, ProjectionExpression, ExpressionAttributeNames) {
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({
      TableName,
      ProjectionExpression,
      ExpressionAttributeNames,
      ExclusiveStartKey,
    }));
    yield* out.Items ?? [];
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function batchDelete(TableName, keys) {
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: { [TableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })) },
    }));
  }
}

async function main() {
  // Event log: delete user#* and notify#* aggregates only.
  const eventKeys = [];
  for await (const item of scanAll(
    eventsLogTable,
    '#a, #s',
    { '#a': 'aggregateId', '#s': 'seq' },
  )) {
    if (item.aggregateId.startsWith('user#') || item.aggregateId.startsWith('notify#')) {
      eventKeys.push({ aggregateId: item.aggregateId, seq: item.seq });
    }
  }
  await batchDelete(eventsLogTable, eventKeys);
  console.log(`${eventsLogTable}: deleted ${eventKeys.length} user#/notify# event(s)`);

  // Users state table: every row is a user projection — clear it.
  const userKeys = [];
  for await (const item of scanAll(usersTable, 'userId')) {
    userKeys.push({ userId: item.userId });
  }
  await batchDelete(usersTable, userKeys);
  console.log(`${usersTable}: deleted ${userKeys.length} state row(s)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
