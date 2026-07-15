// Route handler for POST /me/onboarding.
//
// Closes the AI onboarding interview (D42): takes the full transcript, runs
// the single extraction call through the injected LLM seam (D37 — a
// deterministic stub in workshop/test, the real Claude API in production),
// and emits OnboardingCompleted — the sole carrier of interview content.
// The state row records completion only; the transcript and Layer-2
// extraction live crypto-shredded on the event log, where the async
// user-model projector (docs/projection-store.md) will consume them.
// See onboarding.test.mjs for the spec.

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ONBOARDING_EXTRACTION_SCHEMA } from './onboarding-schema.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const EXTRACTION_SYSTEM =
  'You extract the onboarding slice of a member profile from an interview '
  + 'transcript, following the JSON schema exactly. Every value must be '
  + 'grounded in what the member actually said: provenance "stated" when '
  + 'explicit, "inferred" when read between the lines, with honest '
  + 'confidence. Do not invent stories, interests, or constraints that are '
  + 'not in the transcript. Set provisional to true.';

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createOnboardingHandler({ runner, client, usersTable, llm }) {
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

    const { commandId, transcript } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return reply(400, { error: 'transcript required' });
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
    // "Already completed" is detected by the projection's
    // attribute_not_exists(onboardingCompletedAt) condition rather than a
    // pre-check (same convention as register.mjs), so an idempotent retry
    // is served from the commandId cache instead of being short-circuited
    // to 409 by the already-updated row. Cost: that rare retry re-runs the
    // extraction before hitting the cache — accepted.

    const extraction = await llm.complete({
      task: 'onboarding-extraction',
      system: EXTRACTION_SYSTEM,
      messages: [{
        role: 'user',
        content: transcript.map((t) => `${t.role}: ${t.text}`).join('\n\n'),
      }],
      schema: ONBOARDING_EXTRACTION_SCHEMA,
      maxTokens: 8192,
    });
    extraction.provisional = true;

    const aggregateId = `user#${userId}`;
    const events = [{
      eventType: 'OnboardingCompleted',
      version: 1,
      seq: userRow.Item.seq + 1,
      data: { userId, transcript, extraction },
    }];

    let out;
    try {
      out = await runner.runCommand({
        commandId,
        aggregateId,
        actorId: aggregateId,
        events,
        result: { userId, status: 'onboarding-complete' },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'onboarding already completed' });
      }
      throw err;
    }

    return reply(out.cached ? 200 : 201, out.result);
  };
}
