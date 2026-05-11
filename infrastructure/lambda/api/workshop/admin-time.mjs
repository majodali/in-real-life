// Route handler for POST /admin/time (workshop-only).
//
// See admin-time.test.mjs for the spec and docs/workshop-mode.md for the
// workshop-time mechanism. The handler computes a new offset based on the
// requested action and emits a WorkshopTimeAdvanced event on the
// system#workshop-time aggregate.

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const AGGREGATE_ID = 'system#workshop-time';
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createAdvanceTimeHandler({ runner, getOffset }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims) return reply(401, { error: 'unauthorized' });
    if (claims['custom:role'] !== 'admin') return reply(403, { error: 'admin only' });

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }

    const { commandId, action } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!['set', 'advance', 'reset'].includes(action)) {
      return reply(400, { error: 'action must be set, advance, or reset' });
    }

    const current = await getOffset();
    const computed = computeOffset(action, body, current.offsetMs);
    if (computed.error) return reply(400, { error: computed.error });

    const events = [{
      eventType: 'WorkshopTimeAdvanced',
      version: 1,
      seq: current.seq + 1,
      data: {
        action,
        requested: computed.requested,
        newOffsetMs: computed.newOffsetMs,
        description: computed.description,
      },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: AGGREGATE_ID,
      actorId: `user#${claims.sub}`,
      events,
      result: { offsetMs: computed.newOffsetMs, description: computed.description },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

function computeOffset(action, body, currentOffsetMs) {
  if (action === 'reset') {
    return {
      requested: null,
      newOffsetMs: 0,
      description: 'real time',
    };
  }

  if (action === 'set') {
    if (!body.datetime) return { error: 'set requires datetime' };
    const target = new Date(body.datetime).getTime();
    if (Number.isNaN(target)) return { error: 'invalid datetime' };
    return {
      requested: { datetime: body.datetime },
      newOffsetMs: target - Date.now(),
      description: `set to ${body.datetime}`,
    };
  }

  // advance
  const hours = body.hours ?? 0;
  const days = body.days ?? 0;
  if (hours === 0 && days === 0) {
    return { error: 'advance requires hours or days' };
  }
  const deltaMs = hours * HOUR_MS + days * DAY_MS;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  return {
    requested: { hours, days },
    newOffsetMs: currentOffsetMs + deltaMs,
    description: `advanced ${parts.join(' ')}`,
  };
}
