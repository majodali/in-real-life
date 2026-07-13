// Specifications for the tiered-debrief handlers.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebriefPayload, handleDebriefSubmit } from './debrief-handlers.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

// ─── buildDebriefPayload ───

test('attended + again is the minimal valid capture', () => {
  const { payload, error } = buildDebriefPayload({ attended: true, again: 'yes' });
  assert.equal(error, undefined);
  assert.deepEqual(payload, { attended: true, again: 'yes' });
});

test('again is required when attended (the heart of the debrief)', () => {
  const { error } = buildDebriefPayload({ attended: true });
  assert.match(error, /Worth another go/);
});

test('attended undefined is an error', () => {
  assert.ok(buildDebriefPayload({}).error);
});

test('no-show carries only the light reason', () => {
  const { payload } = buildDebriefPayload({ attended: false, noShowReason: 'nerves', textures: ['x'] });
  assert.deepEqual(payload, { attended: false, noShowReason: 'nerves' });
});

test('full capture: textures, people, trimmed reflection', () => {
  const { payload } = buildDebriefPayload({
    attended: true, again: 'maybe',
    textures: ['too-big'],
    people: [{ ref: 'abcd', seeAgain: true }],
    reflection: '  the food helped  ',
  });
  assert.deepEqual(payload, {
    attended: true, again: 'maybe',
    outcomeTexture: ['too-big'],
    people: [{ ref: 'abcd', seeAgain: true }],
    reflection: 'the food helped',
  });
});

test('conduct concern travels alone — every preference field dropped, again not required', () => {
  const { payload, error } = buildDebriefPayload({
    attended: true, conductConcern: true, conductNote: ' what happened ',
    again: 'yes', textures: ['great-company'], people: [{ ref: 'x' }], reflection: 'text',
  });
  assert.equal(error, undefined);
  assert.deepEqual(payload, {
    attended: true, conductConcern: true, conductNote: 'what happened',
  });
});

// ─── handleDebriefSubmit ───

let commands, showToast, onSuccess;

beforeEach(() => {
  commands = { submitDebrief: spy(async () => ({ eventId: 'e1' })) };
  showToast = spy(() => {});
  onSuccess = spy(() => {});
});

test('submits the payload and calls onSuccess', async () => {
  const ok = await handleDebriefSubmit({
    eventId: 'e1', state: { attended: true, again: 'yes' },
    commands, showToast, onSuccess,
  });
  assert.equal(ok, true);
  assert.deepEqual(commands.submitDebrief.calls[0][0], { eventId: 'e1', attended: true, again: 'yes' });
  assert.equal(onSuccess.calls.length, 1);
});

test('validation errors toast and never reach the API', async () => {
  const ok = await handleDebriefSubmit({
    eventId: 'e1', state: { attended: true },
    commands, showToast, onSuccess,
  });
  assert.equal(ok, false);
  assert.equal(commands.submitDebrief.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});

test('409 converges (already debriefed elsewhere)', async () => {
  const err = new Error('conflict'); err.status = 409;
  commands.submitDebrief = spy(async () => { throw err; });
  const ok = await handleDebriefSubmit({
    eventId: 'e1', state: { attended: true, again: 'no' },
    commands, showToast, onSuccess,
  });
  assert.equal(ok, true);
  assert.equal(onSuccess.calls.length, 1);
});

test('other errors toast and stay for retry', async () => {
  const err = new Error('boom'); err.status = 500;
  commands.submitDebrief = spy(async () => { throw err; });
  const ok = await handleDebriefSubmit({
    eventId: 'e1', state: { attended: true, again: 'no' },
    commands, showToast, onSuccess,
  });
  assert.equal(ok, false);
  assert.equal(onSuccess.calls.length, 0);
});
