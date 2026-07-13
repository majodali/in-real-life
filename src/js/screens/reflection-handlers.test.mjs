// Specifications for the reflection-conversation handlers.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendExchange,
  collectPerspectives,
  handleReflectionTurn,
  handleReflectionClose,
} from './reflection-handlers.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

test('appendExchange adds either side without mutating', () => {
  const t0 = [];
  const t1 = appendExchange(t0, 'hello', null);
  const t2 = appendExchange(t1, null, 'welcome');
  assert.deepEqual(t0, []);
  assert.deepEqual(t2, [
    { role: 'member', text: 'hello' },
    { role: 'us', text: 'welcome' },
  ]);
});

test('collectPerspectives dedupes and drops none', () => {
  assert.deepEqual(collectPerspectives([
    { perspectiveOffered: 'none' },
    { perspectiveOffered: 'side-by-side' },
    { perspectiveOffered: 'side-by-side' },
    undefined,
  ]), ['side-by-side']);
  assert.deepEqual(collectPerspectives(undefined), []);
});

test('handleReflectionTurn returns turn or error without throwing', async () => {
  const turn = { message: 'hi', done: false, perspectiveOffered: 'none' };
  let commands = { reflectionTurn: spy(async () => turn) };
  assert.deepEqual(await handleReflectionTurn({ eventId: 'e', transcript: [], commands }), { turn });

  commands = { reflectionTurn: spy(async () => { throw new Error('x'); }) };
  const out = await handleReflectionTurn({ eventId: 'e', transcript: [], commands });
  assert.ok(out.error);
});

let commands, showToast, onDone;

beforeEach(() => {
  commands = { completeReflection: spy(async () => ({})) };
  showToast = spy(() => {});
  onDone = spy(() => {});
});

test('close records the conversation with the cap record', async () => {
  const transcript = [
    { role: 'us', text: 'q' },
    { role: 'member', text: 'the big table was fine' },
  ];
  const ok = await handleReflectionClose({
    eventId: 'e1', transcript, perspectivesOffered: ['we-mispredict'],
    commands, showToast, onDone,
  });
  assert.equal(ok, true);
  assert.deepEqual(commands.completeReflection.calls[0][0], {
    eventId: 'e1', transcript, perspectivesOffered: ['we-mispredict'],
  });
  assert.equal(onDone.calls.length, 1);
});

test('a conversation where the member never spoke closes quietly with no API call', async () => {
  const ok = await handleReflectionClose({
    eventId: 'e1',
    transcript: [{ role: 'us', text: 'want to say more?' }],
    perspectivesOffered: [],
    commands, showToast, onDone,
  });
  assert.equal(ok, true);
  assert.equal(commands.completeReflection.calls.length, 0);
  assert.equal(onDone.calls.length, 1);
});

test('409 converges; other errors keep the panel open', async () => {
  const conflict = new Error('dup'); conflict.status = 409;
  commands.completeReflection = spy(async () => { throw conflict; });
  let ok = await handleReflectionClose({
    eventId: 'e1', transcript: [{ role: 'member', text: 'x' }],
    perspectivesOffered: [], commands, showToast, onDone,
  });
  assert.equal(ok, true);
  assert.equal(onDone.calls.length, 1);

  const boom = new Error('boom'); boom.status = 500;
  commands.completeReflection = spy(async () => { throw boom; });
  ok = await handleReflectionClose({
    eventId: 'e1', transcript: [{ role: 'member', text: 'x' }],
    perspectivesOffered: [], commands, showToast, onDone,
  });
  assert.equal(ok, false);
  assert.equal(showToast.calls.length, 1);
});
