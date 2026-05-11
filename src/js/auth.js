// Cognito Identity Provider auth wrapper.
//
// Speaks Cognito's AWS-JSON 1.1 protocol directly so the no-build static
// frontend doesn't need an SDK bundle. Sign-in uses USER_PASSWORD_AUTH (the
// user pool client has it enabled); refresh uses REFRESH_TOKEN_AUTH. Tokens
// are stored as a single JSON blob under STORAGE_KEY.
//
// See auth.test.mjs for the spec.

const STORAGE_KEY = 'irl_auth_tokens';
const REFRESH_BUFFER_MS = 60_000; // refresh if token expires within 60s

export function createAuth({
  region,
  userPoolClientId,
  fetch = globalThis.fetch,
  storage = globalThis.localStorage,
}) {
  const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

  async function callCognito(action, body) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data.message || data.__type || `Cognito ${action} failed`);
      err.code = data.__type;
      err.status = response.status;
      throw err;
    }
    return data;
  }

  function readTokens() {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function writeTokens(tokens) {
    storage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  async function signUp({ email, password }) {
    const data = await callCognito('SignUp', {
      ClientId: userPoolClientId,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }],
    });
    return { userSub: data.UserSub, userConfirmed: data.UserConfirmed };
  }

  async function confirmSignUp({ email, code }) {
    await callCognito('ConfirmSignUp', {
      ClientId: userPoolClientId,
      Username: email,
      ConfirmationCode: code,
    });
  }

  async function signIn({ email, password }) {
    const data = await callCognito('InitiateAuth', {
      ClientId: userPoolClientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });
    const tokens = persistAuthResult(data.AuthenticationResult);
    return { idToken: tokens.idToken, accessToken: tokens.accessToken };
  }

  async function refresh() {
    const current = readTokens();
    if (!current?.refreshToken) {
      throw new Error('no refresh token stored');
    }
    const data = await callCognito('InitiateAuth', {
      ClientId: userPoolClientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: current.refreshToken },
    });
    const next = persistAuthResult(data.AuthenticationResult, current.refreshToken);
    return { idToken: next.idToken, accessToken: next.accessToken };
  }

  function signOut() {
    storage.removeItem(STORAGE_KEY);
  }

  function getCurrentTokens() {
    return readTokens();
  }

  async function getValidIdToken() {
    const tokens = readTokens();
    if (!tokens) return null;
    if (tokens.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
      return tokens.idToken;
    }
    const refreshed = await refresh();
    return refreshed.idToken;
  }

  function persistAuthResult(authResult, fallbackRefreshToken) {
    const tokens = {
      idToken: authResult.IdToken,
      accessToken: authResult.AccessToken,
      refreshToken: authResult.RefreshToken ?? fallbackRefreshToken,
      expiresAt: Date.now() + authResult.ExpiresIn * 1000,
    };
    writeTokens(tokens);
    return tokens;
  }

  return {
    signUp,
    confirmSignUp,
    signIn,
    refresh,
    signOut,
    getCurrentTokens,
    getValidIdToken,
  };
}
