// Specifications for the pre-signup location-gate handlers.
//
// Two handlers:
//   handleLocationCheck — given a postal code, decides whether the user
//   continues to the regular sign-up flow or switches to the notify-me
//   capture.
//
//   handleNotifySubmit — for users in unsupported areas; validates email,
//   calls requestNotify, then shows confirmation.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleLocationCheck, handleNotifySubmit } from './location-handlers.js';

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

let commands;
let navigate;
let showToast;
let onSupported;
let onUnsupported;
let onNotifySuccess;
let stash;

beforeEach(() => {
  commands = {
    checkLocality: spy(async () => ({ supported: true, area: 'Bainbridge Island' })),
    requestNotify: spy(async () => ({ status: 'received' })),
  };
  navigate = spy(() => {});
  showToast = spy(() => {});
  onSupported = spy(() => {});
  onUnsupported = spy(() => {});
  onNotifySuccess = spy(() => {});
  stash = spy(() => {});
});

// ─── handleLocationCheck ───

test('check: rejects empty postal code with a toast and no API call', async () => {
  await handleLocationCheck({
    postalCode: '   ',
    commands, navigate, showToast, onSupported, onUnsupported, stash,
  });
  assert.equal(commands.checkLocality.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});

test('check: supported area → stashes location and calls onSupported with the area', async () => {
  await handleLocationCheck({
    postalCode: '98110',
    commands, navigate, showToast, onSupported, onUnsupported, stash,
  });
  assert.equal(commands.checkLocality.calls[0][0].postalCode, '98110');
  assert.equal(stash.calls.length, 1);
  assert.deepEqual(stash.calls[0][0], { postalCode: '98110', area: 'Bainbridge Island' });
  assert.equal(onSupported.calls.length, 1);
  assert.equal(onSupported.calls[0][0].area, 'Bainbridge Island');
  assert.equal(onUnsupported.calls.length, 0);
});

test('check: trims the postal code before submission', async () => {
  await handleLocationCheck({
    postalCode: '  98110  ',
    commands, navigate, showToast, onSupported, onUnsupported, stash,
  });
  assert.equal(commands.checkLocality.calls[0][0].postalCode, '98110');
});

test('check: unsupported area → calls onUnsupported with the postal code, no stash', async () => {
  commands.checkLocality = spy(async () => ({ supported: false }));

  await handleLocationCheck({
    postalCode: '94110',
    commands, navigate, showToast, onSupported, onUnsupported, stash,
  });

  assert.equal(stash.calls.length, 0);
  assert.equal(onSupported.calls.length, 0);
  assert.equal(onUnsupported.calls.length, 1);
  assert.equal(onUnsupported.calls[0][0].postalCode, '94110');
});

test('check: on API error → toast, no branching call', async () => {
  commands.checkLocality = spy(async () => { throw httpError(500, 'boom'); });

  await handleLocationCheck({
    postalCode: '98110',
    commands, navigate, showToast, onSupported, onUnsupported, stash,
  });

  assert.equal(onSupported.calls.length, 0);
  assert.equal(onUnsupported.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});

// ─── handleNotifySubmit ───

test('notify: rejects an invalid email with a toast and no API call', async () => {
  await handleNotifySubmit({
    email: 'not-an-email',
    postalCode: '94110',
    commands, showToast, onNotifySuccess,
  });
  assert.equal(commands.requestNotify.calls.length, 0);
  assert.match(showToast.calls[0][0], /email/i);
});

test('notify: rejects an empty email', async () => {
  await handleNotifySubmit({
    email: '   ',
    postalCode: '94110',
    commands, showToast, onNotifySuccess,
  });
  assert.equal(commands.requestNotify.calls.length, 0);
});

test('notify: on success calls requestNotify with trimmed values and fires onNotifySuccess', async () => {
  await handleNotifySubmit({
    email: '  curious@example.test  ',
    postalCode: '94110',
    commands, showToast, onNotifySuccess,
  });
  assert.equal(commands.requestNotify.calls.length, 1);
  assert.deepEqual(commands.requestNotify.calls[0][0], {
    email: 'curious@example.test',
    postalCode: '94110',
  });
  assert.equal(onNotifySuccess.calls.length, 1);
});

test('notify: on API error shows toast and does not call onNotifySuccess', async () => {
  commands.requestNotify = spy(async () => { throw httpError(500, 'boom'); });

  await handleNotifySubmit({
    email: 'a@b.c',
    postalCode: '94110',
    commands, showToast, onNotifySuccess,
  });

  assert.equal(onNotifySuccess.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});
