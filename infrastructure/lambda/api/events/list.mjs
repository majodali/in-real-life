// Route handler for GET /events.
//
// Returns every event state row, sorted by startTime ascending. No locality
// filter yet — locality-aware visibility lands in a follow-up slice along
// with a proper GSI. Paginated Scan is acceptable at the current scale
// (sub-thousand events per locality).

import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createListEventsHandler({ client, eventsTable }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const items = [];
    let ExclusiveStartKey;
    do {
      const out = await client.send(new ScanCommand({
        TableName: eventsTable,
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }));
      items.push(...(out.Items ?? []));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    items.sort((a, b) => {
      const av = a.startTime ?? '';
      const bv = b.startTime ?? '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    });

    return reply(200, { events: items, count: items.length });
  };
}
