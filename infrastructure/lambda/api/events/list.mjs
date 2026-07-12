// Route handler for GET /events.
//
// Returns every event state row, sorted by startTime ascending. No locality
// filter yet — locality-aware visibility lands in a follow-up slice along
// with a proper GSI. Paginated Scan is acceptable at the current scale
// (sub-thousand events per locality).

import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { computeEffectiveState } from '../lib/lifecycle-state.mjs';
import { eventsOverlap } from './overlap.mjs';
import { isFull } from './event-fields.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createListEventsHandler({ client, eventsTable, interactionsTable, getOffset }) {
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

    // Pull the caller's interactions in one query (partitioned by userId).
    // Lets us merge per-event myLevel + myDebrief without an N+1 lookup.
    const levelByEvent = new Map();
    const debriefByEvent = new Map();
    if (interactionsTable) {
      let lastKey;
      do {
        const out = await client.send(new QueryCommand({
          TableName: interactionsTable,
          KeyConditionExpression: 'userId = :u',
          ExpressionAttributeValues: { ':u': claims.sub },
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
        }));
        for (const row of out.Items ?? []) {
          levelByEvent.set(row.eventId, row.level);
          if (row.debrief) debriefByEvent.set(row.eventId, row.debrief);
        }
        lastKey = out.LastEvaluatedKey;
      } while (lastKey);
    }

    items.sort((a, b) => {
      const av = a.startTime ?? '';
      const bv = b.startTime ?? '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    });

    // Compute the effective lifecycle state using the simulated clock.
    // Stored states are the human-controlled ones; "in-progress" and "over"
    // are time-derived so we don't need a scheduled job to flip them.
    const offset = getOffset ? (await getOffset()).offsetMs : 0;
    const nowIso = new Date(Date.now() + offset).toISOString();

    const events = items.map((e) => {
      const effectiveState = computeEffectiveState(e, nowIso);
      return {
        ...e,
        myLevel: levelByEvent.get(e.eventId) ?? null,
        myDebrief: debriefByEvent.get(e.eventId) ?? null,
        effectiveState,
        // Capacity read: only meaningful while joining is possible.
        ...(isFull(e) && (effectiveState === 'proposed' || effectiveState === 'planned')
          ? { full: true } : {}),
      };
    });

    // Double-confirmation conflicts, computed at read time so edits that
    // create (or dissolve) an overlap after the fact are always caught.
    // Interest overlaps are deliberately not flagged — browsing options is
    // fine — and nothing is ever auto-cancelled; the member decides.
    const myLive = events.filter((e) => e.myLevel === 'confirmed'
      && e.effectiveState !== 'cancelled' && e.effectiveState !== 'over');
    for (const e of myLive) {
      const overlapping = myLive
        .filter((other) => other.eventId !== e.eventId && eventsOverlap(e, other))
        .map((other) => other.eventId);
      if (overlapping.length) e.conflictsWith = overlapping;
    }

    return reply(200, { events, count: events.length, simulatedTime: nowIso });
  };
}

// Re-exported for backward compatibility; the canonical definition now lives
// in lib/lifecycle-state.mjs so every reader shares one rule.
export { computeEffectiveState } from '../lib/lifecycle-state.mjs';
