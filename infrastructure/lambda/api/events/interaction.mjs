// Route handlers for PUT/DELETE /events/:eventId/interaction.
//
// Each user's interaction with a given event lives on its own aggregate —
// interaction#<userId>#<eventId> — so concurrent users don't contend on a
// shared seq. The handler reads the current state row to determine
// previousLevel, then emits the appropriate event. Projections do the
// count math via atomic ADD on the event row.

import { GetCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const VALID_LEVELS = new Set(['interested', 'confirmed']);

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

async function readEventRow(client, eventsTable, eventId) {
  const out = await client.send(new GetCommand({ TableName: eventsTable, Key: { eventId } }));
  return out.Item || null;
}

async function readInteractionRow(client, interactionsTable, userId, eventId) {
  const out = await client.send(new GetCommand({
    TableName: interactionsTable,
    Key: { userId, eventId },
  }));
  return out.Item || null;
}

function userNameFor(claims, override) {
  if (override) return override;
  if (claims.email) return claims.email.split('@')[0];
  return 'someone';
}

export function createSetInteractionHandler({ runner, client, eventsTable, interactionsTable }) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    let body;
    try {
      body = JSON.parse(httpEvent.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }

    const { commandId, level, userName } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!VALID_LEVELS.has(level)) {
      return reply(400, { error: 'level must be interested or confirmed' });
    }

    const eventId = httpEvent.pathParams?.eventId ?? httpEvent.pathParameters?.eventId;
    if (!eventId) return reply(400, { error: 'eventId path parameter required' });

    const eventRow = await readEventRow(client, eventsTable, eventId);
    if (!eventRow) return reply(404, { error: 'event not found' });
    if (eventRow.lifecycleState === 'cancelled') {
      return reply(409, { error: 'event is cancelled' });
    }

    const userId = claims.sub;
    const interactionRow = await readInteractionRow(client, interactionsTable, userId, eventId);
    const previousLevel = interactionRow?.level ?? null;
    const previousSeq = interactionRow?.seq ?? 0;

    // Already at requested level → no-op (idempotent without writing).
    if (previousLevel === level) {
      return reply(200, { eventId, level, noop: true });
    }

    const eventType = level === 'confirmed' ? 'AttendanceConfirmed' : 'InterestExpressed';
    const events = [{
      eventType,
      version: 1,
      seq: previousSeq + 1,
      data: {
        userId,
        eventId,
        userName: userNameFor(claims, userName),
        previousLevel,
      },
    }];

    const result = { eventId, level };
    const out = await runner.runCommand({
      commandId,
      aggregateId: `interaction#${userId}#${eventId}`,
      actorId: `user#${userId}`,
      events,
      result,
    });

    // Auto-plan side effect: if the user just confirmed AND the event has
    // opted into auto-plan AND threshold is reached (counting the organizer
    // as implicit +1), emit EventScheduled on event#<eventId> in a separate
    // command so it gets its own idempotency record.
    //
    // We re-read the event row so the confirmedCount reflects the projection
    // we just wrote. If a concurrent caller already scheduled, the projection's
    // conditional check will reject and we swallow the error.
    if (!out.cached && level === 'confirmed' && eventRow.autoPlanOnThreshold) {
      try {
        const fresh = await readEventRow(client, eventsTable, eventId);
        if (fresh && fresh.lifecycleState === 'proposed' && fresh.autoPlanOnThreshold) {
          const reached = (fresh.confirmedCount ?? 0) + 1 >= (fresh.minimumAttendance ?? Infinity);
          if (reached) {
            await runner.runCommand({
              commandId: `${commandId}-autoplan`,
              aggregateId: `event#${eventId}`,
              actorId: 'system#auto-plan',
              events: [{
                eventType: 'EventScheduled',
                version: 1,
                seq: fresh.seq + 1,
                data: { eventId, scheduledBy: 'auto', autoTriggered: true },
              }],
              result: { eventId, lifecycleState: 'planned', autoTriggered: true },
            }).catch((err) => {
              // Concurrent autoplan or operator schedule won the race —
              // their write succeeded, ours bounces. Either way the event
              // is now planned and the user got their confirmation.
              if (err?.name !== 'TransactionCanceledException') throw err;
            });
          }
        }
      } catch (err) {
        // Auto-plan is best-effort. The user's interaction already succeeded;
        // failing the auto-plan shouldn't undo that.
        console.error('auto-plan side effect failed:', err);
      }
    }

    return reply(out.cached ? 200 : 201, out.result);
  };
}

export function createWithdrawInteractionHandler({ runner, client, eventsTable, interactionsTable }) {
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

    const userId = claims.sub;
    const interactionRow = await readInteractionRow(client, interactionsTable, userId, eventId);
    if (!interactionRow) {
      return reply(200, { eventId, level: null, noop: true });
    }

    const events = [{
      eventType: 'AttendanceWithdrawn',
      version: 1,
      seq: interactionRow.seq + 1,
      data: {
        userId,
        eventId,
        previousLevel: interactionRow.level,
      },
    }];

    const result = { eventId, level: null };
    const out = await runner.runCommand({
      commandId,
      aggregateId: `interaction#${userId}#${eventId}`,
      actorId: `user#${userId}`,
      events,
      result,
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}
