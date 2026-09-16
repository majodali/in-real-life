// Test-helper: create a Cognito user via admin APIs and obtain a JWT.
//
// Production users sign up via SRP. Tests use ADMIN_USER_PASSWORD_AUTH
// (which we enabled on the user pool client) so we can skip the email
// confirmation flow. Test emails should use the `test-` prefix to make
// orphan cleanup easy if a test fails partway.

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { awsRegion } from './region.mjs';

const REGION = awsRegion();
const cognito = new CognitoIdentityProviderClient({ region: REGION });

export async function createTestUser({ userPoolId, userPoolClientId, email, password = 'TestPass1!', admin = false }) {
  // Set custom:role at creation time rather than via a follow-up
  // AdminUpdateUserAttributes call: the CI role is scoped to AdminCreateUser
  // (among others) but not AdminUpdateUserAttributes, and custom:role is a
  // mutable attribute that AdminCreateUser accepts directly.
  const userAttributes = [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
  ];
  if (admin) userAttributes.push({ Name: 'custom:role', Value: 'admin' });

  const create = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    UserAttributes: userAttributes,
    MessageAction: 'SUPPRESS',
  }));
  const sub = create.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error('Cognito sub not returned from AdminCreateUser');

  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: email,
    Password: password,
    Permanent: true,
  }));

  const auth = await cognito.send(new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: userPoolClientId,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  }));

  return {
    sub,
    email,
    idToken: auth.AuthenticationResult.IdToken,
    accessToken: auth.AuthenticationResult.AccessToken,
  };
}

export async function deleteTestUser({ userPoolId, email }) {
  await cognito.send(new AdminDeleteUserCommand({
    UserPoolId: userPoolId,
    Username: email,
  }));
}
