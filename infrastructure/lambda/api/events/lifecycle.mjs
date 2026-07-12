// Route handlers for the three lifecycle endpoints on an event:
//   PUT /events/:eventId/schedule    — proposed → planned (organizer only)
//   PUT /events/:eventId/cancel      — any non-cancelled → cancelled
//   PUT /events/:eventId/auto-plan   — toggle the safety-net flag
//
// All three read the current event row, gate on the organizer being the
// caller, and emit one event on event#<eventId> with seq = current + 1.

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { computeEffectiveState, CHANGE_OPEN_STATES, simulatedNowIso } from '../lib/lifecycle-state.mjs';
import { validateCost, validateMaxAttendance } from './event-fields.mjs';

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
    // An idea can't be scheduled — "planned" is a promise of a concrete
    // when-and-where. Firm it up (edit, or adopt a suggestion/poll) first.
    if (!(row.startTime && row.endTime && row.location)) {
      return reply(409, { error: 'still an idea — set a time and place before confirming it’s happening' });
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

export function createCancelEventHandler({ runner, client, eventsTable, getOffset }) {
  return async function handler(httpEvent) {
    const ctx = await parseAndCheckOrganizer(httpEvent, client, eventsTable);
    if (ctx.error) return ctx.error;
    const { row, body, commandId, eventId } = ctx;

    // Cancelling is the organizer's escape hatch right up until the event is
    // over — including while it's in-progress (calling it off partway). Once
    // it's already over (or cancelled) there's nothing left to cancel.
    const offsetMs = getOffset ? (await getOffset()).offsetMs : 0;
    const effective = computeEffectiveState(row, simulatedNowIso(offsetMs));
    if (effective === 'cancelled') {
      return reply(409, { error: 'event is already cancelled' });
    }
    if (effective === 'over') {
      return reply(409, { error: 'event is already over' });
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

    // RSVP disposition: interaction rows are never rewritten — the
    // commitment historically existed, and "live commitment" is derived
    // (confirmed AND the event not cancelled/over) everywhere it matters.
    // The result reports who's affected so the organizer sees the impact;
    // notifying them is the Group 7 notifications slice.
    const out = await runner.runCommand({
      commandId,
      aggregateId: `event#${eventId}`,
      actorId: `user#${ctx.claims.sub}`,
      events,
      result: {
        eventId,
        lifecycleState: 'cancelled',
        affected: {
          interested: row.interestCount ?? 0,
          confirmed: row.confirmedCount ?? 0,
        },
      },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

// Editable fields on an event. Sparse update — only the keys the
// organizer touches make it into EventEdited.data.fields. All optional.
// cost and maxAttendance accept null to clear ("it's free now" / "no cap").
const EDITABLE_FIELDS = ['title', 'description', 'startTime', 'endTime', 'location', 'timesApproximate', 'cost', 'maxAttendance', 'meetingSpot'];

export function createEditEventHandler({ runner, client, eventsTable, getOffset }) {
  return async function handler(httpEvent) {
    const ctx = await parseAndCheckOrganizer(httpEvent, client, eventsTable);
    if (ctx.error) return ctx.error;
    const { row, body, commandId, eventId } = ctx;

    // Edits close once the event leaves the open phases — you can't rewrite
    // an event that's already in-progress, over, or cancelled.
    const offsetMs = getOffset ? (await getOffset()).offsetMs : 0;
    const effective = computeEffectiveState(row, simulatedNowIso(offsetMs));
    if (!CHANGE_OPEN_STATES.has(effective)) {
      return reply(409, { error: `event is ${effective}; can no longer be edited` });
    }

    const fields = {};
    for (const key of EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const v = body[key];
        if (typeof v === 'string') fields[key] = v.trim();
        else fields[key] = v;
      }
    }
    if (Object.keys(fields).length === 0) {
      return reply(400, { error: 'at least one editable field required (title, description, startTime, endTime, location, timesApproximate)' });
    }

    if ('timesApproximate' in fields && typeof fields.timesApproximate !== 'boolean') {
      return reply(400, { error: 'timesApproximate must be a boolean' });
    }

    // Per-field validation.
    if ('title' in fields) {
      if (typeof fields.title !== 'string' || fields.title.length === 0) {
        return reply(400, { error: 'title must not be blank' });
      }
    }
    if ('location' in fields) {
      if (typeof fields.location !== 'string' || fields.location.length === 0) {
        return reply(400, { error: 'location must not be blank' });
      }
    }
    if ('startTime' in fields) {
      if (Number.isNaN(new Date(fields.startTime).getTime())) {
        return reply(400, { error: 'startTime is not a parseable ISO datetime' });
      }
    }
    if ('endTime' in fields && fields.endTime != null) {
      if (Number.isNaN(new Date(fields.endTime).getTime())) {
        return reply(400, { error: 'endTime is not a parseable ISO datetime' });
      }
      const effectiveStart = 'startTime' in fields ? fields.startTime : row.startTime;
      if (!effectiveStart) {
        return reply(400, { error: 'set startTime along with endTime' });
      }
      if (new Date(fields.endTime) <= new Date(effectiveStart)) {
        return reply(400, { error: 'endTime must be after startTime' });
      }
    }
    // The reverse pairing: giving an idea its first startTime requires the
    // endTime too, so a proposal never sits half-timed.
    if ('startTime' in fields && !('endTime' in fields) && !row.endTime) {
      return reply(400, { error: 'set endTime along with startTime' });
    }
    if ('cost' in fields && fields.cost !== null) {
      const checked = validateCost(fields.cost);
      if (checked.error) return reply(400, { error: checked.error });
      fields.cost = checked.value;
    }
    if ('meetingSpot' in fields && fields.meetingSpot !== null) {
      if (typeof fields.meetingSpot !== 'string') {
        return reply(400, { error: 'meetingSpot must be a string' });
      }
      fields.meetingSpot = fields.meetingSpot.trim().slice(0, 200) || null;
    }
    if ('maxAttendance' in fields && fields.maxAttendance !== null) {
      const checked = validateMaxAttendance(fields.maxAttendance, row.minimumAttendance ?? 3);
      if (checked.error) return reply(400, { error: checked.error });
      // Lowering the cap below current confirmations is allowed — nobody
      // is evicted (interactions are never rewritten); the event just
      // reads as full until spots free up.
    }

    const events = [{
      eventType: 'EventEdited',
      version: 1,
      seq: row.seq + 1,
      data: {
        eventId,
        editedBy: ctx.claims.sub,
        fields,
      },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `event#${eventId}`,
      actorId: `user#${ctx.claims.sub}`,
      events,
      result: { eventId, fields },
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
