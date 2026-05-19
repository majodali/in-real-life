// Route handler for GET /admin/notify-list.
//
// Admin-only. Browses the LocationNotifyRequested entries in the event
// log — useful when we expand to a new area and want to email everyone
// who asked from there. Scans with a filter on eventType; acceptable at
// workshop scale. Populating events-by-time-bucket on the GSI for real
// queries is a tracked follow-up.

import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createNotifyListHandler({ client, eventsLogTable }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });
    if (claims['custom:role'] !== 'admin') return reply(403, { error: 'admin only' });

    const items = [];
    let ExclusiveStartKey;
    do {
      const out = await client.send(new ScanCommand({
        TableName: eventsLogTable,
        FilterExpression: 'eventType = :t',
        ExpressionAttributeValues: { ':t': 'LocationNotifyRequested' },
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }));
      items.push(...(out.Items ?? []));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    items.sort((a, b) => (a.wallTime < b.wallTime ? 1 : -1));

    const entries = items.map((e) => ({
      eventId: e.eventId,
      email: e.data?.email,
      postalCode: e.data?.postalCode,
      country: e.data?.country,
      requestedAt: e.wallTime,
    }));

    return reply(200, { entries, count: entries.length });
  };
}
