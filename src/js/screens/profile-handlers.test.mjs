// Specifications for the profile-screen save handlers.
//
// Pure logic extracted from profile.js. Two handlers:
//
//   handleProfileSave({ name, vibeMessage, ... })
//     — validates inputs (name required), calls updateProfile, then
//       updates the local user cache via the injected saveUser callback.
//
//   handleAvatarChange({ avatar, ... })
//     — fires off an avatar-only update; same caching semantics.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleProfileSave, handleAvatarChange } from './profile-handlers.js';

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
let saveUser;
let showToast;
let onSuccess;
let onValidationError;

beforeEach(() => {
  commands = {
    updateProfile: spy(async (fields) => ({
      userId: 'u-1',
      name: fields.name ?? 'Matthew',
      avatar: fields.avatar ?? '\u{1F33F}',
      vibeMessage: fields.vibeMessage ?? 'walks',
    })),
  };
  saveUser = spy(() => {});
  showToast = spy(() => {});
  onSuccess = spy(() => {});
  onValidationError = spy(() => {});
});

// ─── handleProfileSave ───

test('save: rejects empty name with onValidationError and no API call', async () => {
  await handleProfileSave({
    name: '   ',
    vibeMessage: 'whatever',
    commands, saveUser, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.updateProfile.calls.length, 0);
  assert.equal(onValidationError.calls.length, 1);
  assert.equal(onValidationError.calls[0][0], 'name');
});

test('save: trims name and vibeMessage before calling updateProfile', async () => {
  await handleProfileSave({
    name: '  Matt  ',
    vibeMessage: '  baking bread  ',
    commands, saveUser, showToast, onSuccess, onValidationError,
  });
  assert.deepEqual(commands.updateProfile.calls[0][0], {
    name: 'Matt',
    vibeMessage: 'baking bread',
  });
});

test('save: caches the merged profile from the API response', async () => {
  await handleProfileSave({
    name: 'Matt',
    vibeMessage: 'baking bread',
    commands, saveUser, showToast, onSuccess, onValidationError,
  });
  assert.equal(saveUser.calls.length, 1);
  assert.deepEqual(saveUser.calls[0][0], {
    userId: 'u-1',
    name: 'Matt',
    avatar: '\u{1F33F}',
    vibeMessage: 'baking bread',
  });
});

test('save: calls onSuccess and shows a toast', async () => {
  await handleProfileSave({
    name: 'Matt',
    vibeMessage: 'baking bread',
    commands, saveUser, showToast, onSuccess, onValidationError,
  });
  assert.equal(onSuccess.calls.length, 1);
  assert.equal(showToast.calls.length, 1);
});

test('save: surfaces an API error via toast and skips onSuccess + saveUser', async () => {
  commands.updateProfile = spy(async () => { throw httpError(500, 'boom'); });
  await handleProfileSave({
    name: 'Matt',
    vibeMessage: 'baking bread',
    commands, saveUser, showToast, onSuccess, onValidationError,
  });
  assert.equal(saveUser.calls.length, 0);
  assert.equal(onSuccess.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});

// ─── handleAvatarChange ───

test('avatar: calls updateProfile with avatar only', async () => {
  await handleAvatarChange({
    avatar: '\u{1F340}',
    commands, saveUser, showToast,
  });
  assert.deepEqual(commands.updateProfile.calls[0][0], { avatar: '\u{1F340}' });
});

test('avatar: caches the merged profile from the API response and shows a toast', async () => {
  await handleAvatarChange({
    avatar: '\u{1F340}',
    commands, saveUser, showToast,
  });
  assert.equal(saveUser.calls.length, 1);
  assert.equal(saveUser.calls[0][0].avatar, '\u{1F340}'); // API echoes the new avatar
  assert.equal(showToast.calls.length, 1);
});

test('avatar: on API error shows toast and does not cache', async () => {
  commands.updateProfile = spy(async () => { throw httpError(500, 'boom'); });
  await handleAvatarChange({
    avatar: '\u{1F340}',
    commands, saveUser, showToast,
  });
  assert.equal(saveUser.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});
