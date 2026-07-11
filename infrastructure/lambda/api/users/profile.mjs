// Route handler for POST /me/profile.
//
// Called after registration to set the user's profile basics — name, avatar,
// vibe message. Basics only (D42): interview content never rides on
// UserProfileCreated; the onboarding flow emits OnboardingCompleted as its
// sole carrier. See profile.test.mjs for the spec.

import { GetCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const DEFAULT_AVATAR = '\u{1F331}'; // seedling — matches the dev frontend default

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createProfileHandler({ runner, client, usersTable }) {
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

    const { commandId, name } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!name || typeof name !== 'string') {
      return reply(400, { error: 'name required' });
    }

    const userId = claims.sub;
    const avatar = body.avatar ?? DEFAULT_AVATAR;
    const vibeMessage = body.vibeMessage ?? '';

    // Read the current state row to determine the next seq.
    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (!userRow.Item) {
      return reply(404, { error: 'user not registered' });
    }

    const aggregateId = `user#${userId}`;
    const events = [{
      eventType: 'UserProfileCreated',
      version: 1,
      seq: userRow.Item.seq + 1,
      data: {
        userId,
        name,
        avatar,
        vibeMessage,
      },
    }];

    let out;
    try {
      out = await runner.runCommand({
        commandId,
        aggregateId,
        actorId: aggregateId,
        events,
        result: { userId, name, avatar, vibeMessage },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'profile already created' });
      }
      throw err;
    }

    return reply(out.cached ? 200 : 201, out.result);
  };
}
