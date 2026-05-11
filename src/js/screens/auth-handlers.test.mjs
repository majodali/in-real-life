// Specifications for the auth-screen submit handlers.
//
// Pure logic extracted from the DOM-glue render functions so it can be unit
// tested. Each handler validates input, calls auth, and routes via injected
// navigate / showToast callbacks.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  handleSignupSubmit,
  handleConfirmSubmit,
  handleSigninSubmit,
} from './auth-handlers.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

let auth;
let navigate;
let showToast;

beforeEach(() => {
  auth = {
    signUp: spy(async () => ({ userSub: 'u-1', userConfirmed: false })),
    confirmSignUp: spy(async () => undefined),
    signIn: spy(async () => ({ idToken: 'id', accessToken: 'a' })),
  };
  navigate = spy(() => {});
  showToast = spy(() => {});
});

// ─── isValidEmail ───

test('isValidEmail accepts a typical email and rejects garbage', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('hi+tag@example.com'), true);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('a @b.co'), false);
  assert.equal(isValidEmail(null), false);
});

// ─── handleSignupSubmit ───

test('signup: rejects an invalid email with a toast and no auth call', async () => {
  await handleSignupSubmit({ email: 'bad', password: 'pw12345678', agreed: true, auth, navigate, showToast });
  assert.equal(auth.signUp.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
  assert.match(showToast.calls[0][0], /email/i);
});

test('signup: rejects a short password', async () => {
  await handleSignupSubmit({ email: 'a@b.co', password: 'short', agreed: true, auth, navigate, showToast });
  assert.equal(auth.signUp.calls.length, 0);
  assert.match(showToast.calls[0][0], /password/i);
});

test('signup: rejects when terms not agreed', async () => {
  await handleSignupSubmit({ email: 'a@b.co', password: 'pw12345678', agreed: false, auth, navigate, showToast });
  assert.equal(auth.signUp.calls.length, 0);
  assert.match(showToast.calls[0][0], /terms|agree/i);
});

test('signup: on success calls auth.signUp and navigates to confirm with the email', async () => {
  await handleSignupSubmit({ email: 'a@b.co', password: 'pw12345678', agreed: true, auth, navigate, showToast });
  assert.equal(auth.signUp.calls.length, 1);
  assert.deepEqual(auth.signUp.calls[0][0], { email: 'a@b.co', password: 'pw12345678' });
  assert.equal(navigate.calls.length, 1);
  assert.equal(navigate.calls[0][0], 'confirm');
  assert.equal(navigate.calls[0][1], encodeURIComponent('a@b.co'));
});

test('signup: on auth error shows the message via toast and does not navigate', async () => {
  auth.signUp = spy(async () => { throw new Error('UsernameExistsException'); });
  await handleSignupSubmit({ email: 'a@b.co', password: 'pw12345678', agreed: true, auth, navigate, showToast });
  assert.equal(navigate.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
  assert.match(showToast.calls[0][0], /Username|exists/);
});

// ─── handleConfirmSubmit ───

test('confirm: requires a 6-digit code', async () => {
  await handleConfirmSubmit({ email: 'a@b.co', code: '123', auth, navigate, showToast });
  assert.equal(auth.confirmSignUp.calls.length, 0);
  assert.match(showToast.calls[0][0], /code/i);
});

test('confirm: on success calls confirmSignUp and navigates to signin with the email', async () => {
  await handleConfirmSubmit({ email: 'a@b.co', code: '123456', auth, navigate, showToast });
  assert.equal(auth.confirmSignUp.calls.length, 1);
  assert.deepEqual(auth.confirmSignUp.calls[0][0], { email: 'a@b.co', code: '123456' });
  assert.equal(navigate.calls[0][0], 'signin');
  assert.equal(navigate.calls[0][1], encodeURIComponent('a@b.co'));
});

test('confirm: on error shows toast and does not navigate', async () => {
  auth.confirmSignUp = spy(async () => { throw new Error('CodeMismatchException'); });
  await handleConfirmSubmit({ email: 'a@b.co', code: '999999', auth, navigate, showToast });
  assert.equal(navigate.calls.length, 0);
  assert.match(showToast.calls[0][0], /CodeMismatch|code/);
});

// ─── handleSigninSubmit ───

test('signin: rejects invalid email', async () => {
  await handleSigninSubmit({ email: 'bad', password: 'pw12345678', auth, navigate, showToast });
  assert.equal(auth.signIn.calls.length, 0);
});

test('signin: requires non-empty password', async () => {
  await handleSigninSubmit({ email: 'a@b.co', password: '', auth, navigate, showToast });
  assert.equal(auth.signIn.calls.length, 0);
  assert.match(showToast.calls[0][0], /password/i);
});

test('signin: on success calls auth.signIn and navigates to welcome', async () => {
  await handleSigninSubmit({ email: 'a@b.co', password: 'pw12345678', auth, navigate, showToast });
  assert.equal(auth.signIn.calls.length, 1);
  assert.deepEqual(auth.signIn.calls[0][0], { email: 'a@b.co', password: 'pw12345678' });
  assert.equal(navigate.calls[0][0], 'welcome');
});

test('signin: on auth error shows toast and does not navigate', async () => {
  auth.signIn = spy(async () => { throw new Error('NotAuthorizedException'); });
  await handleSigninSubmit({ email: 'a@b.co', password: 'wrong', auth, navigate, showToast });
  assert.equal(navigate.calls.length, 0);
  assert.match(showToast.calls[0][0], /NotAuthorized|incorrect|password/i);
});
