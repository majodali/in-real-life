// Route handler for GET /events/:eventId/attendees — who's going.
//
// The roster behind the counts: confirmed members ("you won't walk in
// alone" — on external events this is the mutual commitment itself, D53)
// and interested members (the demand signal). First names only, per the
// privacy stance: the response carries name snapshots from the
// interaction rows and never exposes userIds — the caller's own entry is
// marked `me` instead.
//
// D52 touchpoint: when protective blocks are built, this roster must pass
// through the rendered-world rule (a blocked person's roster view renders
// the world without the blocker; counts adjusted to match). Pre-launch,
// with blocks unbuilt, the unfiltered roster is acceptable.

import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createListAttendeesHandler({ client, eventsTable, interactionsTable }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const eventId = event.pathParams?.eventId ?? event.pathParameters?.eventId;
    if (!eventId) return reply(400, { error: 'eventId path parameter required' });

    const eventRow = await client.send(new GetCommand({
      TableName: eventsTable,
      Key: { eventId },
    }));
    if (!eventRow.Item) return reply(404, { error: 'event not found' });

    const rows = [];
    let lastKey;
    do {
      const out = await client.send(new QueryCommand({
        TableName: interactionsTable,
        IndexName: 'event-user-index',
        KeyConditionExpression: 'eventId = :e',
        ExpressionAttributeValues: { ':e': eventId },
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }));
      rows.push(...(out.Items ?? []));
      lastKey = out.LastEvaluatedKey;
    } while (lastKey);

    const entry = (row) => ({
      name: row.userName || 'someone',
      ...(row.userId === claims.sub ? { me: true } : {}),
    });
    const byName = (a, b) => a.name.localeCompare(b.name);

    const confirmed = rows.filter((r) => r.level === 'confirmed').map(entry).sort(byName);
    const interested = rows.filter((r) => r.level === 'interested').map(entry).sort(byName);

    return reply(200, { eventId, confirmed, interested });
  };
}
