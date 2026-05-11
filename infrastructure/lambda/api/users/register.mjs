// Route handler for POST /me/register.
//
// See register.test.mjs for the spec and docs/event-sourcing.md (Registration
// & user lifecycle) for how this fits the broader sign-up flow.
//
// "Already registered" is detected by the projection's
// `attribute_not_exists(userId)` condition rather than a pre-check, so
// idempotent retries can be served from the commandId cache without
// being short-circuited by the existing user row.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createRegisterHandler({ runner }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) {
      return reply(401, { error: 'unauthorized' });
    }

    if (claims.email_verified !== 'true' && claims.email_verified !== true) {
      return reply(403, { error: 'email not verified' });
    }

    const userId = claims.sub;
    const email = claims.email;

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }

    const { commandId, agreementVersion } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!agreementVersion) return reply(400, { error: 'agreementVersion required' });

    const aggregateId = `user#${userId}`;
    const events = [{
      eventType: 'UserRegistered',
      version: 1,
      seq: 1,
      data: {
        userId,
        email,
        agreementVersion,
        path: 'self',
      },
    }];

    let out;
    try {
      out = await runner.runCommand({
        commandId,
        aggregateId,
        actorId: aggregateId,
        events,
        result: { userId },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'already registered' });
      }
      throw err;
    }

    return reply(out.cached ? 200 : 201, out.result);
  };
}
