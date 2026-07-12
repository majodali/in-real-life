// Specifications for the welcome-screen routing handler.
//
// Pure logic extracted from welcome.js so the routing decision tree is
// unit-testable. The handler calls GET /me, decides where to send the user
// based on the response, and registers the aggregate when needed.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleWelcomeMount } from './welcome-handlers.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function httpError(status, message) {
  const err = new Error(message || `HTTP ${status}`);
  err.status = status;
  return err;
}

let api;
let commands;
let navigate;
let showToast;
let saveUser;

beforeEach(() => {
  api = {
    get: spy(async () => ({
      userId: 'u-1',
      name: 'Mat',
      avatar: '\u{1F331}',
      vibeMessage: 'hi',
      localityVerified: true,
      activated: true,
    })),
  };
  commands = { register: spy(async () => ({ userId: 'u-1' })) };
  navigate = spy(() => {});
  showToast = spy(() => {});
  saveUser = spy(() => {});
});

// ─── 200 paths ───

test('profile + locality complete: saves the user locally and navigates to feed', async () => {
  api.get = spy(async () => ({
    userId: 'u-1',
    name: 'Mat',
    avatar: '\u{1F331}',
    vibeMessage: 'hi',
    localityVerified: true,
    activated: true,
  }));

  await handleWelcomeMount({ api, commands, navigate, showToast, saveUser });

  assert.equal(saveUser.calls.length, 1);
  assert.deepEqual(saveUser.calls[0][0], {
    userId: 'u-1',
    name: 'Mat',
    avatar: '\u{1F331}',
    vibeMessage: 'hi',
    localityVerified: true,
    activated: true,
  });
  assert.equal(navigate.calls.length, 1);
  assert.equal(navigate.calls[0][0], 'feed');
  assert.equal(commands.register.calls.length, 0);
});

test('profile complete but locality not verified: navigates to locality without saving local user', async () => {
  api.get = spy(async () => ({
    userId: 'u-1',
    name: 'Mat',
    avatar: '\u{1F331}',
    vibeMessage: 'hi',
    localityVerified: false,
    activated: false,
  }));

  await handleWelcomeMount({ api, commands, navigate, showToast, saveUser });

  assert.equal(saveUser.calls.length, 0);
  assert.equal(navigate.calls[0][0], 'locality');
  assert.equal(commands.register.calls.length, 0);
});

test('registered but no profile (no name): navigates to onboarding without re-registering', async () => {
  api.get = spy(async () => ({ userId: 'u-1' /* no name */, localityVerified: false, activated: false }));

  await handleWelcomeMount({ api, commands, navigate, showToast, saveUser });

  assert.equal(commands.register.calls.length, 0);
  assert.equal(saveUser.calls.length, 0);
  assert.equal(navigate.calls[0][0], 'onboarding');
});

// ─── 404 path ───

test('not registered (404): calls register then navigates to onboarding', async () => {
  api.get = spy(async () => { throw httpError(404, 'user not registered'); });

  await handleWelcomeMount({ api, commands, navigate, showToast, saveUser });

  assert.equal(commands.register.calls.length, 1);
  assert.equal(saveUser.calls.length, 0);
  assert.equal(navigate.calls[0][0], 'onboarding');
});

test('not registered + register fails: shows toast and stays put', async () => {
  api.get = spy(async () => { throw httpError(404); });
  commands.register = spy(async () => { throw new Error('network down'); });

  await handleWelcomeMount({ api, commands, navigate, showToast, saveUser });

  assert.equal(navigate.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
  assert.match(showToast.calls[0][0], /network|account/i);
});

// ─── 401 path ───

test('expired session (401): navigates to signin', async () => {
  api.get = spy(async () => { throw httpError(401, 'unauthorized'); });

  await handleWelcomeMount({ api, commands, navigate, showToast, saveUser });

  assert.equal(commands.register.calls.length, 0);
  assert.equal(navigate.calls[0][0], 'signin');
});

// ─── Other errors ───

test('unexpected error (500): shows toast and does not navigate', async () => {
  api.get = spy(async () => { throw httpError(500, 'boom'); });

  await handleWelcomeMount({ api, commands, navigate, showToast, saveUser });

  assert.equal(navigate.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});

test('requiresAgreementReacceptance routes to the agreement screen before anything else', async () => {
  api.get = spy(async () => ({
    userId: 'u-1',
    name: 'Mat',
    localityVerified: true,
    activated: true,
    requiresAgreementReacceptance: true,
    requiredAgreementVersion: 'v2',
  }));

  await handleWelcomeMount({ api, commands, navigate, showToast, saveUser });

  assert.deepEqual(navigate.calls, [['agreement']]);
  assert.equal(saveUser.calls.length, 0);
});
