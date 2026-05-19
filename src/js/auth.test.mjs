// Specifications for the Cognito auth module.
//
// auth.js wraps the Cognito Identity Provider REST API directly (no SDK), so
// the no-build static frontend doesn't need bundling. It uses USER_PASSWORD_AUTH
// for sign-in (the user pool client has it enabled) and REFRESH_TOKEN_AUTH for
// silent refresh. Tokens live in the injected storage (localStorage in browsers).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from './auth.js';

const REGION = 'us-east-1';
const CLIENT_ID = 'test-client-id';
const COGNITO_URL = `https://cognito-idp.${REGION}.amazonaws.com/`;

let fetchCalls;
let fetchResults;
let fetchCallIndex;
let storage;
let auth;

function jsonResponse(body, { status = 200, ok = true } = {}) {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  fetchCalls = [];
  fetchCallIndex = 0;
  fetchResults = [];

  const fakeFetch = (url, opts) => {
    fetchCalls.push({ url, opts });
    const result = fetchResults[fetchCallIndex++] ?? jsonResponse({});
    return Promise.resolve(result);
  };

  const map = new Map();
  storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _data: map,
  };

  auth = createAuth({
    region: REGION,
    userPoolClientId: CLIENT_ID,
    fetch: fakeFetch,
    storage,
  });
});

function lastFetch() {
  return fetchCalls[fetchCalls.length - 1];
}

function lastBody() {
  return JSON.parse(lastFetch().opts.body);
}

// ─── signUp ───

test('signUp posts to the Cognito IDP endpoint with the SignUp target', async () => {
  fetchResults = [jsonResponse({ UserSub: 'u-1', UserConfirmed: false })];

  await auth.signUp({ email: 'a@b.c', password: 'pw' });

  const call = lastFetch();
  assert.equal(call.url, COGNITO_URL);
  assert.equal(call.opts.method, 'POST');
  assert.equal(call.opts.headers['X-Amz-Target'], 'AWSCognitoIdentityProviderService.SignUp');
  assert.equal(call.opts.headers['Content-Type'], 'application/x-amz-json-1.1');
});

test('signUp body has ClientId, Username, Password, and email UserAttribute', async () => {
  fetchResults = [jsonResponse({ UserSub: 'u-1', UserConfirmed: false })];

  await auth.signUp({ email: 'a@b.c', password: 'pw' });

  const body = lastBody();
  assert.equal(body.ClientId, CLIENT_ID);
  assert.equal(body.Username, 'a@b.c');
  assert.equal(body.Password, 'pw');
  assert.deepEqual(body.UserAttributes, [{ Name: 'email', Value: 'a@b.c' }]);
});

test('signUp returns parsed { userSub, userConfirmed }', async () => {
  fetchResults = [jsonResponse({ UserSub: 'u-1', UserConfirmed: false })];
  const result = await auth.signUp({ email: 'a@b.c', password: 'pw' });
  assert.deepEqual(result, { userSub: 'u-1', userConfirmed: false });
});

test('signUp throws on a Cognito error response', async () => {
  fetchResults = [jsonResponse(
    { __type: 'UsernameExistsException', message: 'User already exists' },
    { ok: false, status: 400 },
  )];
  await assert.rejects(
    () => auth.signUp({ email: 'a@b.c', password: 'pw' }),
    /UsernameExistsException|already exists/,
  );
});

// ─── confirmSignUp ───

test('confirmSignUp posts to ConfirmSignUp with ClientId, Username, ConfirmationCode', async () => {
  fetchResults = [jsonResponse({})];

  await auth.confirmSignUp({ email: 'a@b.c', code: '123456' });

  const call = lastFetch();
  assert.equal(call.opts.headers['X-Amz-Target'], 'AWSCognitoIdentityProviderService.ConfirmSignUp');
  const body = lastBody();
  assert.equal(body.ClientId, CLIENT_ID);
  assert.equal(body.Username, 'a@b.c');
  assert.equal(body.ConfirmationCode, '123456');
});

test('confirmSignUp throws on error', async () => {
  fetchResults = [jsonResponse(
    { __type: 'CodeMismatchException', message: 'Invalid verification code' },
    { ok: false, status: 400 },
  )];
  await assert.rejects(
    () => auth.confirmSignUp({ email: 'a@b.c', code: '000000' }),
    /CodeMismatchException|Invalid/,
  );
});

// ─── signIn ───

test('signIn posts to InitiateAuth with USER_PASSWORD_AUTH', async () => {
  fetchResults = [jsonResponse({
    AuthenticationResult: {
      IdToken: 'id', AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 3600,
    },
  })];

  await auth.signIn({ email: 'a@b.c', password: 'pw' });

  const call = lastFetch();
  assert.equal(call.opts.headers['X-Amz-Target'], 'AWSCognitoIdentityProviderService.InitiateAuth');
  const body = lastBody();
  assert.equal(body.ClientId, CLIENT_ID);
  assert.equal(body.AuthFlow, 'USER_PASSWORD_AUTH');
  assert.equal(body.AuthParameters.USERNAME, 'a@b.c');
  assert.equal(body.AuthParameters.PASSWORD, 'pw');
});

test('signIn stores tokens and an absolute expiresAt, returns the idToken', async () => {
  fetchResults = [jsonResponse({
    AuthenticationResult: {
      IdToken: 'id', AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 3600,
    },
  })];

  const before = Date.now();
  const result = await auth.signIn({ email: 'a@b.c', password: 'pw' });
  const after = Date.now();

  assert.equal(result.idToken, 'id');

  const stored = JSON.parse(storage._data.get('irl_auth_tokens'));
  assert.equal(stored.idToken, 'id');
  assert.equal(stored.accessToken, 'access');
  assert.equal(stored.refreshToken, 'refresh');
  assert.ok(stored.expiresAt >= before + 3600 * 1000 - 1000);
  assert.ok(stored.expiresAt <= after + 3600 * 1000 + 1000);
});

test('signIn throws on Cognito error', async () => {
  fetchResults = [jsonResponse(
    { __type: 'NotAuthorizedException', message: 'Incorrect username or password' },
    { ok: false, status: 400 },
  )];
  await assert.rejects(() => auth.signIn({ email: 'a@b.c', password: 'wrong' }), /NotAuthorized|Incorrect/);
});

// ─── refresh ───

test('refresh posts InitiateAuth with REFRESH_TOKEN_AUTH using the stored refresh token', async () => {
  storage._data.set('irl_auth_tokens', JSON.stringify({
    idToken: 'old-id', accessToken: 'old-access', refreshToken: 'r1', expiresAt: 0,
  }));
  fetchResults = [jsonResponse({
    AuthenticationResult: { IdToken: 'new-id', AccessToken: 'new-access', ExpiresIn: 3600 },
  })];

  await auth.refresh();

  const body = lastBody();
  assert.equal(body.AuthFlow, 'REFRESH_TOKEN_AUTH');
  assert.equal(body.AuthParameters.REFRESH_TOKEN, 'r1');
});

test('refresh updates stored idToken/accessToken/expiresAt; refreshToken stays', async () => {
  storage._data.set('irl_auth_tokens', JSON.stringify({
    idToken: 'old-id', accessToken: 'old-access', refreshToken: 'r1', expiresAt: 0,
  }));
  fetchResults = [jsonResponse({
    AuthenticationResult: { IdToken: 'new-id', AccessToken: 'new-access', ExpiresIn: 3600 },
  })];

  await auth.refresh();

  const stored = JSON.parse(storage._data.get('irl_auth_tokens'));
  assert.equal(stored.idToken, 'new-id');
  assert.equal(stored.accessToken, 'new-access');
  assert.equal(stored.refreshToken, 'r1');
  assert.ok(stored.expiresAt > Date.now());
});

test('refresh throws when no refresh token is stored', async () => {
  await assert.rejects(() => auth.refresh(), /no refresh token/);
});

// ─── getValidIdToken ───

test('getValidIdToken returns the stored idToken when not near expiry', async () => {
  storage._data.set('irl_auth_tokens', JSON.stringify({
    idToken: 'good-id', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600 * 1000,
  }));

  const token = await auth.getValidIdToken();
  assert.equal(token, 'good-id');
  assert.equal(fetchCalls.length, 0);
});

test('getValidIdToken refreshes and returns the new idToken when expiring soon', async () => {
  storage._data.set('irl_auth_tokens', JSON.stringify({
    idToken: 'old-id', accessToken: 'a', refreshToken: 'r1', expiresAt: Date.now() + 5_000, // 5s away
  }));
  fetchResults = [jsonResponse({
    AuthenticationResult: { IdToken: 'new-id', AccessToken: 'new-a', ExpiresIn: 3600 },
  })];

  const token = await auth.getValidIdToken();
  assert.equal(token, 'new-id');
  assert.equal(fetchCalls.length, 1);
});

test('getValidIdToken returns null when no tokens are stored', async () => {
  const token = await auth.getValidIdToken();
  assert.equal(token, null);
});

// ─── signOut ───

test('signOut clears stored tokens', () => {
  storage._data.set('irl_auth_tokens', JSON.stringify({ idToken: 'x', refreshToken: 'r' }));
  auth.signOut();
  assert.equal(storage._data.has('irl_auth_tokens'), false);
});

// ─── getCurrentTokens ───

test('getCurrentTokens returns the parsed stored tokens, or null if absent', () => {
  assert.equal(auth.getCurrentTokens(), null);

  const tokens = { idToken: 'i', accessToken: 'a', refreshToken: 'r', expiresAt: 999 };
  storage._data.set('irl_auth_tokens', JSON.stringify(tokens));
  assert.deepEqual(auth.getCurrentTokens(), tokens);
});

// ─── getCurrentClaims ───

function fakeJwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ typ: 'JWT' })}.${enc(payload)}.signature`;
}

test('getCurrentClaims returns null when no tokens are stored', () => {
  assert.equal(auth.getCurrentClaims(), null);
});

test('getCurrentClaims decodes the idToken payload', () => {
  const claims = { sub: 'abc', email: 'a@b.c', 'custom:role': 'admin' };
  storage._data.set('irl_auth_tokens', JSON.stringify({
    idToken: fakeJwt(claims),
    accessToken: 'a', refreshToken: 'r', expiresAt: 999,
  }));
  assert.deepEqual(auth.getCurrentClaims(), claims);
});

test('getCurrentClaims returns null when the idToken is malformed', () => {
  storage._data.set('irl_auth_tokens', JSON.stringify({
    idToken: 'not.a.jwt.extra',
    accessToken: 'a', refreshToken: 'r', expiresAt: 999,
  }));
  assert.equal(auth.getCurrentClaims(), null);
});

test('getCurrentClaims handles base64url padding correctly', () => {
  // Payloads whose base64 encoding has padding-sensitive lengths.
  const claims = { x: '1' };
  storage._data.set('irl_auth_tokens', JSON.stringify({
    idToken: fakeJwt(claims),
    accessToken: 'a', refreshToken: 'r', expiresAt: 999,
  }));
  assert.deepEqual(auth.getCurrentClaims(), claims);
});
