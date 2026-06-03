// Specifications for the command wrappers.
//
// commands.js wraps the raw API client with persistent commandIds for
// idempotent retries: each logical operation has a stable storage key.
// On first attempt a fresh commandId is generated and persisted; on success
// it's cleared. If the call throws, the commandId remains so the next
// attempt reuses it and hits the backend's command cache.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCommands } from './commands.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

let api;
let storage;
let commands;
let nextId;

beforeEach(() => {
  api = { post: spy(async () => ({ userId: 'u-1' })) };
  storage = fakeStorage();
  nextId = 0;
  commands = createCommands({
    api,
    storage,
    makeId: () => `cmd-${++nextId}`,
  });
});

// ─── register ───

test('register: posts to /me/register with a fresh commandId and default agreementVersion', async () => {
  await commands.register();
  assert.equal(api.post.calls.length, 1);
  assert.equal(api.post.calls[0][0], '/me/register');
  assert.deepEqual(api.post.calls[0][1], { commandId: 'cmd-1', agreementVersion: 'v1' });
});

test('register: clears the saved commandId on success', async () => {
  await commands.register();
  assert.equal(storage.getItem('irl_cmd_register'), null);
});

test('register: returns the API response', async () => {
  api.post = spy(async () => ({ userId: 'u-42' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });
  const result = await commands.register();
  assert.deepEqual(result, { userId: 'u-42' });
});

test('register: reuses the same commandId across retries when the API call throws', async () => {
  api.post = spy(async () => { throw new Error('boom'); });
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await assert.rejects(() => commands.register());
  assert.equal(storage.getItem('irl_cmd_register'), 'cmd-1');

  await assert.rejects(() => commands.register());
  assert.equal(api.post.calls[1][1].commandId, 'cmd-1');
});

test('register: accepts a custom agreementVersion', async () => {
  await commands.register({ agreementVersion: 'v2' });
  assert.equal(api.post.calls[0][1].agreementVersion, 'v2');
});

// ─── createProfile ───

test('createProfile: posts to /me/profile with commandId and the provided fields', async () => {
  await commands.createProfile({
    name: 'Mat',
    avatar: '\u{1F331}',
    vibeMessage: 'morning walks',
    interviewResponses: [{ questionId: 'name', response: 'Mat' }],
  });

  assert.equal(api.post.calls[0][0], '/me/profile');
  assert.deepEqual(api.post.calls[0][1], {
    commandId: 'cmd-1',
    name: 'Mat',
    avatar: '\u{1F331}',
    vibeMessage: 'morning walks',
    interviewResponses: [{ questionId: 'name', response: 'Mat' }],
  });
});

test('createProfile: clears the saved commandId on success', async () => {
  await commands.createProfile({ name: 'Mat' });
  assert.equal(storage.getItem('irl_cmd_profile'), null);
});

test('createProfile: reuses the same commandId across retries when the API call throws', async () => {
  api.post = spy(async () => { throw new Error('boom'); });
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await assert.rejects(() => commands.createProfile({ name: 'Mat' }));
  await assert.rejects(() => commands.createProfile({ name: 'Mat' }));
  assert.equal(api.post.calls[1][1].commandId, 'cmd-1');
});

test('createProfile: returns the API response', async () => {
  api.post = spy(async () => ({ userId: 'u-1', name: 'Mat', avatar: '\u{1F331}', vibeMessage: 'hi' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });
  const result = await commands.createProfile({ name: 'Mat' });
  assert.equal(result.userId, 'u-1');
  assert.equal(result.name, 'Mat');
});

test('register and createProfile use distinct storage keys', async () => {
  api.post = spy(async () => { throw new Error('boom'); });
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await assert.rejects(() => commands.register());
  await assert.rejects(() => commands.createProfile({ name: 'Mat' }));

  assert.equal(storage.getItem('irl_cmd_register'), 'cmd-1');
  assert.equal(storage.getItem('irl_cmd_profile'), 'cmd-2');
});

// ─── verifyLocality ───

test('verifyLocality: posts to /me/locality with commandId + city/postalCode/country', async () => {
  await commands.verifyLocality({
    city: 'Bainbridge Island',
    postalCode: '98110',
    country: 'US',
  });

  assert.equal(api.post.calls[0][0], '/me/locality');
  assert.deepEqual(api.post.calls[0][1], {
    commandId: 'cmd-1',
    city: 'Bainbridge Island',
    postalCode: '98110',
    country: 'US',
  });
});

test('verifyLocality: clears the saved commandId on success', async () => {
  await commands.verifyLocality({ city: 'Bainbridge Island' });
  assert.equal(storage.getItem('irl_cmd_locality'), null);
});

test('verifyLocality: reuses the same commandId across retries when the API call throws', async () => {
  api.post = spy(async () => { throw new Error('boom'); });
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await assert.rejects(() => commands.verifyLocality({ city: 'Bainbridge Island' }));
  await assert.rejects(() => commands.verifyLocality({ city: 'Bainbridge Island' }));
  assert.equal(api.post.calls[1][1].commandId, 'cmd-1');
});

test('verifyLocality: returns the API response', async () => {
  api.post = spy(async () => ({ userId: 'u-1', status: 'activated' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });
  const result = await commands.verifyLocality({ city: 'Bainbridge Island' });
  assert.deepEqual(result, { userId: 'u-1', status: 'activated' });
});

test('verifyLocality: omits postalCode and country when not provided', async () => {
  await commands.verifyLocality({ city: 'Bainbridge Island' });
  const body = api.post.calls[0][1];
  assert.equal(body.city, 'Bainbridge Island');
  assert.equal(body.postalCode, undefined);
  assert.equal(body.country, undefined);
});

// ─── updateProfile ───
//
// Fresh commandId per call (storage cleared after each successful call —
// just like other commands). PUT to /me/profile with whatever fields the
// caller supplied — the backend merges with existing state.

beforeEach(() => {
  api = {
    post: spy(async () => ({ userId: 'u-1' })),
    put: spy(async () => ({ userId: 'u-1', name: 'Matt' })),
  };
  storage = fakeStorage();
  nextId = 0;
  commands = createCommands({
    api,
    storage,
    makeId: () => `cmd-${++nextId}`,
  });
});

test('updateProfile: PUTs to /me/profile with commandId and provided fields', async () => {
  await commands.updateProfile({ name: 'Matt', avatar: '\u{1F340}', vibeMessage: 'baking bread' });
  assert.equal(api.put.calls[0][0], '/me/profile');
  assert.deepEqual(api.put.calls[0][1], {
    commandId: 'cmd-1',
    name: 'Matt',
    avatar: '\u{1F340}',
    vibeMessage: 'baking bread',
  });
});

test('updateProfile: only sends provided fields (no defaulting)', async () => {
  await commands.updateProfile({ name: 'Matt' });
  const body = api.put.calls[0][1];
  assert.equal(body.name, 'Matt');
  assert.equal(body.avatar, undefined);
  assert.equal(body.vibeMessage, undefined);
});

test('updateProfile: an empty-string vibeMessage is sent through (allows clearing)', async () => {
  await commands.updateProfile({ vibeMessage: '' });
  const body = api.put.calls[0][1];
  assert.equal(body.vibeMessage, '');
});

test('updateProfile: clears the saved commandId on success', async () => {
  await commands.updateProfile({ name: 'Matt' });
  assert.equal(storage.getItem('irl_cmd_profile_update'), null);
});

test('updateProfile: reuses the same commandId across retries when the API call throws', async () => {
  api.put = spy(async () => { throw new Error('boom'); });
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await assert.rejects(() => commands.updateProfile({ name: 'Matt' }));
  await assert.rejects(() => commands.updateProfile({ name: 'Matt' }));
  assert.equal(api.put.calls[1][1].commandId, 'cmd-1');
});

test('updateProfile: returns the API response', async () => {
  api.put = spy(async () => ({ userId: 'u-1', name: 'Matt', avatar: '\u{1F340}', vibeMessage: 'baking' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });
  const result = await commands.updateProfile({ name: 'Matt' });
  assert.deepEqual(result, { userId: 'u-1', name: 'Matt', avatar: '\u{1F340}', vibeMessage: 'baking' });
});

// ─── checkLocality ───
//
// Thin GET wrapper — no commandId/storage involved. Just hides the URL
// shape and parameter encoding from callers.

test('checkLocality: GETs /locality/check with the postal code', async () => {
  api.get = spy(async () => ({ supported: true, area: 'Bainbridge Island' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  const result = await commands.checkLocality({ postalCode: '98110' });

  assert.equal(api.get.calls[0][0], '/locality/check?postalCode=98110');
  assert.deepEqual(result, { supported: true, area: 'Bainbridge Island' });
});

test('checkLocality: URL-encodes the postal code', async () => {
  api.get = spy(async () => ({ supported: false }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.checkLocality({ postalCode: 'ab cd' });
  assert.equal(api.get.calls[0][0], '/locality/check?postalCode=ab%20cd');
});

// ─── Admin / workshop ───
//
// advanceTime is "do it again" semantics: each call is a distinct action
// from the user, so a fresh commandId per call (no persistence) — the
// opposite of register/createProfile.

test('getTime: GETs /time and returns the response', async () => {
  api.get = spy(async () => ({ wallTime: 'w', simulatedTime: 's', offsetMs: 0, description: 'real time' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });
  const result = await commands.getTime();
  assert.equal(api.get.calls[0][0], '/time');
  assert.equal(result.description, 'real time');
});

test('advanceTime: POSTs to /admin/time with a fresh commandId and the action args', async () => {
  await commands.advanceTime({ action: 'advance', hours: 6 });
  assert.equal(api.post.calls[0][0], '/admin/time');
  assert.deepEqual(api.post.calls[0][1], { commandId: 'cmd-1', action: 'advance', hours: 6 });
});

test('advanceTime: each call gets a new commandId (no persistence)', async () => {
  await commands.advanceTime({ action: 'advance', days: 1 });
  await commands.advanceTime({ action: 'advance', days: 1 });
  assert.notEqual(api.post.calls[0][1].commandId, api.post.calls[1][1].commandId);
});

test('advanceTime: passes through set / reset action shapes', async () => {
  await commands.advanceTime({ action: 'set', datetime: '2026-06-01T00:00:00Z' });
  await commands.advanceTime({ action: 'reset' });
  assert.equal(api.post.calls[0][1].action, 'set');
  assert.equal(api.post.calls[0][1].datetime, '2026-06-01T00:00:00Z');
  assert.equal(api.post.calls[1][1].action, 'reset');
});

test('getNotifyList: GETs /admin/notify-list and returns the response', async () => {
  api.get = spy(async () => ({ entries: [{ email: 'a@b.c' }], count: 1 }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });
  const result = await commands.getNotifyList();
  assert.equal(api.get.calls[0][0], '/admin/notify-list');
  assert.equal(result.count, 1);
});

// ─── deleteAccount ───

test('deleteAccount: DELETEs /me with a fresh commandId in the body', async () => {
  api.delete = spy(async () => ({ status: 'deleted' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  const result = await commands.deleteAccount();

  assert.equal(api.delete.calls[0][0], '/me');
  assert.deepEqual(api.delete.calls[0][1], { commandId: 'cmd-1' });
  assert.deepEqual(result, { status: 'deleted' });
});

test('deleteAccount: clears the saved commandId on success', async () => {
  api.delete = spy(async () => ({ status: 'deleted' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });
  await commands.deleteAccount();
  assert.equal(storage.getItem('irl_cmd_delete'), null);
});

test('deleteAccount: reuses the same commandId across retries when the call throws', async () => {
  api.delete = spy(async () => { throw new Error('boom'); });
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await assert.rejects(() => commands.deleteAccount());
  await assert.rejects(() => commands.deleteAccount());
  assert.equal(api.delete.calls[1][1].commandId, 'cmd-1');
});

// ─── exportData ───
//
// Thin GET wrapper — no commandId/storage. Returns the full export blob.

test('exportData: GETs /me/export and returns the response', async () => {
  api.get = spy(async () => ({ userId: 'u-1', profile: {}, events: [] }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  const result = await commands.exportData();

  assert.equal(api.get.calls[0][0], '/me/export');
  assert.deepEqual(result, { userId: 'u-1', profile: {}, events: [] });
});

// ─── requestNotify ───

test('requestNotify: POSTs to /notify with commandId, email, and postalCode', async () => {
  await commands.requestNotify({ email: 'curious@example.test', postalCode: '94110' });

  assert.equal(api.post.calls[0][0], '/notify');
  assert.deepEqual(api.post.calls[0][1], {
    commandId: 'cmd-1',
    email: 'curious@example.test',
    postalCode: '94110',
  });
});

test('requestNotify: passes through an optional country', async () => {
  await commands.requestNotify({ email: 'a@b.c', postalCode: 'SW1A', country: 'GB' });
  const body = api.post.calls[0][1];
  assert.equal(body.country, 'GB');
});

test('requestNotify: clears the saved commandId on success', async () => {
  await commands.requestNotify({ email: 'a@b.c', postalCode: '94110' });
  assert.equal(storage.getItem('irl_cmd_notify'), null);
});

test('requestNotify: reuses the same commandId across retries when the API call throws', async () => {
  api.post = spy(async () => { throw new Error('boom'); });
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await assert.rejects(() => commands.requestNotify({ email: 'a@b.c', postalCode: '94110' }));
  await assert.rejects(() => commands.requestNotify({ email: 'a@b.c', postalCode: '94110' }));
  assert.equal(api.post.calls[1][1].commandId, 'cmd-1');
});

// ─── proposeEvent / listEvents ───

test('proposeEvent: POSTs to /events with commandId and all provided fields', async () => {
  api.post = spy(async () => ({ eventId: 'evt-xyz' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.proposeEvent({
    title: 'Coffee walk',
    description: 'Easy walk',
    startTime: '2026-06-01T16:00:00Z',
    endTime: '2026-06-01T17:30:00Z',
    location: 'Blackbird Bakery',
    organizerName: 'Matthew',
    minimumAttendance: 3,
  });

  assert.equal(api.post.calls.length, 1);
  assert.equal(api.post.calls[0][0], '/events');
  assert.deepEqual(api.post.calls[0][1], {
    commandId: 'cmd-1',
    title: 'Coffee walk',
    description: 'Easy walk',
    startTime: '2026-06-01T16:00:00Z',
    endTime: '2026-06-01T17:30:00Z',
    location: 'Blackbird Bakery',
    organizerName: 'Matthew',
    minimumAttendance: 3,
  });
});

test('proposeEvent: omits optional fields when not provided', async () => {
  api.post = spy(async () => ({ eventId: 'evt-xyz' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.proposeEvent({
    title: 'Coffee walk',
    startTime: '2026-06-01T16:00:00Z',
    location: 'Blackbird Bakery',
    organizerName: 'Matthew',
  });

  const body = api.post.calls[0][1];
  assert.equal(body.description, undefined);
  assert.equal(body.endTime, undefined);
  assert.equal(body.minimumAttendance, undefined);
});

test('proposeEvent: clears the saved commandId on success', async () => {
  api.post = spy(async () => ({ eventId: 'evt-xyz' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.proposeEvent({
    title: 'x', startTime: 't', location: 'l', organizerName: 'n',
  });
  assert.equal(storage.getItem('irl_cmd_propose_event'), null);
});

test('proposeEvent: reuses the same commandId across retries when the API call throws', async () => {
  api.post = spy(async () => { throw new Error('boom'); });
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  const args = { title: 'x', startTime: 't', location: 'l', organizerName: 'n' };
  await assert.rejects(() => commands.proposeEvent(args));
  await assert.rejects(() => commands.proposeEvent(args));
  assert.equal(api.post.calls[1][1].commandId, 'cmd-1');
});

test('proposeEvent: returns the API response (with eventId)', async () => {
  api.post = spy(async () => ({ eventId: 'evt-42' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  const result = await commands.proposeEvent({
    title: 'x', startTime: 't', location: 'l', organizerName: 'n',
  });
  assert.deepEqual(result, { eventId: 'evt-42' });
});

test('listEvents: GETs /events and returns the response', async () => {
  api.get = spy(async () => ({ events: [{ eventId: 'a' }], count: 1 }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  const result = await commands.listEvents();
  assert.equal(api.get.calls.length, 1);
  assert.equal(api.get.calls[0][0], '/events');
  assert.deepEqual(result, { events: [{ eventId: 'a' }], count: 1 });
});

test('setEventInteraction: PUTs /events/:id/interaction with fresh commandId + level', async () => {
  api.put = spy(async () => ({ eventId: 'evt-1', level: 'interested' }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.setEventInteraction({ eventId: 'evt-1', level: 'interested' });
  assert.equal(api.put.calls.length, 1);
  assert.equal(api.put.calls[0][0], '/events/evt-1/interaction');
  assert.deepEqual(api.put.calls[0][1], { commandId: 'cmd-1', level: 'interested' });
});

test('setEventInteraction: each call gets a new commandId (no persistence)', async () => {
  api.put = spy(async () => ({}));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.setEventInteraction({ eventId: 'e', level: 'interested' });
  await commands.setEventInteraction({ eventId: 'e', level: 'confirmed' });
  assert.equal(api.put.calls[0][1].commandId, 'cmd-1');
  assert.equal(api.put.calls[1][1].commandId, 'cmd-2');
});

test('setEventInteraction: URL-encodes the eventId', async () => {
  api.put = spy(async () => ({}));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.setEventInteraction({ eventId: 'evt/with/slash', level: 'interested' });
  assert.equal(api.put.calls[0][0], '/events/evt%2Fwith%2Fslash/interaction');
});

test('withdrawEventInteraction: DELETEs /events/:id/interaction with fresh commandId', async () => {
  api.delete = spy(async () => ({ eventId: 'evt-1', level: null }));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.withdrawEventInteraction({ eventId: 'evt-1' });
  assert.equal(api.delete.calls.length, 1);
  assert.equal(api.delete.calls[0][0], '/events/evt-1/interaction');
  assert.deepEqual(api.delete.calls[0][1], { commandId: 'cmd-1' });
});

test('scheduleEvent: PUTs /events/:id/schedule with fresh commandId', async () => {
  api.put = spy(async () => ({}));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.scheduleEvent({ eventId: 'evt-1' });
  assert.equal(api.put.calls[0][0], '/events/evt-1/schedule');
  assert.deepEqual(api.put.calls[0][1], { commandId: 'cmd-1' });
});

test('cancelEvent: PUTs /events/:id/cancel with optional reason', async () => {
  api.put = spy(async () => ({}));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.cancelEvent({ eventId: 'evt-1', reason: 'Low turnout' });
  assert.equal(api.put.calls[0][0], '/events/evt-1/cancel');
  assert.deepEqual(api.put.calls[0][1], { commandId: 'cmd-1', reason: 'Low turnout' });
});

test('cancelEvent: omits reason when empty string', async () => {
  api.put = spy(async () => ({}));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.cancelEvent({ eventId: 'evt-1', reason: '' });
  assert.deepEqual(api.put.calls[0][1], { commandId: 'cmd-1' });
});

test('setAutoPlanOnThreshold: PUTs /events/:id/auto-plan with the boolean', async () => {
  api.put = spy(async () => ({}));
  commands = createCommands({ api, storage, makeId: () => `cmd-${++nextId}` });

  await commands.setAutoPlanOnThreshold({ eventId: 'evt-1', autoPlanOnThreshold: true });
  assert.equal(api.put.calls[0][0], '/events/evt-1/auto-plan');
  assert.deepEqual(api.put.calls[0][1], { commandId: 'cmd-1', autoPlanOnThreshold: true });
});
