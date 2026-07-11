// Specifications for the onboarding-screen handlers.
//
// Pure logic extracted from onboarding.js: transcript building, the live
// interview turn wrapper, and the completion sequence (profile basics →
// onboarding extraction) with its convergence rules.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendExchange,
  scriptedResponsesToTranscript,
  handleInterviewTurn,
  handleOnboardingDone,
} from './onboarding-handlers.js';

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

// ─── appendExchange ───

test('appendExchange adds an interviewer/member pair without mutating the original', () => {
  const original = [{ role: 'interviewer', text: 'q1' }, { role: 'member', text: 'a1' }];
  const next = appendExchange(original, 'q2', 'a2');

  assert.equal(original.length, 2);
  assert.deepEqual(next, [
    { role: 'interviewer', text: 'q1' },
    { role: 'member', text: 'a1' },
    { role: 'interviewer', text: 'q2' },
    { role: 'member', text: 'a2' },
  ]);
});

// ─── scriptedResponsesToTranscript ───

test('converts scripted responses, skipping the name question and empty answers', () => {
  const transcript = scriptedResponsesToTranscript([
    { questionId: 'name', questionText: 'What should we call you?', response: 'Mat' },
    { questionId: 'describe_yourself', questionText: 'Describe yourself', response: 'Curious.' },
    { questionId: 'enjoy_doing', questionText: 'What do you enjoy?', response: '', skipped: true },
    { questionId: 'social_goals', questionText: 'What are you hoping for?', response: '  walks  ' },
  ]);

  assert.deepEqual(transcript, [
    { role: 'interviewer', text: 'Describe yourself' },
    { role: 'member', text: 'Curious.' },
    { role: 'interviewer', text: 'What are you hoping for?' },
    { role: 'member', text: 'walks' },
  ]);
});

test('handles empty or missing responses', () => {
  assert.deepEqual(scriptedResponsesToTranscript([]), []);
  assert.deepEqual(scriptedResponsesToTranscript(undefined), []);
  assert.deepEqual(scriptedResponsesToTranscript([null]), []);
});

// ─── handleInterviewTurn ───

test('returns the turn on success', async () => {
  const turn = { done: false, card: { prompt: 'p', inputType: 'text' } };
  const commands = { interviewTurn: spy(async () => turn) };

  const result = await handleInterviewTurn({ transcript: [], commands });

  assert.deepEqual(result, { turn });
  assert.deepEqual(commands.interviewTurn.calls[0][0], { transcript: [] });
});

test('returns the error instead of throwing', async () => {
  const commands = { interviewTurn: spy(async () => { throw httpError(500); }) };

  const result = await handleInterviewTurn({ transcript: [], commands });

  assert.equal(result.error.status, 500);
  assert.equal(result.turn, undefined);
});

// ─── handleOnboardingDone ───

const TRANSCRIPT = [
  { role: 'interviewer', text: 'q' },
  { role: 'member', text: 'a' },
];

let commands, navigate, showToast;

beforeEach(() => {
  commands = {
    createProfile: spy(async () => ({ userId: 'u-1', seq: 2 })),
    completeOnboarding: spy(async () => ({ userId: 'u-1', seq: 3 })),
  };
  navigate = spy(() => {});
  showToast = spy(() => {});
});

function done(overrides = {}) {
  return handleOnboardingDone({
    name: 'Mat',
    avatar: '🌱',
    vibeMessage: 'hi',
    transcript: TRANSCRIPT,
    commands,
    navigate,
    showToast,
    ...overrides,
  });
}

test('happy path: profile basics then onboarding close, then locality', async () => {
  const ok = await done();

  assert.equal(ok, true);
  assert.deepEqual(commands.createProfile.calls[0][0], {
    name: 'Mat', avatar: '🌱', vibeMessage: 'hi',
  });
  assert.deepEqual(commands.completeOnboarding.calls[0][0], { transcript: TRANSCRIPT });
  assert.deepEqual(navigate.calls, [['locality']]);
  assert.equal(showToast.calls.length, 0);
});

test('empty transcript: saves the profile but skips the onboarding close', async () => {
  const ok = await done({ transcript: [] });

  assert.equal(ok, true);
  assert.equal(commands.createProfile.calls.length, 1);
  assert.equal(commands.completeOnboarding.calls.length, 0);
  assert.deepEqual(navigate.calls, [['locality']]);
});

test('profile 409 converges: continues to the onboarding close', async () => {
  commands.createProfile = spy(async () => { throw httpError(409); });

  const ok = await done();

  assert.equal(ok, true);
  assert.equal(commands.completeOnboarding.calls.length, 1);
  assert.deepEqual(navigate.calls, [['locality']]);
  assert.equal(showToast.calls.length, 0);
});

test('profile 404 sends the user back to sign-in', async () => {
  commands.createProfile = spy(async () => { throw httpError(404); });

  const ok = await done();

  assert.equal(ok, false);
  assert.equal(commands.completeOnboarding.calls.length, 0);
  assert.deepEqual(navigate.calls, [['signin']]);
  assert.equal(showToast.calls.length, 1);
});

test('other profile error aborts with a toast', async () => {
  commands.createProfile = spy(async () => { throw httpError(500, 'boom'); });

  const ok = await done();

  assert.equal(ok, false);
  assert.equal(commands.completeOnboarding.calls.length, 0);
  assert.equal(navigate.calls.length, 0);
  assert.equal(showToast.calls[0][0], 'boom');
});

test('onboarding 409 converges silently', async () => {
  commands.completeOnboarding = spy(async () => { throw httpError(409); });

  const ok = await done();

  assert.equal(ok, true);
  assert.deepEqual(navigate.calls, [['locality']]);
  assert.equal(showToast.calls.length, 0);
});

test('onboarding failure warns but does not strand the user', async () => {
  commands.completeOnboarding = spy(async () => { throw httpError(500); });

  const ok = await done();

  assert.equal(ok, true);
  assert.equal(showToast.calls.length, 1);
  assert.deepEqual(navigate.calls, [['locality']]);
});
