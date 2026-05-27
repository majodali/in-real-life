// Specifications for the propose-event submit handler.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleProposeSubmit } from './propose-handlers.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

let commands, showToast, onSuccess, onValidationError;

beforeEach(() => {
  commands = { proposeEvent: spy(async () => ({ eventId: 'evt-1' })) };
  showToast = spy(() => {});
  onSuccess = spy(() => {});
  onValidationError = spy(() => {});
});

const valid = {
  title: 'Coffee walk',
  description: 'Easy walk',
  startTime: '2026-06-01T16:00:00.000Z',
  endTime: '2026-06-01T17:30:00.000Z',
  location: 'Blackbird Bakery',
  organizerName: 'Matthew',
};

// ─── Validation ───

test('blank title: toast + onValidationError(title), no API call', async () => {
  await handleProposeSubmit({ ...valid, title: '   ', commands, showToast, onSuccess, onValidationError });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'title');
  assert.equal(showToast.calls.length, 1);
});

test('missing startTime: toast + onValidationError(startTime)', async () => {
  await handleProposeSubmit({ ...valid, startTime: '', commands, showToast, onSuccess, onValidationError });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'startTime');
});

test('blank location: toast + onValidationError(location)', async () => {
  await handleProposeSubmit({ ...valid, location: '  ', commands, showToast, onSuccess, onValidationError });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'location');
});

test('unparseable startTime: toast + onValidationError(startTime)', async () => {
  await handleProposeSubmit({ ...valid, startTime: 'not a date', commands, showToast, onSuccess, onValidationError });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'startTime');
});

test('endTime before startTime: toast + onValidationError(endTime)', async () => {
  await handleProposeSubmit({
    ...valid,
    startTime: '2026-06-01T18:00:00Z',
    endTime: '2026-06-01T17:00:00Z',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'endTime');
});

test('minimumAttendance not a positive integer: toast + onValidationError', async () => {
  await handleProposeSubmit({
    ...valid, minimumAttendance: 'three',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'minimumAttendance');
});

test('minimumAttendance=0 rejected', async () => {
  await handleProposeSubmit({
    ...valid, minimumAttendance: 0,
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 0);
});

// ─── Happy paths ───

test('full happy path: trims strings, normalises datetimes, calls onSuccess', async () => {
  await handleProposeSubmit({
    title: '  Coffee walk  ',
    description: '  Easy walk  ',
    startTime: '2026-06-01T16:00:00Z',
    endTime: '2026-06-01T17:30:00Z',
    location: '  Blackbird Bakery  ',
    organizerName: '  Matthew  ',
    minimumAttendance: 3,
    commands, showToast, onSuccess, onValidationError,
  });

  assert.equal(commands.proposeEvent.calls.length, 1);
  const args = commands.proposeEvent.calls[0][0];
  assert.equal(args.title, 'Coffee walk');
  assert.equal(args.description, 'Easy walk');
  assert.equal(args.startTime, '2026-06-01T16:00:00.000Z');
  assert.equal(args.endTime, '2026-06-01T17:30:00.000Z');
  assert.equal(args.location, 'Blackbird Bakery');
  assert.equal(args.organizerName, 'Matthew');
  assert.equal(args.minimumAttendance, 3);
  assert.equal(onSuccess.calls.length, 1);
  assert.deepEqual(onSuccess.calls[0][0], { eventId: 'evt-1' });
});

test('optional fields omitted from the API call when blank', async () => {
  await handleProposeSubmit({
    title: 'x',
    startTime: '2026-06-01T16:00:00Z',
    location: 'l',
    organizerName: 'n',
    commands, showToast, onSuccess, onValidationError,
  });
  const args = commands.proposeEvent.calls[0][0];
  assert.equal(args.description, undefined);
  assert.equal(args.endTime, undefined);
  assert.equal(args.minimumAttendance, undefined);
});

test('on API error: toast, no onSuccess', async () => {
  commands.proposeEvent = spy(async () => { throw new Error('boom'); });
  await handleProposeSubmit({ ...valid, commands, showToast, onSuccess, onValidationError });
  assert.equal(onSuccess.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});

test('accepts a local datetime string like a <input type=datetime-local> value', async () => {
  await handleProposeSubmit({
    ...valid,
    startTime: '2026-06-01T16:00',
    endTime: '2026-06-01T17:30',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 1);
  const args = commands.proposeEvent.calls[0][0];
  // ISO output (timezone-converted) — just verify it's an ISO string
  assert.match(args.startTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(args.endTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});
