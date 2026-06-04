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
