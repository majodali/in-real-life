// Specifications for the tiered-debrief handlers.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDebriefPayload, buildPeopleEntries, handleDebriefSubmit, chooseFollowUp,
} from './debrief-handlers.js';

// ─── buildPeopleEntries (people step marks → API entries) ───

test('people entries: met filter, positive-only seeAgain, avoid rides quietly', () => {
  const marks = new Map([
    ['ref-a', { met: true, seeAgain: true }],
    ['ref-b', { met: true, seeAgain: false, avoid: 'didnt-click' }],
    ['ref-c', { met: true, seeAgain: false, avoid: 'do-not-interact' }],
    ['ref-d', { met: false, seeAgain: false, avoid: 'didnt-click' }], // not met → dropped
    ['ref-e', { met: true, seeAgain: false }],
  ]);
  assert.deepEqual(buildPeopleEntries(marks), [
    { ref: 'ref-a', seeAgain: true },
    { ref: 'ref-b', seeAgain: false, avoid: 'didnt-click' },
    { ref: 'ref-c', seeAgain: false, avoid: 'do-not-interact' },
    { ref: 'ref-e', seeAgain: false },
  ]);
});

test('a see-again tap always outranks a stale avoid mark — never both', () => {
  const marks = new Map([['ref-a', { met: true, seeAgain: true, avoid: 'didnt-click' }]]);
  assert.deepEqual(buildPeopleEntries(marks), [{ ref: 'ref-a', seeAgain: true }]);
});

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

// ─── The one invited follow-up (chooseFollowUp) ───

test('maybe/no invite the aim-better question; a mismatch chip makes it specific', () => {
  assert.equal(
    chooseFollowUp({ attended: true, again: 'maybe', textures: [] }),
    'What would’ve made it easier?',
  );
  assert.equal(
    chooseFollowUp({ attended: true, again: 'no', textures: ['too-big'] }),
    'Was it the size itself, or more that it was hard to find a way in?',
  );
});

test('a good outcome with a mismatch chip invites the calibration check', () => {
  assert.equal(
    chooseFollowUp({ attended: true, again: 'yes', textures: ['too-big', 'great-company'] }),
    'Anything surprise you about how it went?',
  );
});

test('no follow-up on plain good outcomes, no-shows, or conduct concerns', () => {
  assert.equal(chooseFollowUp({ attended: true, again: 'yes', textures: ['great-company'] }), null);
  assert.equal(chooseFollowUp({ attended: false, again: undefined, textures: [] }), null);
  assert.equal(chooseFollowUp({ attended: true, again: 'no', textures: [], conductConcern: true }), null);
});

test('an answered follow-up rides in the payload; a skipped one is dropped', () => {
  const { payload } = buildDebriefPayload({
    attended: true, again: 'maybe',
    followUp: { question: 'What would’ve made it easier?', answer: ' a job to do ' },
  });
  assert.deepEqual(payload.followUp, {
    question: 'What would’ve made it easier?', answer: 'a job to do',
  });

  const skipped = buildDebriefPayload({
    attended: true, again: 'maybe',
    followUp: { question: 'q', answer: '   ' },
  });
  assert.equal('followUp' in skipped.payload, false);
});
