// Route handler for POST /events.
//
// See propose.test.mjs for the spec. Validates the request body, mints a
// fresh eventId, composes an EventProposed event, and runs the command.
// organizerName is the user's profile snapshot at proposal time —
// renames to the user's profile after this don't update the event card.

import { validateCost, validateMaxAttendance } from './event-fields.mjs';
import { extractEventShape } from './event-shape.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const VALID_SOURCES = new Set(['community', 'external', 'platform']);

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createProposeEventHandler({ runner, makeEventId, llm }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }

    const { commandId, title, description, startTime, endTime, location,
            organizerName } = body;
    const source = body.source ?? 'community';
    // Minimum attendance includes the organizer. Default 3 — the smallest
    // group that feels like a community gathering rather than a duo.
    const minimumAttendance = body.minimumAttendance ?? 3;

    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!title) return reply(400, { error: 'title required' });
    // Time and place are optional at proposal: a proposal missing any of
    // startTime / endTime / location is an *idea* (derived stage, see
    // lib/lifecycle-state.mjs) — open to interest, suggestions, and polls,
    // but not confirmable or schedulable until it firms up.
    if (!VALID_SOURCES.has(source)) {
      return reply(400, { error: 'source must be community, external, or platform' });
    }
    // External events (D53) are real events IRL didn't create: born
    // planned, so the full time/place trio is required up front, and
    // threshold semantics don't apply — the event happens regardless.
    if (source === 'external') {
      if (!startTime || !endTime || !location) {
        return reply(400, { error: 'external events need startTime, endTime, and location — if you can’t pin it down yet, float it as a community idea instead' });
      }
      if (body.minimumAttendance !== undefined || body.autoPlanOnThreshold !== undefined) {
        return reply(400, { error: 'minimumAttendance/autoPlanOnThreshold do not apply to external events' });
      }
    }
    if (startTime !== undefined && Number.isNaN(new Date(startTime).getTime())) {
      return reply(400, { error: 'startTime is not a parseable ISO datetime' });
    }
    // Times come as a pair: endTime is what lets the event reach "over"
    // (and become debriefable), so a start without an end stays an idea —
    // reject it early instead of leaving a half-timed proposal around.
    // Organizers unsure of exact times flag timesApproximate instead.
    if (startTime !== undefined && endTime === undefined) {
      return reply(400, { error: 'endTime required when startTime is set (mark timesApproximate if unsure)' });
    }
    if (endTime !== undefined && startTime === undefined) {
      return reply(400, { error: 'startTime required when endTime is set' });
    }
    if (endTime !== undefined) {
      if (Number.isNaN(new Date(endTime).getTime())) {
        return reply(400, { error: 'endTime is not a parseable ISO datetime' });
      }
      if (new Date(endTime) <= new Date(startTime)) {
        return reply(400, { error: 'endTime must be after startTime' });
      }
    }
    if (body.timesApproximate !== undefined && typeof body.timesApproximate !== 'boolean') {
      return reply(400, { error: 'timesApproximate must be a boolean' });
    }
    if (!Number.isInteger(minimumAttendance) || minimumAttendance < 3) {
      return reply(400, { error: 'minimumAttendance must be an integer >= 3' });
    }
    let cost;
    if (body.cost !== undefined) {
      const checked = validateCost(body.cost);
      if (checked.error) return reply(400, { error: checked.error });
      cost = checked.value;
    }
    let maxAttendance;
    if (body.maxAttendance !== undefined) {
      const checked = validateMaxAttendance(body.maxAttendance, minimumAttendance);
      if (checked.error) return reply(400, { error: checked.error });
      maxAttendance = checked.value;
    }
    let meetingSpot;
    if (body.meetingSpot !== undefined) {
      if (typeof body.meetingSpot !== 'string') {
        return reply(400, { error: 'meetingSpot must be a string' });
      }
      meetingSpot = body.meetingSpot.trim().slice(0, 200);
      if (!meetingSpot) meetingSpot = undefined;
    }

    // Event shape (D56, docs/event-shape-prompt.md): one extraction call
    // gives the listing a machine-readable shape for matching. Failure is
    // never propose failure — a shapeless event ranks via text fallback.
    const shape = llm
      ? await extractEventShape({ llm, title, description })
      : undefined;

    const eventId = makeEventId();
    const aggregateId = `event#${eventId}`;

    const data = {
      eventId,
      source,
      title,
      organizerId: claims.sub,
      organizerName: organizerName || (claims.email ? claims.email.split('@')[0] : 'someone'),
    };
    if (startTime !== undefined) data.startTime = startTime;
    if (endTime !== undefined) data.endTime = endTime;
    if (location !== undefined) data.location = location;
    if (description !== undefined) data.description = description;
    if (cost !== undefined) data.cost = cost;
    if (maxAttendance !== undefined) data.maxAttendance = maxAttendance;
    if (meetingSpot !== undefined) data.meetingSpot = meetingSpot;
    if (shape !== undefined) data.shape = shape;
    data.timesApproximate = body.timesApproximate === true;
    if (source !== 'external') {
      data.minimumAttendance = minimumAttendance;
      data.autoPlanOnThreshold = body.autoPlanOnThreshold === true;
    }

    const events = [{
      eventType: 'EventProposed',
      version: 1,
      seq: 1,
      data,
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId,
      actorId: `user#${claims.sub}`,
      events,
      result: { eventId },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}
