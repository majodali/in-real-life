// Agreement re-acceptance gate (docs/event-sourcing.md → Agreement
// versioning).
//
// Wraps a state-changing member route: when the signed-in user's accepted
// agreement version no longer satisfies `required_user_agreement_version`,
// the command is rejected with 403 + code `agreement_reacceptance_required`
// until they re-accept via POST /me/agreement.
//
// Deliberately NOT applied to:
//   - GET routes — read-only access stays available by design
//   - POST /me/register — a new registration accepts the current version
//   - POST /me/agreement — the one command that clears the gate
//   - DELETE /me and GET /me/export — data rights are never held hostage
//     to a terms change
//   - /admin and /notify routes — staff ops and the pre-signup notify list
//
// Unauthenticated or unregistered requests pass straight through: the
// wrapped handler owns its own 401/404 semantics, and the gate must never
// mask them.

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { meetsRequiredAgreement } from './agreement-version.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createAgreementGate({ client, usersTable, getRequiredAgreement }) {
  return function gate(handler) {
    return async function gatedHandler(event) {
      const claims = event?.requestContext?.authorizer?.jwt?.claims;
      if (!claims?.sub) return handler(event);

      const required = await getRequiredAgreement();
      if (!required.version) return handler(event);

      const userRow = await client.send(new GetCommand({
        TableName: usersTable,
        Key: { userId: claims.sub },
      }));
      if (!userRow.Item) return handler(event);

      if (!meetsRequiredAgreement(userRow.Item.agreementVersion, required.version)) {
        return {
          statusCode: 403,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            error: 'agreement re-acceptance required',
            code: 'agreement_reacceptance_required',
            requiredAgreementVersion: required.version,
          }),
        };
      }
      return handler(event);
    };
  };
}
