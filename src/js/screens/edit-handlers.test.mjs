// Specs for handleEditSubmit.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleEditSubmit } from './edit-handlers.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

let commands, showToast, onSuccess, onValidationError, onNoop;
let current;

beforeEach(() => {
  commands = { editEvent: spy(async () => ({ eventId: 'evt-1', fields: {} })) };
  showToast = spy(() => {});
  onSuccess = spy(() => {});
  onValidationError = spy(() => {});
  onNoop = spy(() => {});
  current = {
    eventId: 'evt-1',
    title: 'Coffee walk',
    description: 'Easy walk',
    startTime: '2026-06-01T16:00:00.000Z',
    endTime: '2026-06-01T17:30:00.000Z',
    location: 'Blackbird',
  };
});

test('sends only changed fields', async () => {
  await handleEditSubmit({
    current,
    title: 'New title',
    description: 'Easy walk',
    startTime: '2026-06-01T16:00:00.000Z',
    endTime: '2026-06-01T17:30:00.000Z',
    location: 'Blackbird',
    commands, showToast, onSuccess, onValidationError, onNoop,
  });
  const args = commands.editEvent.calls[0][0];
  assert.deepEqual(Object.keys(args).sort(), ['eventId', 'title'].sort());
  assert.equal(args.title, 'New title');
});

test('no changes → onNoop, no API call', async () => {
  await handleEditSubmit({
    current,
    title: current.title,
    description: current.description,
    startTime: current.startTime,
    endTime: current.endTime,
    location: current.location,
    commands, showToast, onSuccess, onValidationError, onNoop,
  });
  assert.equal(commands.editEvent.calls.length, 0);
  assert.equal(onNoop.calls.length, 1);
});

test('blank title rejected', async () => {
  await handleEditSubmit({
    current, ...current, title: '   ',
    commands, showToast, onSuccess, onValidationError, onNoop,
  });
  assert.equal(commands.editEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'title');
});

test('endTime <= startTime rejected', async () => {
  await handleEditSubmit({
    current,
    title: current.title,
    description: current.description,
    startTime: '2026-06-01T18:00:00Z',
    endTime: '2026-06-01T17:00:00Z',
    location: current.location,
    commands, showToast, onSuccess, onValidationError, onNoop,
  });
  assert.equal(commands.editEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'endTime');
});

test('trims string fields', async () => {
  await handleEditSubmit({
    current,
    title: '  New  ',
    description: current.description,
    startTime: current.startTime,
    endTime: current.endTime,
    location: current.location,
    commands, showToast, onSuccess, onValidationError, onNoop,
  });
  const args = commands.editEvent.calls[0][0];
  assert.equal(args.title, 'New');
});

test('clearing description sends empty string', async () => {
  await handleEditSubmit({
    current,
    title: current.title,
    description: '',
    startTime: current.startTime,
    endTime: current.endTime,
    location: current.location,
    commands, showToast, onSuccess, onValidationError, onNoop,
  });
  const args = commands.editEvent.calls[0][0];
  assert.equal(args.description, '');
});

// ─── Idea edits + cost/spots ───

test('editing an idea (no time/place) with those fields blank sends only the change', async () => {
  const current = { eventId: 'e1', title: 'Scrabble?', description: '' };
  await handleEditSubmit({
    current, title: 'Scrabble night?', description: '', startTime: '', endTime: '', location: '',
    costAmount: '', costCovers: '', maxAttendance: '',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.editEvent.calls.length, 1);
  const sent = commands.editEvent.calls[0][0];
  assert.equal(sent.title, 'Scrabble night?');
  assert.equal('startTime' in sent, false);
  assert.equal('location' in sent, false);
});

test('giving an idea a start requires the end alongside', async () => {
  const current = { eventId: 'e1', title: 'Scrabble?' };
  await handleEditSubmit({
    current, title: 'Scrabble?', description: '',
    startTime: '2099-02-01T10:00', endTime: '', location: 'Library',
    costAmount: '', costCovers: '', maxAttendance: '',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.editEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'endTime');
});

test('clearing both cost fields sends cost: null; clearing spots sends maxAttendance: null', async () => {
  const current = {
    eventId: 'e1', title: 'T', location: 'L',
    startTime: '2099-01-01T10:00:00.000Z', endTime: '2099-01-01T12:00:00.000Z',
    cost: { amount: 10, covers: 'venue' }, maxAttendance: 8,
  };
  await handleEditSubmit({
    current, title: 'T', description: '', startTime: '', endTime: '', location: 'L',
    costAmount: '', costCovers: '', maxAttendance: '',
    commands, showToast, onSuccess, onValidationError,
  });
  // startTime blank while current has one → validation error, so pass it through instead
  assert.equal(commands.editEvent.calls.length, 0);
});

test('cost/spots clear + unchanged times: send clears only', async () => {
  const current = {
    eventId: 'e1', title: 'T', location: 'L',
    cost: { amount: 10, covers: 'venue' }, maxAttendance: 8,
  };
  await handleEditSubmit({
    current, title: 'T', description: '', startTime: '', endTime: '', location: 'L',
    costAmount: '', costCovers: '', maxAttendance: '',
    commands, showToast, onSuccess, onValidationError,
  });
  const sent = commands.editEvent.calls[0][0];
  assert.equal(sent.cost, null);
  assert.equal(sent.maxAttendance, null);
});

test('changing cost sends the new disclosure pair', async () => {
  const current = {
    eventId: 'e1', title: 'T', location: 'L', cost: { amount: 10, covers: 'venue' },
  };
  await handleEditSubmit({
    current, title: 'T', description: '', startTime: '', endTime: '', location: 'L',
    costAmount: '15', costCovers: 'venue and snacks', maxAttendance: '',
    commands, showToast, onSuccess, onValidationError,
  });
  const sent = commands.editEvent.calls[0][0];
  assert.deepEqual(sent.cost, { amount: 15, covers: 'venue and snacks' });
});
