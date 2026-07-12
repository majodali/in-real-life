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

test('blank location is fine — proposal floats as an idea without a place', async () => {
  await handleProposeSubmit({ ...valid, location: '  ', commands, showToast, onSuccess, onValidationError });
  assert.equal(commands.proposeEvent.calls.length, 1);
  assert.equal(commands.proposeEvent.calls[0][0].location, undefined);
  assert.equal(onSuccess.calls.length, 1);
});

test('title-only submission floats as a full idea — no time or place sent', async () => {
  await handleProposeSubmit({
    title: 'Anyone into scrabble?',
    commands, showToast, onSuccess, onValidationError,
  });
  const args = commands.proposeEvent.calls[0][0];
  assert.equal(args.title, 'Anyone into scrabble?');
  assert.equal(args.startTime, undefined);
  assert.equal(args.endTime, undefined);
  assert.equal(args.location, undefined);
  assert.equal(onSuccess.calls.length, 1);
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

test('minimumAttendance below 3 rejected (0, 1, 2)', async () => {
  for (const v of [0, 1, 2]) {
    commands.proposeEvent.calls.length = 0;
    onValidationError.calls.length = 0;
    await handleProposeSubmit({
      ...valid, minimumAttendance: v,
      commands, showToast, onSuccess, onValidationError,
    });
    assert.equal(commands.proposeEvent.calls.length, 0, `expected reject for min=${v}`);
    assert.equal(onValidationError.calls[0][0], 'minimumAttendance');
  }
});

test('minimumAttendance=3 accepted (the floor)', async () => {
  await handleProposeSubmit({
    ...valid, minimumAttendance: 3,
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 1);
  assert.equal(commands.proposeEvent.calls[0][0].minimumAttendance, 3);
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
    endTime: '2026-06-01T17:30:00Z',
    location: 'l',
    organizerName: 'n',
    commands, showToast, onSuccess, onValidationError,
  });
  const args = commands.proposeEvent.calls[0][0];
  assert.equal(args.description, undefined);
  assert.equal(args.minimumAttendance, undefined);
});

test('missing endTime: toast + onValidationError(endTime), no API call', async () => {
  await handleProposeSubmit({
    title: 'x',
    startTime: '2026-06-01T16:00:00Z',
    location: 'l',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'endTime');
});

test('timesApproximate passed through to the API (true/false)', async () => {
  await handleProposeSubmit({ ...valid, timesApproximate: true, commands, showToast, onSuccess, onValidationError });
  assert.equal(commands.proposeEvent.calls[0][0].timesApproximate, true);

  commands.proposeEvent.calls.length = 0;
  await handleProposeSubmit({ ...valid, commands, showToast, onSuccess, onValidationError });
  assert.equal(commands.proposeEvent.calls[0][0].timesApproximate, false);
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

// ─── Cost disclosure (D34) + spots ───

test('cost amount + covers travel together; amount alone is rejected', async () => {
  await handleProposeSubmit({
    ...valid, costAmount: '12', costCovers: '',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'costCovers');
});

test('covers without an amount is rejected', async () => {
  await handleProposeSubmit({
    ...valid, costAmount: '', costCovers: 'pizza',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(onValidationError.calls[0][0], 'costAmount');
});

test('a valid cost and spots pass through, numbers coerced', async () => {
  await handleProposeSubmit({
    ...valid, costAmount: '12.5', costCovers: '  pizza  ', maxAttendance: '8',
    commands, showToast, onSuccess, onValidationError,
  });
  const args = commands.proposeEvent.calls[0][0];
  assert.deepEqual(args.cost, { amount: 12.5, covers: 'pizza' });
  assert.equal(args.maxAttendance, 8);
});

test('blank cost and spots are omitted entirely', async () => {
  await handleProposeSubmit({
    ...valid, costAmount: '', costCovers: '', maxAttendance: '',
    commands, showToast, onSuccess, onValidationError,
  });
  const args = commands.proposeEvent.calls[0][0];
  assert.equal(args.cost, undefined);
  assert.equal(args.maxAttendance, undefined);
});

test('spots below the minimum (including custom minimum) are rejected', async () => {
  await handleProposeSubmit({
    ...valid, minimumAttendance: '6', maxAttendance: '5',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'maxAttendance');
});

// ─── External events (D53) + meeting spot (D54) ───

test('external listing requires real time and place', async () => {
  await handleProposeSubmit({
    ...valid, startTime: '', endTime: '', isExternal: true,
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls.length, 0);
  assert.equal(onValidationError.calls[0][0], 'startTime');
});

test('external listing sends source external and drops threshold fields', async () => {
  await handleProposeSubmit({
    ...valid, isExternal: true, minimumAttendance: '4', autoPlanOnThreshold: true,
    commands, showToast, onSuccess, onValidationError,
  });
  const args = commands.proposeEvent.calls[0][0];
  assert.equal(args.source, 'external');
  assert.equal(args.minimumAttendance, undefined);
  assert.equal(args.autoPlanOnThreshold, undefined);
});

test('community proposals send no source and keep threshold fields', async () => {
  await handleProposeSubmit({
    ...valid, minimumAttendance: '4',
    commands, showToast, onSuccess, onValidationError,
  });
  const args = commands.proposeEvent.calls[0][0];
  assert.equal(args.source, undefined);
  assert.equal(args.minimumAttendance, 4);
  assert.equal(args.autoPlanOnThreshold, false);
});

test('meetingSpot is trimmed and omitted when blank', async () => {
  await handleProposeSubmit({
    ...valid, meetingSpot: '  blue scarf  ',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls[0][0].meetingSpot, 'blue scarf');

  commands.proposeEvent.calls.length = 0;
  await handleProposeSubmit({
    ...valid, meetingSpot: '   ',
    commands, showToast, onSuccess, onValidationError,
  });
  assert.equal(commands.proposeEvent.calls[0][0].meetingSpot, undefined);
});
