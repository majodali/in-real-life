// Route handlers for the suggestion endpoints on an event.
// Suggestions are open through proposed AND planned (closed for cancelled,
// hidden by the frontend once endTime passes — "over" is computed).
//
// See suggestion.test.mjs for the spec and docs/event-sourcing.md for
// the aggregate model — suggestion#<suggestionId> for the suggestion's
// lifecycle, suggestion-vote#<suggestionId>#<userId> per individual vote.

import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const TEXT_MAX = 200;
const RESPONSE_MAX = 200;
const VALID_TAGS = new Set(['time', 'place']);
const VALID_VOTES = new Set(['support', 'object']);
// Suggestions are open through the malleable AND committed phases.
// Once the event is cancelled or its time window is over the surface
// closes — but "over" is computed at read time, so we only block
// cancelled here. The frontend hides the section past endTime.
const SUGGESTION_OPEN_STATES = new Set(['proposed', 'planned']);

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

async function readSuggestionRow(client, suggestionsTable, eventId, suggestionId) {
  const out = await client.send(new GetCommand({
    TableName: suggestionsTable,
    Key: { eventId, suggestionId },
  }));
  return out.Item || null;
}

async function readVoteRow(client, votesTable, userId, suggestionId) {
  const out = await client.send(new GetCommand({
    TableName: votesTable,
    Key: { userId, suggestionId },
  }));
  return out.Item || null;
}

function userNameFor(claims) {
  if (claims.email) return claims.email.split('@')[0];
  return 'someone';
}

function parseBody(httpEvent) {
  try {
    return [null, JSON.parse(httpEvent.body || '{}')];
  } catch {
    return [reply(400, { error: 'invalid json body' }), null];
  }
}

// ─── POST /events/:id/suggestions ───

export function createMakeSuggestionHandler({
  runner, client, eventsTable, suggestionsTable, makeId,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (typeof body.text !== 'string') return reply(400, { error: 'text required' });

    const text = body.text.trim();
    if (!text) return reply(400, { error: 'text must not be blank' });
    if (text.length > TEXT_MAX) return reply(400, { error: `text must be at most ${TEXT_MAX} characters` });

    const tags = Array.isArray(body.tags) ? body.tags : [];
    for (const t of tags) {
      if (!VALID_TAGS.has(t)) return reply(400, { error: `unknown tag: ${t}` });
    }

    const eventId = httpEvent.pathParams?.eventId;
    if (!eventId) return reply(400, { error: 'eventId path parameter required' });

    const eventRow = await readEventRow(client, eventsTable, eventId);
    if (!eventRow) return reply(404, { error: 'event not found' });
    if (!SUGGESTION_OPEN_STATES.has(eventRow.lifecycleState)) {
      return reply(409, { error: `suggestions are closed (event is ${eventRow.lifecycleState})` });
    }

    const suggestionId = makeId();
    const events = [{
      eventType: 'SuggestionMade',
      version: 1,
      seq: 1,
      data: {
        suggestionId,
        eventId,
        byUserId: claims.sub,
        byUserName: userNameFor(claims),
        text,
        tags,
      },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `suggestion#${suggestionId}`,
      actorId: `user#${claims.sub}`,
      events,
      result: { suggestionId, eventId },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

// ─── GET /events/:id/suggestions ───

export function createListSuggestionsHandler({
  client, suggestionsTable, suggestionVotesTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const eventId = httpEvent.pathParams?.eventId;
    if (!eventId) return reply(400, { error: 'eventId path parameter required' });

    const items = [];
    let last;
    do {
      const out = await client.send(new QueryCommand({
        TableName: suggestionsTable,
        KeyConditionExpression: 'eventId = :e',
        ExpressionAttributeValues: { ':e': eventId },
        ...(last ? { ExclusiveStartKey: last } : {}),
      }));
      items.push(...(out.Items ?? []));
      last = out.LastEvaluatedKey;
    } while (last);

    // Caller's votes for this event in one query — same pattern as myLevel
    // on GET /events.
    const voteBySug = new Map();
    let lastV;
    do {
      const out = await client.send(new QueryCommand({
        TableName: suggestionVotesTable,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': claims.sub },
        ...(lastV ? { ExclusiveStartKey: lastV } : {}),
      }));
      for (const row of out.Items ?? []) {
        voteBySug.set(row.suggestionId, row.vote);
      }
      lastV = out.LastEvaluatedKey;
    } while (lastV);

    items.sort((a, b) => {
      const av = a.createdAt ?? '';
      const bv = b.createdAt ?? '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    });

    const suggestions = items.map((s) => ({
      ...s,
      myVote: voteBySug.get(s.suggestionId) ?? null,
    }));

    return reply(200, { suggestions, count: suggestions.length });
  };
}

// ─── PUT status ───

export function createSetSuggestionStatusHandler({
  runner, client, eventsTable, suggestionsTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId, status } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });

    const STATUS_TO_EVENT = {
      withdrawn: 'SuggestionWithdrawn',
      adopted: 'SuggestionAdopted',
      rejected: 'SuggestionRejected',
    };
    if (!STATUS_TO_EVENT[status]) {
      return reply(400, { error: 'status must be withdrawn, adopted, or rejected' });
    }

    const eventId = httpEvent.pathParams?.eventId;
    const suggestionId = httpEvent.pathParams?.suggestionId;
    if (!eventId || !suggestionId) {
      return reply(400, { error: 'eventId and suggestionId path parameters required' });
    }

    const eventRow = await readEventRow(client, eventsTable, eventId);
    if (!eventRow) return reply(404, { error: 'event not found' });
    if (!SUGGESTION_OPEN_STATES.has(eventRow.lifecycleState)) {
      return reply(409, { error: `suggestions are closed (event is ${eventRow.lifecycleState})` });
    }

    const suggestionRow = await readSuggestionRow(client, suggestionsTable, eventId, suggestionId);
    if (!suggestionRow) return reply(404, { error: 'suggestion not found' });
    if (suggestionRow.status !== 'open') {
      return reply(409, { error: `suggestion is ${suggestionRow.status}` });
    }

    if (status === 'withdrawn' && suggestionRow.byUserId !== claims.sub) {
      return reply(403, { error: 'only the author can withdraw a suggestion' });
    }
    if ((status === 'adopted' || status === 'rejected') && eventRow.organizerId !== claims.sub) {
      return reply(403, { error: 'only the organizer can adopt or reject' });
    }

    const data = { suggestionId, eventId };
    if (status === 'rejected' && typeof body.reason === 'string') {
      data.reason = body.reason.slice(0, RESPONSE_MAX);
    }

    const events = [{
      eventType: STATUS_TO_EVENT[status],
      version: 1,
      seq: suggestionRow.seq + 1,
      data,
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `suggestion#${suggestionId}`,
      actorId: `user#${claims.sub}`,
      events,
      result: { suggestionId, status },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

// ─── PUT response ───

export function createSetSuggestionResponseHandler({
  runner, client, eventsTable, suggestionsTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (typeof body.response !== 'string') {
      return reply(400, { error: 'response must be a string' });
    }

    const eventId = httpEvent.pathParams?.eventId;
    const suggestionId = httpEvent.pathParams?.suggestionId;
    if (!eventId || !suggestionId) {
      return reply(400, { error: 'eventId and suggestionId path parameters required' });
    }

    const eventRow = await readEventRow(client, eventsTable, eventId);
    if (!eventRow) return reply(404, { error: 'event not found' });
    if (eventRow.organizerId !== claims.sub) {
      return reply(403, { error: 'only the organizer can respond' });
    }

    const suggestionRow = await readSuggestionRow(client, suggestionsTable, eventId, suggestionId);
    if (!suggestionRow) return reply(404, { error: 'suggestion not found' });

    const response = body.response.slice(0, RESPONSE_MAX);
    const events = [{
      eventType: 'SuggestionResponded',
      version: 1,
      seq: suggestionRow.seq + 1,
      data: { suggestionId, eventId, response },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `suggestion#${suggestionId}`,
      actorId: `user#${claims.sub}`,
      events,
      result: { suggestionId, response },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

// ─── PUT vote ───

export function createVoteSuggestionHandler({
  runner, client, eventsTable, suggestionsTable, suggestionVotesTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId, vote } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!VALID_VOTES.has(vote)) {
      return reply(400, { error: 'vote must be support or object' });
    }

    const eventId = httpEvent.pathParams?.eventId;
    const suggestionId = httpEvent.pathParams?.suggestionId;
    if (!eventId || !suggestionId) {
      return reply(400, { error: 'eventId and suggestionId path parameters required' });
    }

    const eventRow = await readEventRow(client, eventsTable, eventId);
    if (!eventRow) return reply(404, { error: 'event not found' });
    if (!SUGGESTION_OPEN_STATES.has(eventRow.lifecycleState)) {
      return reply(409, { error: 'suggestions only apply to proposed events' });
    }

    const suggestionRow = await readSuggestionRow(client, suggestionsTable, eventId, suggestionId);
    if (!suggestionRow) return reply(404, { error: 'suggestion not found' });
    if (suggestionRow.status !== 'open') {
      return reply(409, { error: `suggestion is ${suggestionRow.status}` });
    }

    const userId = claims.sub;
    const voteRow = await readVoteRow(client, suggestionVotesTable, userId, suggestionId);
    const previous = voteRow?.vote ?? null;
    const previousSeq = voteRow?.seq ?? 0;

    if (previous === vote) {
      return reply(200, { suggestionId, vote, noop: true });
    }

    const events = [{
      eventType: 'SuggestionVoteExpressed',
      version: 1,
      seq: previousSeq + 1,
      data: {
        suggestionId,
        eventId,
        userId,
        userName: userNameFor(claims),
        vote,
        previous,
      },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `suggestion-vote#${suggestionId}#${userId}`,
      actorId: `user#${userId}`,
      events,
      result: { suggestionId, vote },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

// ─── DELETE vote ───

export function createRetractSuggestionVoteHandler({
  runner, client, suggestionVotesTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });

    const eventId = httpEvent.pathParams?.eventId;
    const suggestionId = httpEvent.pathParams?.suggestionId;
    if (!eventId || !suggestionId) {
      return reply(400, { error: 'eventId and suggestionId path parameters required' });
    }

    const userId = claims.sub;
    const voteRow = await readVoteRow(client, suggestionVotesTable, userId, suggestionId);
    if (!voteRow) {
      return reply(200, { suggestionId, vote: null, noop: true });
    }

    const events = [{
      eventType: 'SuggestionVoteRetracted',
      version: 1,
      seq: voteRow.seq + 1,
      data: {
        suggestionId,
        eventId,
        userId,
        previous: voteRow.vote,
      },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `suggestion-vote#${suggestionId}#${userId}`,
      actorId: `user#${userId}`,
      events,
      result: { suggestionId, vote: null },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}
