// Route handler for POST /me/agreement (agreement re-acceptance).
//
// The one state-changing command available to a user whose accepted
// agreement version has fallen behind `required_user_agreement_version`
// (docs/event-sourcing.md → Agreement versioning). Emits
// UserAgreementReaccepted on the user's aggregate; the projection updates
// the state row, which clears the agreement gate.

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { meetsRequiredAgreement } from '../lib/agreement-version.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createReacceptAgreementHandler({ runner, client, usersTable, getRequiredAgreement }) {
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

    const { commandId, agreementVersion } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (typeof agreementVersion !== 'string' || !agreementVersion) {
      return reply(400, { error: 'agreementVersion required' });
    }

    const required = await getRequiredAgreement();
    if (!required.version) {
      return reply(409, { error: 'no re-acceptance required' });
    }
    // The client must accept the version it was shown — a stale client
    // posting an older version would silently "clear" the wrong terms.
    if (agreementVersion !== required.version) {
      return reply(400, {
        error: 'agreementVersion must match the required version',
        requiredAgreementVersion: required.version,
      });
    }

    const userId = claims.sub;
    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (!userRow.Item) return reply(404, { error: 'user not registered' });
    if (meetsRequiredAgreement(userRow.Item.agreementVersion, required.version)) {
      return reply(409, { error: 'agreement already current' });
    }

    let out;
    try {
      out = await runner.runCommand({
        commandId,
        aggregateId: `user#${userId}`,
        actorId: `user#${userId}`,
        events: [{
          eventType: 'UserAgreementReaccepted',
          version: 1,
          seq: userRow.Item.seq + 1,
          data: { userId, agreementVersion },
        }],
        result: { userId, agreementVersion, status: 'reaccepted' },
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
