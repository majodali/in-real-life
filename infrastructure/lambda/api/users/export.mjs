// Route handler for GET /me/export.
//
// Makes the terms-of-use promise real: returns everything we have about
// the caller — their current state row plus their full event history,
// paginated through so nothing is left behind. The frontend turns the
// JSON into a downloadable file; the API just returns it.

import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { decryptPii } from '../lib/crypto-shred.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createExportHandler({ client, usersTable, eventsLogTable, keyStore, piiFieldsFor }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });
    if (claims.email_verified !== 'true' && claims.email_verified !== true) {
      return reply(403, { error: 'email not verified' });
    }

    const userId = claims.sub;

    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (!userRow.Item) return reply(404, { error: 'user not registered' });

    const aggregateId = `user#${userId}`;
    const events = [];
    let exclusiveStartKey;
    do {
      const page = await client.send(new QueryCommand({
        TableName: eventsLogTable,
        KeyConditionExpression: 'aggregateId = :a',
        ExpressionAttributeValues: { ':a': aggregateId },
        ConsistentRead: true,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }));
      events.push(...(page.Items ?? []));
      exclusiveStartKey = page.LastEvaluatedKey;
    } while (exclusiveStartKey);

    // Decrypt the shredded PII fields so the user gets readable data. The
    // key still exists because the account does — that's the whole point
    // of the export. (No key + no PII events ⇒ nothing to decrypt.)
    let decrypted = events;
    if (keyStore && piiFieldsFor) {
      const key = await keyStore.getKey(aggregateId);
      if (key) {
        decrypted = events.map((e) => {
          const fields = piiFieldsFor(e.eventType);
          if (fields.length === 0) return e;
          return { ...e, data: decryptPii(e.data, fields, key) };
        });
      }
    }

    return reply(200, {
      exportedAt: new Date().toISOString(),
      userId,
      profile: userRow.Item,
      events: decrypted,
    });
  };
}
