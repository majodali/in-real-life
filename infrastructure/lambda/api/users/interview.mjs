// Route handler for POST /me/interview/turn.
//
// The per-turn interviewer loop (docs/onboarding-interview.md, D3–D5): the
// client holds the transcript and re-posts it each turn; the handler calls
// Claude through the LLM seam (frozen system prompt + transcript + a real
// EVENTS list for grounding, D18) and returns the next card — or the close.
// Per-turn calls are EPHEMERAL: nothing is persisted and no event is emitted
// (D5). Completion is the client's next call, POST /me/onboarding, which
// runs the extraction and emits OnboardingCompleted.
//
// Branch validation (open-risks #18): `card` when done:false / `closing`
// when done:true is only prompt-enforced, so the handler validates after
// parse, retries the turn once, then serves a templated fallback — a
// malformed branch never reaches the client. See interview.test.mjs.

import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { computeEffectiveState } from '../lib/lifecycle-state.mjs';
import {
  INTERVIEWER_SYSTEM_PROMPT,
  INTERVIEW_TURN_SCHEMA,
  FALLBACK_CARD,
  FALLBACK_CLOSING,
} from './interview-prompt.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const MAX_GROUNDING_EVENTS = 6;

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function validBranch(turn) {
  if (!turn || typeof turn.done !== 'boolean') return false;
  if (turn.done) {
    return typeof turn.closing?.message === 'string'
      && typeof turn.closing?.nextStep === 'string';
  }
  return typeof turn.card?.prompt === 'string'
    && typeof turn.card?.inputType === 'string';
}

// The EVENTS grounding list (D18). Single-locality v1: every listed event is
// "this locality", so the tiering (locality → nearby → canonical) collapses
// to upcoming-here; an empty list makes the prompt speak in general terms
// rather than name anything.
function formatEventsBlock(events) {
  if (events.length === 0) {
    return 'EVENTS: none currently listed. Speak in general terms; do not name specific events.';
  }
  const lines = events.map((e) => {
    const when = e.startTime ? ` — ${e.startTime}` : '';
    const where = e.location ? ` @ ${e.location}` : '';
    return `- [${e.eventId}] ${e.title}${when}${where}`;
  });
  return 'EVENTS (real events you may reference; never invent others):\n'
    + lines.join('\n');
}

function formatTranscriptBlock(transcript) {
  if (transcript.length === 0) {
    return 'TRANSCRIPT SO FAR: (none — this is the first turn; open the interview.)';
  }
  return 'TRANSCRIPT SO FAR:\n'
    + transcript.map((t) => `${t.role}: ${t.text}`).join('\n');
}

export function createInterviewTurnHandler({ client, usersTable, eventsTable, llm, getOffset }) {
  async function upcomingEvents() {
    const items = [];
    let ExclusiveStartKey;
    do {
      const out = await client.send(new ScanCommand({
        TableName: eventsTable,
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }));
      items.push(...(out.Items ?? []));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    const offset = getOffset ? (await getOffset()).offsetMs : 0;
    const nowIso = new Date(Date.now() + offset).toISOString();

    return items
      .filter((e) => {
        const state = computeEffectiveState(e, nowIso);
        return state !== 'cancelled' && state !== 'over' && state !== 'in-progress'
          && (e.startTime ?? '') > nowIso;
      })
      .sort((a, b) => ((a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1))
      .slice(0, MAX_GROUNDING_EVENTS)
      .map((e) => ({
        eventId: e.eventId,
        title: e.title,
        startTime: e.startTime,
        location: e.location,
      }));
  }

  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });
    if (claims.email_verified !== 'true' && claims.email_verified !== true) {
      return reply(403, { error: 'email not verified' });
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }

    const transcript = body.transcript ?? [];
    if (!Array.isArray(transcript)) {
      return reply(400, { error: 'transcript must be an array' });
    }
    if (!transcript.every((t) => t && typeof t.role === 'string' && typeof t.text === 'string')) {
      return reply(400, { error: 'transcript entries need role and text' });
    }

    const userId = claims.sub;
    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (!userRow.Item) {
      return reply(404, { error: 'user not registered' });
    }
    if (userRow.Item.onboardingCompletedAt) {
      return reply(409, { error: 'onboarding already completed' });
    }

    const events = await upcomingEvents();
    const request = {
      task: 'onboarding-turn',
      system: INTERVIEWER_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `${formatEventsBlock(events)}\n\n${formatTranscriptBlock(transcript)}\n\nProduce the next turn.`,
      }],
      schema: INTERVIEW_TURN_SCHEMA,
      maxTokens: 1024,
      effort: 'low',
    };

    let turn = await llm.complete(request);
    if (!validBranch(turn)) {
      turn = await llm.complete(request);
    }
    if (!validBranch(turn)) {
      turn = turn?.done ? FALLBACK_CLOSING : FALLBACK_CARD;
    }

    return reply(200, turn);
  };
}
