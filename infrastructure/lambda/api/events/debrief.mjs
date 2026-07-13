// Route handler for POST /events/:eventId/debrief — the tiered debrief
// (docs/debrief.md).
//
// Tier 0–1 is deterministic capture: attended (+ light no-show reason),
// repetition intent ("worth another go?"), the people step (who you met,
// positive-only see-again), texture chips. No model call.
//
// Tier 2 is one extraction call, only when the member gave free text
// (surprise / reflection) — deltas ride IN the event so the async
// projector stays LLM-free (docs/projection-store.md).
//
// The people step arrives as opaque attendee refs (attendees.mjs) and is
// resolved back to userIds server-side — ids never travel to clients.
//
// Conduct quarantine (open-risks #11): when conductConcern is set, the
// event carries attendance + the concern ONLY — every preference field
// (again, texture, people, free text, deltas) is suppressed at the
// command, so a bad experience can never masquerade as a preference.
// Safety is not signal.

import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { computeEffectiveState, simulatedNowIso } from '../lib/lifecycle-state.mjs';
import { attendeeRef, rosterKeyFor } from './attendees.mjs';
import { DEBRIEF_EXTRACTION_SYSTEM, DEBRIEF_EXTRACTION_SCHEMA } from './debrief-schema.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const AGAIN = new Set(['yes', 'maybe', 'no']);
const TEXT_MAX = 1000;
const SHORT_MAX = 200;
const TEXTURE_MAX_CHIPS = 8;

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function trimmed(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : undefined;
}

export function createSubmitDebriefHandler({
  runner, client, eventsTable, interactionsTable, getOffset, llm, keyStore,
}) {
  async function resolvePeople(people, eventId, selfUserId) {
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
    const byRef = new Map(rows.map((r) => [attendeeRef(r.userId, rosterKey), r.userId]));

    const resolved = [];
    for (const p of people) {
      const userId = byRef.get(p.ref);
      if (!userId) return { error: 'unknown attendee ref' };
      if (userId === selfUserId) continue; // tapping yourself carries nothing
      resolved.push({ userId, met: true, seeAgain: p.seeAgain === true });
    }
    return { resolved };
  }

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

    const eventId = httpEvent.pathParams?.eventId ?? httpEvent.pathParameters?.eventId;
    if (!eventId) return reply(400, { error: 'eventId path parameter required' });

    // ── Validate the capture ──
    if (typeof body.attended !== 'boolean') {
      return reply(400, { error: 'attended (boolean) required' });
    }
    const conductConcern = body.conductConcern === true;
    const again = body.again;
    if (body.attended && !conductConcern && !AGAIN.has(again)) {
      return reply(400, { error: 'again must be yes, maybe, or no' });
    }
    let outcomeTexture;
    if (body.outcomeTexture !== undefined) {
      if (!Array.isArray(body.outcomeTexture)
        || body.outcomeTexture.some((t) => typeof t !== 'string' || !t.trim())) {
        return reply(400, { error: 'outcomeTexture must be an array of chip strings' });
      }
      outcomeTexture = body.outcomeTexture.slice(0, TEXTURE_MAX_CHIPS).map((t) => t.trim().slice(0, 60));
    }
    let people = [];
    if (body.people !== undefined) {
      if (!body.attended) return reply(400, { error: 'people step applies only when you attended' });
      if (!Array.isArray(body.people)
        || body.people.some((p) => !p || typeof p.ref !== 'string')) {
        return reply(400, { error: 'people must be an array of { ref, seeAgain? }' });
      }
      people = body.people;
    }
    const noShowReason = trimmed(body.noShowReason, SHORT_MAX);
    const surprise = trimmed(body.surprise, TEXT_MAX);
    const reflection = trimmed(body.reflection, TEXT_MAX);
    const conductNote = trimmed(body.conductNote, TEXT_MAX);

    // ── Event + eligibility (unchanged rules: over + confirmed) ──
    const eventRow = await client.send(new GetCommand({ TableName: eventsTable, Key: { eventId } }))
      .then((out) => out.Item || null);
    if (!eventRow) return reply(404, { error: 'event not found' });
    if (eventRow.lifecycleState === 'cancelled') {
      return reply(409, { error: 'event was cancelled' });
    }
    const offsetMs = getOffset ? (await getOffset()).offsetMs : 0;
    if (computeEffectiveState(eventRow, simulatedNowIso(offsetMs)) !== 'over') {
      return reply(409, { error: 'event is not over yet' });
    }

    const userId = claims.sub;
    const interactionRow = await client.send(new GetCommand({
      TableName: interactionsTable,
      Key: { userId, eventId },
    })).then((out) => out.Item || null);
    if (!interactionRow || interactionRow.level !== 'confirmed') {
      return reply(409, { error: 'only confirmed attendees can debrief' });
    }

    // ── Assemble event data ──
    const data = { userId, eventId, attended: body.attended };

    if (conductConcern) {
      // Quarantine: attendance/reliability still counts; every preference
      // field is dropped so the model never learns from a bad experience.
      data.conductConcern = true;
      if (conductNote !== undefined) data.conductNote = conductNote;
      data.suppressed = true;
    } else {
      if (body.attended) {
        data.again = again;
        if (outcomeTexture?.length) data.outcomeTexture = outcomeTexture;
        if (people.length > 0) {
          const { resolved, error } = await resolvePeople(people, eventId, userId);
          if (error) return reply(400, { error });
          if (resolved.length > 0) data.people = resolved;
        }
        if (surprise !== undefined && surprise !== '') data.surprise = surprise;
        if (reflection !== undefined && reflection !== '') data.reflection = reflection;

        // Tier 2: one extraction call, only when free text was given.
        if (data.surprise || data.reflection) {
          const extraction = await llm.complete({
            task: 'debrief-extraction',
            system: DEBRIEF_EXTRACTION_SYSTEM,
            messages: [{
              role: 'user',
              content: [
                `EVENT: ${eventRow.title}`,
                `WORTH ANOTHER GO: ${again}`,
                outcomeTexture?.length ? `TEXTURE CHIPS: ${outcomeTexture.join(', ')}` : null,
                data.surprise ? `SURPRISE: ${data.surprise}` : null,
                data.reflection ? `SAY MORE: ${data.reflection}` : null,
              ].filter(Boolean).join('\n'),
            }],
            schema: DEBRIEF_EXTRACTION_SCHEMA,
            maxTokens: 2048,
          });
          data.deltas = extraction;
        }
      } else if (noShowReason !== undefined && noShowReason !== '') {
        data.noShowReason = noShowReason;
      }
    }

    const out = await runner.runCommand({
      commandId,
      aggregateId: `interaction#${userId}#${eventId}`,
      actorId: `user#${userId}`,
      events: [{
        eventType: 'DebriefSubmitted',
        version: 1,
        seq: interactionRow.seq + 1,
        data,
      }],
      result: {
        eventId,
        attended: body.attended,
        again: conductConcern ? null : (body.attended ? again : null),
        ...(conductConcern ? { conductAcknowledged: true } : {}),
      },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}
