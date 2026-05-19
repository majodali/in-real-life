// Specifications for the admin-screen time-action handler.
//
// One handler for all three actions: advance / set / reset. Validates the
// per-action inputs, calls commands.advanceTime, then invokes onSuccess
// so the DOM glue can refresh the display.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleTimeAction } from './admin-handlers.js';

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
let showToast;
let onSuccess;

beforeEach(() => {
  commands = {
    advanceTime: spy(async () => ({ offsetMs: 0, description: 'real time' })),
  };
  showToast = spy(() => {});
  onSuccess = spy(() => {});
});

// ─── Validation ───

test('set without a datetime: toast, no API call', async () => {
  await handleTimeAction({ action: 'set', args: {}, commands, showToast, onSuccess });
  assert.equal(commands.advanceTime.calls.length, 0);
  assert.equal(onSuccess.calls.length, 0);
  assert.match(showToast.calls[0][0], /datetime|when/i);
});

test('advance with neither hours nor days: toast, no API call', async () => {
  await handleTimeAction({ action: 'advance', args: {}, commands, showToast, onSuccess });
  assert.equal(commands.advanceTime.calls.length, 0);
  assert.match(showToast.calls[0][0], /hours|days/i);
});

test('advance with hours=0 and days=0: toast (zero is the same as missing)', async () => {
  await handleTimeAction({ action: 'advance', args: { hours: 0, days: 0 }, commands, showToast, onSuccess });
  assert.equal(commands.advanceTime.calls.length, 0);
});

// ─── Happy paths ───

test('advance with hours: calls advanceTime and onSuccess', async () => {
  await handleTimeAction({ action: 'advance', args: { hours: 6 }, commands, showToast, onSuccess });
  assert.deepEqual(commands.advanceTime.calls[0][0], { action: 'advance', hours: 6 });
  assert.equal(onSuccess.calls.length, 1);
});

test('advance with days: passes days through', async () => {
  await handleTimeAction({ action: 'advance', args: { days: 7 }, commands, showToast, onSuccess });
  assert.deepEqual(commands.advanceTime.calls[0][0], { action: 'advance', days: 7 });
});

test('set with datetime: passes datetime through', async () => {
  await handleTimeAction({
    action: 'set', args: { datetime: '2026-06-01T00:00:00Z' },
    commands, showToast, onSuccess,
  });
  assert.deepEqual(commands.advanceTime.calls[0][0], { action: 'set', datetime: '2026-06-01T00:00:00Z' });
});

test('reset takes no args', async () => {
  await handleTimeAction({ action: 'reset', commands, showToast, onSuccess });
  assert.deepEqual(commands.advanceTime.calls[0][0], { action: 'reset' });
  assert.equal(onSuccess.calls.length, 1);
});

// ─── Error handling ───

test('on API error: shows toast, does not call onSuccess', async () => {
  commands.advanceTime = spy(async () => { throw httpError(500, 'boom'); });
  await handleTimeAction({ action: 'reset', commands, showToast, onSuccess });
  assert.equal(onSuccess.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});

test('on 403: toast mentions admin', async () => {
  commands.advanceTime = spy(async () => { throw httpError(403, 'admin only'); });
  await handleTimeAction({ action: 'reset', commands, showToast, onSuccess });
  assert.match(showToast.calls[0][0], /admin|allow/i);
});
