// Route handler for PUT /me/profile.
//
// Updates an existing profile's name, avatar, and/or vibeMessage. Reads
// the current state row to (a) determine the next seq and (b) fill in any
// fields the request omitted, so the emitted UserProfileUpdated event
// always carries the full new shape — replay-correct without consulting
// prior events. See profile-update.test.mjs for the spec.
//
// 404 when there's no state row OR the row exists but has no profile yet.
// 409 when the conditional projection rejects (concurrent write).

import { GetCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createUpdateProfileHandler({ runner, client, usersTable }) {
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

    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });

    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatar');
    const hasVibe = Object.prototype.hasOwnProperty.call(body, 'vibeMessage');
    if (!hasName && !hasAvatar && !hasVibe) {
      return reply(400, { error: 'at least one of name, avatar, vibeMessage required' });
    }
    if (hasName && (typeof body.name !== 'string' || body.name.length === 0)) {
      return reply(400, { error: 'name must be a non-empty string' });
    }

    const userId = claims.sub;
    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (!userRow.Item) return reply(404, { error: 'user not registered' });
    if (!userRow.Item.name) return reply(404, { error: 'profile not yet created' });

    const aggregateId = `user#${userId}`;
    const events = [{
      eventType: 'UserProfileUpdated',
      version: 1,
      seq: userRow.Item.seq + 1,
      data: {
        userId,
        name: hasName ? body.name : userRow.Item.name,
        avatar: hasAvatar ? body.avatar : userRow.Item.avatar,
        vibeMessage: hasVibe ? body.vibeMessage : userRow.Item.vibeMessage,
      },
    }];

    let out;
    try {
      out = await runner.runCommand({
        commandId,
        aggregateId,
        actorId: aggregateId,
        events,
        result: {
          userId,
          name: events[0].data.name,
          avatar: events[0].data.avatar,
          vibeMessage: events[0].data.vibeMessage,
        },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'profile update conflict' });
      }
      throw err;
    }

    return reply(200, out.result);
  };
}
