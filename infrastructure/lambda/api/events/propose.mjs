// Route handler for POST /events.
//
// See propose.test.mjs for the spec. Validates the request body, mints a
// fresh eventId, composes an EventProposed event, and runs the command.
// organizerName is the user's profile snapshot at proposal time —
// renames to the user's profile after this don't update the event card.

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const VALID_SOURCES = new Set(['community', 'external', 'platform']);

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createProposeEventHandler({ runner, makeEventId }) {
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
    if (!startTime) return reply(400, { error: 'startTime required' });
    // endTime is required so the event can reach the "over" state (and thus
    // become debriefable). When the organizer is unsure of exact times they
    // flag timesApproximate; the lifecycle still keys off these timestamps.
    if (!endTime) return reply(400, { error: 'endTime required' });
    if (!location) return reply(400, { error: 'location required' });
    if (!VALID_SOURCES.has(source)) {
      return reply(400, { error: 'source must be community, external, or platform' });
    }
    if (Number.isNaN(new Date(startTime).getTime())) {
      return reply(400, { error: 'startTime is not a parseable ISO datetime' });
    }
    if (Number.isNaN(new Date(endTime).getTime())) {
      return reply(400, { error: 'endTime is not a parseable ISO datetime' });
    }
    if (new Date(endTime) <= new Date(startTime)) {
      return reply(400, { error: 'endTime must be after startTime' });
    }
    if (body.timesApproximate !== undefined && typeof body.timesApproximate !== 'boolean') {
      return reply(400, { error: 'timesApproximate must be a boolean' });
    }
    if (!Number.isInteger(minimumAttendance) || minimumAttendance < 3) {
      return reply(400, { error: 'minimumAttendance must be an integer >= 3' });
    }

    const eventId = makeEventId();
    const aggregateId = `event#${eventId}`;

    const data = {
      eventId,
      source,
      title,
      startTime,
      endTime,
      location,
      organizerId: claims.sub,
      organizerName: organizerName || (claims.email ? claims.email.split('@')[0] : 'someone'),
    };
    if (description !== undefined) data.description = description;
    data.timesApproximate = body.timesApproximate === true;
    data.minimumAttendance = minimumAttendance;
    data.autoPlanOnThreshold = body.autoPlanOnThreshold === true;

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
