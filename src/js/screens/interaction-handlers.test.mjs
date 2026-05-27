// Specifications for the event-interaction handler.
//
// Single entry point handleInteraction({ desired, currentLevel, ... }) that
// dispatches to setEventInteraction or withdrawEventInteraction based on
// the desired action ('interested' | 'confirmed' | 'withdraw').

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleInteraction } from './interaction-handlers.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

let commands, showToast, onSuccess;

beforeEach(() => {
  commands = {
    setEventInteraction: spy(async () => ({ eventId: 'evt-1', level: 'interested' })),
    withdrawEventInteraction: spy(async () => ({ eventId: 'evt-1', level: null })),
  };
  showToast = spy(() => {});
  onSuccess = spy(() => {});
});

test('desired=interested calls setEventInteraction with level=interested', async () => {
  await handleInteraction({
    desired: 'interested', currentLevel: null, eventId: 'evt-1',
    commands, showToast, onSuccess,
  });
  assert.equal(commands.setEventInteraction.calls.length, 1);
  assert.deepEqual(commands.setEventInteraction.calls[0][0], { eventId: 'evt-1', level: 'interested' });
  assert.equal(onSuccess.calls.length, 1);
});

test('desired=confirmed calls setEventInteraction with level=confirmed', async () => {
  await handleInteraction({
    desired: 'confirmed', currentLevel: 'interested', eventId: 'evt-1',
    commands, showToast, onSuccess,
  });
  assert.equal(commands.setEventInteraction.calls.length, 1);
  assert.equal(commands.setEventInteraction.calls[0][0].level, 'confirmed');
});

test('desired=withdraw calls withdrawEventInteraction', async () => {
  await handleInteraction({
    desired: 'withdraw', currentLevel: 'confirmed', eventId: 'evt-1',
    commands, showToast, onSuccess,
  });
  assert.equal(commands.withdrawEventInteraction.calls.length, 1);
  assert.deepEqual(commands.withdrawEventInteraction.calls[0][0], { eventId: 'evt-1' });
});

test('desired=interested when currentLevel=interested: no-op, no API call', async () => {
  await handleInteraction({
    desired: 'interested', currentLevel: 'interested', eventId: 'evt-1',
    commands, showToast, onSuccess,
  });
  assert.equal(commands.setEventInteraction.calls.length, 0);
  assert.equal(onSuccess.calls.length, 0);
});

test('on API error: shows toast, does not call onSuccess', async () => {
  commands.setEventInteraction = spy(async () => { throw new Error('boom'); });
  await handleInteraction({
    desired: 'interested', currentLevel: null, eventId: 'evt-1',
    commands, showToast, onSuccess,
  });
  assert.equal(onSuccess.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});

test('on 401: toast mentions sign in', async () => {
  const err = new Error('unauthorized'); err.status = 401;
  commands.setEventInteraction = spy(async () => { throw err; });
  await handleInteraction({
    desired: 'interested', currentLevel: null, eventId: 'evt-1',
    commands, showToast, onSuccess,
  });
  assert.match(showToast.calls[0][0], /sign in|signed in|session/i);
});

test('on 404: toast mentions event missing', async () => {
  const err = new Error('not found'); err.status = 404;
  commands.setEventInteraction = spy(async () => { throw err; });
  await handleInteraction({
    desired: 'interested', currentLevel: null, eventId: 'evt-1',
    commands, showToast, onSuccess,
  });
  assert.match(showToast.calls[0][0], /no longer|gone|missing/i);
});

test('unknown desired action: throws (programmer error)', async () => {
  await assert.rejects(() => handleInteraction({
    desired: 'maybe', currentLevel: null, eventId: 'evt-1',
    commands, showToast, onSuccess,
  }));
});
