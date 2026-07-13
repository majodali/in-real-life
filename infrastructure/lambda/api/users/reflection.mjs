// Reflection & coaching (docs/reflection-and-coaching.md).
//
//   POST /me/reflection/turn — one conversational turn (ephemeral, no
//     events, like the interview loop). We-voice text with a small
//     control envelope; coaching is conditional and frequency-capped
//     against the user row's offeredPerspectives.
//   POST /me/reflection — the close: one extraction call (reusing the
//     debrief extraction, task reflection-extraction), then
//     ReflectionRecorded on the user aggregate — transcript + observed
//     deltas + the coaching cap record + member-consented routed
//     feedback (capture now; organiser delivery channel is future work).
//
// Entry requires a debrief on the event (D44 — the door opens from the
// debrief). A conduct-flagged debrief keeps the space open but its close
// records the transcript only — no extraction, no deltas (quarantine
// coherence, open-risks #11): a bad experience never becomes preference
// signal, even via reflection.

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  REFLECTION_TURN_SYSTEM,
  REFLECTION_TURN_SCHEMA,
  FALLBACK_CLOSE,
  PERSPECTIVES,
  PERSPECTIVE_LINES,
} from './reflection-prompt.mjs';
import { DEBRIEF_EXTRACTION_SYSTEM, DEBRIEF_EXTRACTION_SCHEMA } from '../events/debrief-schema.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const MAX_TURN_TOKENS = 1024;
const SHARINGS = new Set(['named', 'anonymous']);

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function authClaims(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || !claims.sub) return { error: reply(401, { error: 'unauthorized' }) };
  if (claims.email_verified !== 'true' && claims.email_verified !== true) {
    return { error: reply(403, { error: 'email not verified' }) };
  }
  return { claims };
}

function validTranscript(transcript) {
  return Array.isArray(transcript)
    && transcript.every((t) => t && typeof t.role === 'string' && typeof t.text === 'string');
}

async function readRow(client, table, key) {
  const out = await client.send(new GetCommand({ TableName: table, Key: key }));
  return out.Item || null;
}

// Reflection opens from a debrief: the member must have debriefed this
// event. Returns the debrief summary from the interaction row.
async function debriefFor(client, interactionsTable, userId, eventId) {
  const row = await readRow(client, interactionsTable, { userId, eventId });
  return row?.debrief ?? null;
}

function offeredSetOf(userRow) {
  return [...new Set(userRow.offeredPerspectives ?? [])];
}

function contextMessage({ eventRow, debrief, offered, transcript }) {
  const available = PERSPECTIVES.filter((p) => !offered.includes(p));
  const lines = [
    `EVENT: ${eventRow?.title ?? 'a recent event'}`,
    `THEIR DEBRIEF: attended=${debrief.attended !== false}, worth another go=${debrief.again ?? '-'}`,
    `ALREADY OFFERED (never repeat): ${offered.length ? offered.join(', ') : 'none'}`,
    'AVAILABLE PERSPECTIVES:',
    ...available.map((p) => `  ${p}: ${PERSPECTIVE_LINES[p]}`),
    '',
    'TRANSCRIPT SO FAR:',
    transcript.length
      ? transcript.map((t) => `${t.role === 'member' ? 'member' : 'us'}: ${t.text}`).join('\n')
      : '(none — open the space with one gentle question)',
    '',
    'Produce the next turn.',
  ];
  return lines.join('\n');
}

function validTurn(turn, offered) {
  if (!turn || typeof turn.message !== 'string' || !turn.message.trim()) return false;
  if (typeof turn.done !== 'boolean') return false;
  if (turn.perspectiveOffered !== 'none' && !PERSPECTIVES.includes(turn.perspectiveOffered)) return false;
  // The frequency cap is a hard promise: a repeated perspective is
  // malformed output, not a judgment call.
  if (turn.perspectiveOffered !== 'none' && offered.includes(turn.perspectiveOffered)) return false;
  return true;
}

export function createReflectionTurnHandler({
  client, usersTable, eventsTable, interactionsTable, llm,
}) {
  return async function handler(event) {
    const { claims, error } = authClaims(event);
    if (error) return error;

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }
    const { eventId, transcript = [] } = body;
    if (!eventId) return reply(400, { error: 'eventId required' });
    if (!validTranscript(transcript)) {
      return reply(400, { error: 'transcript entries need role and text' });
    }

    const userId = claims.sub;
    const userRow = await readRow(client, usersTable, { userId });
    if (!userRow) return reply(404, { error: 'user not registered' });

    const debrief = await debriefFor(client, interactionsTable, userId, eventId);
    if (!debrief) {
      return reply(409, { error: 'reflection opens from a debrief — debrief this event first' });
    }

    const eventRow = await readRow(client, eventsTable, { eventId });
    const offered = offeredSetOf(userRow);
    const request = {
      task: 'reflection-turn',
      system: REFLECTION_TURN_SYSTEM,
      messages: [{
        role: 'user',
        content: contextMessage({ eventRow, debrief, offered, transcript }),
      }],
      schema: REFLECTION_TURN_SCHEMA,
      maxTokens: MAX_TURN_TOKENS,
      effort: 'low',
    };

    let turn = await llm.complete(request);
    if (!validTurn(turn, offered)) {
      turn = await llm.complete(request);
    }
    if (!validTurn(turn, offered)) {
      turn = FALLBACK_CLOSE;
    }
    return reply(200, turn);
  };
}

export function createCompleteReflectionHandler({
  runner, client, usersTable, interactionsTable, llm,
}) {
  return async function handler(event) {
    const { claims, error } = authClaims(event);
    if (error) return error;

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }
    const { commandId, eventId, transcript } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!eventId) return reply(400, { error: 'eventId required' });
    if (!validTranscript(transcript) || transcript.length === 0) {
      return reply(400, { error: 'transcript required' });
    }
    let perspectivesOffered = [];
    if (body.perspectivesOffered !== undefined) {
      if (!Array.isArray(body.perspectivesOffered)
        || body.perspectivesOffered.some((p) => !PERSPECTIVES.includes(p))) {
        return reply(400, { error: 'perspectivesOffered must be an array of known perspective keys' });
      }
      perspectivesOffered = [...new Set(body.perspectivesOffered)];
    }
    let processFeedback;
    if (body.processFeedback !== undefined) {
      if (!Array.isArray(body.processFeedback)
        || body.processFeedback.some((f) => typeof f !== 'string' || !f.trim())) {
        return reply(400, { error: 'processFeedback must be an array of strings' });
      }
      processFeedback = body.processFeedback.map((f) => f.trim().slice(0, 500));
    }
    let organizerFeedback;
    if (body.organizerFeedback !== undefined) {
      const of = body.organizerFeedback;
      if (typeof of !== 'object' || of === null
        || typeof of.text !== 'string' || !of.text.trim()
        || !SHARINGS.has(of.sharing)) {
        return reply(400, { error: 'organizerFeedback needs text and sharing (named | anonymous)' });
      }
      // Explicit, in-the-moment consent is the payload itself: the member
      // chose to route this, and chose the attribution.
      organizerFeedback = { text: of.text.trim().slice(0, 1000), sharing: of.sharing };
    }

    const userId = claims.sub;
    const userRow = await readRow(client, usersTable, { userId });
    if (!userRow) return reply(404, { error: 'user not registered' });

    const debrief = await debriefFor(client, interactionsTable, userId, eventId);
    if (!debrief) {
      return reply(409, { error: 'reflection opens from a debrief — debrief this event first' });
    }

    const data = { userId, eventId, transcript };
    if (perspectivesOffered.length) data.perspectivesOffered = perspectivesOffered;
    if (processFeedback?.length) data.processFeedback = processFeedback;
    if (organizerFeedback) data.organizerFeedback = organizerFeedback;

    if (debrief.conductConcern) {
      // Quarantine coherence: the space stays open, the narrative is
      // kept, but nothing from this event becomes preference signal.
      data.suppressed = true;
    } else if (transcript.some((t) => t.role === 'member' && t.text.trim())) {
      data.deltas = await llm.complete({
        task: 'reflection-extraction',
        system: DEBRIEF_EXTRACTION_SYSTEM,
        messages: [{
          role: 'user',
          content: transcript.map((t) => `${t.role === 'member' ? 'member' : 'us'}: ${t.text}`).join('\n'),
        }],
        schema: DEBRIEF_EXTRACTION_SCHEMA,
        maxTokens: 2048,
      });
    }

    let out;
    try {
      out = await runner.runCommand({
        commandId,
        aggregateId: `user#${userId}`,
        actorId: `user#${userId}`,
        events: [{
          eventType: 'ReflectionRecorded',
          version: 1,
          seq: userRow.seq + 1,
          data,
        }],
        result: { eventId, status: 'reflection-recorded' },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'concurrent update, retry' });
      }
      throw err;
    }

    return reply(out.cached ? 200 : 201, out.result);
  };
}
