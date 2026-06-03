// Route handlers for organizer-driven polls on a proposed event.
// See poll.test.mjs for the spec.

import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const QUESTION_MAX = 200;
const LABEL_MAX = 60;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

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

async function readPollRow(client, pollsTable, eventId, pollId) {
  const out = await client.send(new GetCommand({
    TableName: pollsTable, Key: { eventId, pollId },
  }));
  return out.Item || null;
}

async function readVoteRow(client, votesTable, userId, pollId) {
  const out = await client.send(new GetCommand({
    TableName: votesTable, Key: { userId, pollId },
  }));
  return out.Item || null;
}

function parseBody(httpEvent) {
  try {
    return [null, JSON.parse(httpEvent.body || '{}')];
  } catch {
    return [reply(400, { error: 'invalid json body' }), null];
  }
}

// ─── POST /events/:id/polls ───

export function createMakePollHandler({
  runner, client, makeId, eventsTable, pollsTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });

    if (typeof body.question !== 'string') return reply(400, { error: 'question required' });
    const question = body.question.trim();
    if (!question) return reply(400, { error: 'question must not be blank' });
    if (question.length > QUESTION_MAX) {
      return reply(400, { error: `question must be at most ${QUESTION_MAX} characters` });
    }

    if (!Array.isArray(body.options)) return reply(400, { error: 'options must be an array' });
    const rawOptions = body.options.map((o) => typeof o === 'string' ? o.trim() : '').filter(Boolean);
    if (rawOptions.length < MIN_OPTIONS || rawOptions.length > MAX_OPTIONS) {
      return reply(400, { error: `options must have between ${MIN_OPTIONS} and ${MAX_OPTIONS} entries` });
    }
    for (const label of rawOptions) {
      if (label.length > LABEL_MAX) {
        return reply(400, { error: `option labels must be at most ${LABEL_MAX} characters` });
      }
    }

    const eventId = httpEvent.pathParams?.eventId;
    if (!eventId) return reply(400, { error: 'eventId path parameter required' });

    const eventRow = await readEventRow(client, eventsTable, eventId);
    if (!eventRow) return reply(404, { error: 'event not found' });
    if (eventRow.organizerId !== claims.sub) {
      return reply(403, { error: 'only the organizer can create polls' });
    }
    if (eventRow.lifecycleState !== 'proposed') {
      return reply(409, { error: 'polls only apply to proposed events' });
    }

    const pollId = makeId();
    const options = rawOptions.map((label, i) => ({
      id: `opt-${i + 1}`,
      label,
    }));

    const events = [{
      eventType: 'PollCreated',
      version: 1,
      seq: 1,
      data: {
        pollId,
        eventId,
        byOrganizerId: claims.sub,
        question,
        options,
      },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `poll#${pollId}`,
      actorId: `user#${claims.sub}`,
      events,
      result: { pollId, eventId },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

// ─── GET /events/:id/polls ───

export function createListPollsHandler({
  client, pollsTable, pollVotesTable,
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
        TableName: pollsTable,
        KeyConditionExpression: 'eventId = :e',
        ExpressionAttributeValues: { ':e': eventId },
        ...(last ? { ExclusiveStartKey: last } : {}),
      }));
      items.push(...(out.Items ?? []));
      last = out.LastEvaluatedKey;
    } while (last);

    const voteByPoll = new Map();
    let lastV;
    do {
      const out = await client.send(new QueryCommand({
        TableName: pollVotesTable,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': claims.sub },
        ...(lastV ? { ExclusiveStartKey: lastV } : {}),
      }));
      for (const row of out.Items ?? []) {
        voteByPoll.set(row.pollId, row.optionId);
      }
      lastV = out.LastEvaluatedKey;
    } while (lastV);

    items.sort((a, b) => {
      const av = a.createdAt ?? '';
      const bv = b.createdAt ?? '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    });

    const polls = items.map((p) => ({
      ...p,
      myVote: voteByPoll.get(p.pollId) ?? null,
    }));

    return reply(200, { polls, count: polls.length });
  };
}

// ─── PUT close ───

export function createClosePollHandler({
  runner, client, eventsTable, pollsTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });

    const eventId = httpEvent.pathParams?.eventId;
    const pollId = httpEvent.pathParams?.pollId;
    if (!eventId || !pollId) {
      return reply(400, { error: 'eventId and pollId path parameters required' });
    }

    const eventRow = await readEventRow(client, eventsTable, eventId);
    if (!eventRow) return reply(404, { error: 'event not found' });
    if (eventRow.organizerId !== claims.sub) {
      return reply(403, { error: 'only the organizer can close polls' });
    }

    const pollRow = await readPollRow(client, pollsTable, eventId, pollId);
    if (!pollRow) return reply(404, { error: 'poll not found' });
    if (pollRow.status !== 'open') {
      return reply(409, { error: `poll is ${pollRow.status}` });
    }

    let outcome = null;
    if (body.outcome != null) {
      const valid = pollRow.options?.some((o) => o.id === body.outcome);
      if (!valid) return reply(400, { error: 'outcome must be one of the poll options' });
      outcome = body.outcome;
    }

    const events = [{
      eventType: 'PollClosed',
      version: 1,
      seq: pollRow.seq + 1,
      data: { pollId, eventId, outcome },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `poll#${pollId}`,
      actorId: `user#${claims.sub}`,
      events,
      result: { pollId, outcome },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

// ─── PUT vote ───

export function createCastPollVoteHandler({
  runner, client, eventsTable, pollsTable, pollVotesTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId, optionId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!optionId) return reply(400, { error: 'optionId required' });

    const eventId = httpEvent.pathParams?.eventId;
    const pollId = httpEvent.pathParams?.pollId;
    if (!eventId || !pollId) {
      return reply(400, { error: 'eventId and pollId path parameters required' });
    }

    const eventRow = await readEventRow(client, eventsTable, eventId);
    if (!eventRow) return reply(404, { error: 'event not found' });

    const pollRow = await readPollRow(client, pollsTable, eventId, pollId);
    if (!pollRow) return reply(404, { error: 'poll not found' });
    if (pollRow.status !== 'open') {
      return reply(409, { error: `poll is ${pollRow.status}` });
    }
    if (!pollRow.options?.some((o) => o.id === optionId)) {
      return reply(400, { error: 'optionId must be one of the poll options' });
    }

    const userId = claims.sub;
    const voteRow = await readVoteRow(client, pollVotesTable, userId, pollId);
    const previousOptionId = voteRow?.optionId ?? null;
    const previousSeq = voteRow?.seq ?? 0;

    if (previousOptionId === optionId) {
      return reply(200, { pollId, optionId, noop: true });
    }

    const userName = claims.email ? claims.email.split('@')[0] : 'someone';
    const events = [{
      eventType: 'PollVoteCast',
      version: 1,
      seq: previousSeq + 1,
      data: { pollId, eventId, userId, userName, optionId, previousOptionId },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `poll-vote#${pollId}#${userId}`,
      actorId: `user#${userId}`,
      events,
      result: { pollId, optionId },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}

// ─── DELETE vote ───

export function createRetractPollVoteHandler({
  runner, client, pollVotesTable,
}) {
  return async function handler(httpEvent) {
    const claims = httpEvent?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    const [err, body] = parseBody(httpEvent);
    if (err) return err;

    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });

    const eventId = httpEvent.pathParams?.eventId;
    const pollId = httpEvent.pathParams?.pollId;
    if (!eventId || !pollId) {
      return reply(400, { error: 'eventId and pollId path parameters required' });
    }

    const userId = claims.sub;
    const voteRow = await readVoteRow(client, pollVotesTable, userId, pollId);
    if (!voteRow) {
      return reply(200, { pollId, optionId: null, noop: true });
    }

    const events = [{
      eventType: 'PollVoteRetracted',
      version: 1,
      seq: voteRow.seq + 1,
      data: { pollId, eventId, userId, previousOptionId: voteRow.optionId },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId: `poll-vote#${pollId}#${userId}`,
      actorId: `user#${userId}`,
      events,
      result: { pollId, optionId: null },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}
