// Route handler for POST /events/:eventId/wish — "I wish this was
// closer" (D62, docs/localities-and-constraints.md §2d).
//
// CAPTURE ONLY (capture ≠ use): the tap emits EventWishRecorded onto
// the log — the event, its locality, the band as this member saw it,
// and their home, frozen at tap time — and nothing consumes it yet.
// Consumption is radar R8 (demand signals & event suggestions). The
// dual value is recorded at the source: travel-preference evidence
// (wanting-but-constrained is not silence) and demand signal (what
// members would like to exist locally).

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  COMMUNITY, bandBetween, localityForPostalCode,
} from '../lib/localities.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
// v1 vocabulary: one wish. The family (different-time, more-like-this)
// is R8 design work — a closed set so an unknown wish is loud, never
// silently stored.
const WISHES = new Set(['closer']);

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function createEventWishHandler({ runner, client, eventsTable, usersTable }) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    let body;
    try {
      body = JSON.parse(httpEvent.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }
    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    const wish = body.wish ?? 'closer';
    if (!WISHES.has(wish)) return reply(400, { error: 'wish must be "closer"' });

    const eventId = httpEvent.pathParams?.eventId ?? httpEvent.pathParameters?.eventId;
    if (!eventId) return reply(400, { error: 'eventId path parameter required' });

    const eventRow = await client.send(new GetCommand({
      TableName: eventsTable, Key: { eventId },
    })).then((out) => out.Item || null);
    if (!eventRow) return reply(404, { error: 'event not found' });

    const userId = claims.sub;
    const userRow = await client.send(new GetCommand({
      TableName: usersTable, Key: { userId },
    })).then((out) => out.Item || null);
    if (!userRow) return reply(404, { error: 'user not registered' });

    const homeLocalityId = localityForPostalCode(userRow.postalCode)
      ?? COMMUNITY.homeLocalityId;
    const localityId = eventRow.localityId ?? COMMUNITY.homeLocalityId;

    let out;
    try {
      out = await runner.runCommand({
        commandId,
        aggregateId: `user#${userId}`,
        actorId: `user#${userId}`,
        events: [{
          eventType: 'EventWishRecorded',
          version: 1,
          seq: userRow.seq + 1,
          data: {
            userId,
            eventId,
            wish,
            localityId,
            homeLocalityId,
            band: bandBetween(homeLocalityId, localityId),
          },
        }],
        result: { status: 'wish-recorded', eventId, wish },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'concurrent update, retry' });
      }
      throw err;
    }

    return reply(out.cached ? 200 : 201, out.result);
  };
}
