// Route handler for GET /me.
//
// Returns the current user's state row from the users table, sanitised for
// public consumption (drops internal fields like `seq`). The frontend uses
// this to decide which screen to land on after sign-in: 404 → register +
// onboarding; 200 with no `name` → onboarding; 200 with `name` but
// `!localityVerified` → locality screen; 200 with `activated` → feed.

import { GetCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createGetMeHandler({ client, usersTable }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });
    if (claims.email_verified !== 'true' && claims.email_verified !== true) {
      return reply(403, { error: 'email not verified' });
    }

    const userId = claims.sub;
    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (!userRow.Item) return reply(404, { error: 'user not registered' });

    const item = userRow.Item;
    return reply(200, {
      userId: item.userId,
      email: item.email,
      agreementVersion: item.agreementVersion,
      agreementAcceptedAt: item.agreementAcceptedAt,
      registrationPath: item.registrationPath,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      name: item.name,
      avatar: item.avatar,
      vibeMessage: item.vibeMessage,
      onboardingCompletedAt: item.onboardingCompletedAt,
      city: item.city,
      postalCode: item.postalCode,
      country: item.country,
      localityRequestedAt: item.localityRequestedAt,
      localityVerified: item.localityVerified ?? false,
      localityVerifiedAt: item.localityVerifiedAt,
      activated: item.activated ?? false,
      activatedAt: item.activatedAt,
    });
  };
}
