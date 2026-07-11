// Route handler for DELETE /me.
//
// The other half of the terms-of-use data-rights promise — "if you want it
// deleted, we'll delete it." Four ordered steps:
//
//   1. Atomically: append a UserDeleted event AND delete the user's state
//      row (projectUserDeleted returns a Delete op on the users table).
//      Run via the command runner — same idempotency rails as everything
//      else; same TransactWriteItems.
//   2. Delete the per-aggregate crypto-shred key. From this moment, the
//      user's PII in the event log is permanently unrecoverable.
//   2b. Append the UserKeyShredded audit event (D42) — log-only, no PII,
//      emitted after the physical key destruction it records. Best-effort:
//      a concurrent retry writing it first is fine.
//   3. AdminDeleteUser on Cognito so the email is freed for re-signup.
//   4. Reply 200 { status: 'deleted' }.
//
// Ordering rationale: the durable event-then-row commit goes first so an
// audit trail of the deletion exists even if a later step fails. The
// shred is the point of no return for PII. Cognito is last because once
// it runs, the user's token is invalid — earlier steps relied on it.
//
// Retry / convergence: same commandId → cached 200 (runner). New
// commandId after the row is already gone → no event written, but key
// and Cognito deletions are still attempted (best-effort).

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createDeleteHandler({ runner, client, usersTable, keyStore, cognito, userPoolId }) {
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

    const userId = claims.sub;
    const aggregateId = `user#${userId}`;

    // Step 1 — atomic event + state-row delete (only if a row exists).
    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (userRow.Item) {
      const events = [{
        eventType: 'UserDeleted',
        version: 1,
        seq: userRow.Item.seq + 1,
        data: { userId },
      }];
      try {
        await runner.runCommand({
          commandId,
          aggregateId,
          actorId: aggregateId,
          events,
          result: { status: 'deleted' },
        });
      } catch (err) {
        if (err?.name !== 'TransactionCanceledException') throw err;
        // Concurrent deletion in progress — fall through, the other
        // request will (or has) shred the key and Cognito user; we do the
        // same so all retry paths converge.
      }
    }

    // Step 2 — point of no return for PII.
    await keyStore.deleteKey(aggregateId);

    // Step 2b — audit record of the shred (D42). Carries no PII (the key it
    // records the destruction of is gone). seq + 2: UserDeleted took seq + 1.
    if (userRow.Item) {
      try {
        await runner.runCommand({
          commandId: `${commandId}#shred`,
          aggregateId,
          actorId: 'system',
          events: [{
            eventType: 'UserKeyShredded',
            version: 1,
            seq: userRow.Item.seq + 2,
            data: { userId },
          }],
          result: { status: 'key-shredded' },
        });
      } catch (err) {
        if (err?.name !== 'TransactionCanceledException') throw err;
        // A concurrent retry already recorded the shred — converged.
      }
    }

    // Step 3 — free the email. Best-effort: a missing Cognito user means
    // someone else already did it; any other error surfaces.
    try {
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: claims.email,
      }));
    } catch (err) {
      if (err?.name !== 'UserNotFoundException') throw err;
    }

    return reply(200, { status: 'deleted' });
  };
}
