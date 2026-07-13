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

import { createHmac } from 'node:crypto';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Opaque per-event attendee reference: an HMAC of the userId under a
// per-event roster key (random, from the key store, no PII). Lets the
// debrief people-step point at attendees without userIds ever reaching a
// client; the debrief handler recomputes the same refs to resolve taps
// back to userIds server-side. Refs are stable within an event and
// meaningless across events — no cross-event correlation handle.
export function attendeeRef(userId, rosterKey) {
  return createHmac('sha256', Buffer.from(rosterKey, 'base64'))
    .update(String(userId))
    .digest('hex')
    .slice(0, 16);
}

export async function rosterKeyFor(keyStore, eventId) {
  return keyStore.getOrCreateKey(`roster#${eventId}`);
}

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createListAttendeesHandler({ client, eventsTable, interactionsTable, keyStore }) {
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

    const rosterKey = await rosterKeyFor(keyStore, eventId);
    const entry = (row) => ({
      ref: attendeeRef(row.userId, rosterKey),
      name: row.userName || 'someone',
      ...(row.userId === claims.sub ? { me: true } : {}),
    });
    const byName = (a, b) => a.name.localeCompare(b.name);

    const confirmed = rows.filter((r) => r.level === 'confirmed').map(entry).sort(byName);
    const interested = rows.filter((r) => r.level === 'interested').map(entry).sort(byName);

    return reply(200, { eventId, confirmed, interested });
  };
}
