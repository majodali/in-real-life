// Route handlers for the three lifecycle endpoints on an event:
//   PUT /events/:eventId/schedule    — proposed → planned (organizer only)
//   PUT /events/:eventId/cancel      — any non-cancelled → cancelled
//   PUT /events/:eventId/auto-plan   — toggle the safety-net flag
//
// All three read the current event row, gate on the organizer being the
// caller, and emit one event on event#<eventId> with seq = current + 1.

import { GetCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const REASON_MAX = 200;

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

async function parseAndCheckOrganizer(httpEvent, client, eventsTable) {
  const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || !claims.sub) return { error: reply(401, { error: 'unauthorized' }) };

  let body;
  try {
    body = JSON.parse(httpEvent.body || '{}');
  } catch {
    return { error: reply(400, { error: 'invalid json body' }) };
  }

  const { commandId } = body;
  if (!commandId) return { error: reply(400, { error: 'commandId required' }) };

  const eventId = httpEvent.pathParams?.eventId;
  if (!eventId) return { error: reply(400, { error: 'eventId path parameter required' }) };

  const row = await readEventRow(client, eventsTable, eventId);
  if (!row) return { error: reply(404, { error: 'event not found' }) };
  if (row.organizerId !== claims.sub) {
    return { error: reply(403, { error: 'only the organizer can change the event lifecycle' }) };
  }

  return { claims, body, eventId, row, commandId };
}

export function createScheduleEventHandler({ runner, client, eventsTable }) {
  return async function handler(httpEvent) {
    const ctx = await parseAndCheckOrganizer(httpEvent, client, eventsTable);
    if (ctx.error) return ctx.error;
    const { row, commandId, eventId } = ctx;

    if (row.lifecycleState !== 'proposed') {
      return reply(409, { error: `event is ${row.lifecycleState}; can only schedule from proposed` });
    }

    const events = [{
      eventType: 'EventScheduled',
      version: 1,
      seq: row.seq + 1,
      data: {
        eventId,
        scheduledBy: 'organizer',
        autoTriggered: false,
      },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `event#${eventId}`,
      actorId: `user#${ctx.claims.sub}`,
      events,
      result: { eventId, lifecycleState: 'planned' },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

export function createCancelEventHandler({ runner, client, eventsTable }) {
  return async function handler(httpEvent) {
    const ctx = await parseAndCheckOrganizer(httpEvent, client, eventsTable);
    if (ctx.error) return ctx.error;
    const { row, body, commandId, eventId } = ctx;

    if (row.lifecycleState === 'cancelled') {
      return reply(409, { error: 'event is already cancelled' });
    }

    const reason = typeof body.reason === 'string'
      ? body.reason.slice(0, REASON_MAX)
      : undefined;

    const data = { eventId, cancelledBy: 'organizer' };
    if (reason !== undefined) data.reason = reason;

    const events = [{
      eventType: 'EventCancelled',
      version: 1,
      seq: row.seq + 1,
      data,
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `event#${eventId}`,
      actorId: `user#${ctx.claims.sub}`,
      events,
      result: { eventId, lifecycleState: 'cancelled' },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

export function createAutoPlanHandler({ runner, client, eventsTable }) {
  return async function handler(httpEvent) {
    const ctx = await parseAndCheckOrganizer(httpEvent, client, eventsTable);
    if (ctx.error) return ctx.error;
    const { row, body, commandId, eventId } = ctx;

    if (typeof body.autoPlanOnThreshold !== 'boolean') {
      return reply(400, { error: 'autoPlanOnThreshold must be a boolean' });
    }
    if (row.lifecycleState !== 'proposed') {
      return reply(409, { error: `event is ${row.lifecycleState}; auto-plan only applies while proposed` });
    }
    if (row.autoPlanOnThreshold === body.autoPlanOnThreshold) {
      return reply(200, { eventId, autoPlanOnThreshold: body.autoPlanOnThreshold, noop: true });
    }

    const events = [{
      eventType: 'EventAutoPlanSettingChanged',
      version: 1,
      seq: row.seq + 1,
      data: { eventId, autoPlanOnThreshold: body.autoPlanOnThreshold },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `event#${eventId}`,
      actorId: `user#${ctx.claims.sub}`,
      events,
      result: { eventId, autoPlanOnThreshold: body.autoPlanOnThreshold },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}
