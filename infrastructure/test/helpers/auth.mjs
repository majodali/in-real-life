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
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const REGION = process.env.AWS_REGION || 'us-east-1';
const cognito = new CognitoIdentityProviderClient({ region: REGION });

export async function createTestUser({ userPoolId, userPoolClientId, email, password = 'TestPass1!', admin = false }) {
  const create = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ],
    MessageAction: 'SUPPRESS',
  }));
  const sub = create.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error('Cognito sub not returned from AdminCreateUser');

  if (admin) {
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [{ Name: 'custom:role', Value: 'admin' }],
    }));
  }

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
