// Route handler for POST /me/locality.
//
// Workshop mode: runs three sequential commands (Requested → Verified → Activated),
// each its own atomic transaction. Derived commandIds let retries pick up where
// the previous attempt left off. See locality.test.mjs for the spec and
// docs/workshop-mode.md for the production-mode counterpart (deferred).

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { isSupportedPostalCode } from '../lib/supported-localities.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createLocalityHandler({ runner, client, usersTable }) {
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

    const { commandId, city, postalCode, country } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!city || typeof city !== 'string') return reply(400, { error: 'city required' });
    if (!postalCode || typeof postalCode !== 'string') {
      return reply(400, { error: 'postalCode required' });
    }
    if (!isSupportedPostalCode(postalCode)) {
      // Defence in depth: the sign-up gate should have caught this, but
      // enforce here too so direct API calls can't bypass.
      return reply(422, { error: 'postal code not supported', postalCode });
    }

    const userId = claims.sub;
    const aggregateId = `user#${userId}`;

    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (!userRow.Item) {
      return reply(404, { error: 'user not registered' });
    }
    const currentSeq = userRow.Item.seq;

    const baseInput = { aggregateId, actorId: aggregateId };

    // Step 1: LocalityVerificationRequested
    let out1;
    try {
      out1 = await runner.runCommand({
        ...baseInput,
        commandId,
        events: [{
          eventType: 'LocalityVerificationRequested',
          version: 1,
          seq: currentSeq + 1,
          data: { userId, city, postalCode, country },
        }],
        result: { userId, status: 'requested' },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'wrong state for locality submission' });
      }
      throw err;
    }

    // Step 2: LocalityVerified (workshop: auto)
    let out2;
    try {
      out2 = await runner.runCommand({
        ...baseInput,
        commandId: `${commandId}:verify`,
        events: [{
          eventType: 'LocalityVerified',
          version: 1,
          seq: currentSeq + 2,
          data: { userId, verifiedBy: 'system', method: 'auto' },
        }],
        result: { userId, status: 'verified' },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'wrong state for verification' });
      }
      throw err;
    }

    // Step 3: UserActivated
    let out3;
    try {
      out3 = await runner.runCommand({
        ...baseInput,
        commandId: `${commandId}:activate`,
        events: [{
          eventType: 'UserActivated',
          version: 1,
          seq: currentSeq + 3,
          data: { userId },
        }],
        result: { userId, status: 'activated' },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'wrong state for activation' });
      }
      throw err;
    }

    const anyNew = !out1.cached || !out2.cached || !out3.cached;
    return reply(anyNew ? 201 : 200, { userId, status: 'activated' });
  };
}
