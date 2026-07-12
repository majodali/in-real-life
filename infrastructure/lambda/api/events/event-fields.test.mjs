// Specifications for the richer-event-field validators.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCost, validateMaxAttendance, isFull } from './event-fields.mjs';

// ─── cost (D34 disclosure: amount + what it covers, together) ───

test('a valid cost normalises: covers trimmed and bounded', () => {
  const out = validateCost({ amount: 15, covers: '  pizza and the room  ' });
  assert.deepEqual(out, { value: { amount: 15, covers: 'pizza and the room' } });
  const long = validateCost({ amount: 5, covers: 'x'.repeat(300) });
  assert.equal(long.value.covers.length, 120);
});

test('amount without covers (and vice versa) is rejected — disclosure is the point', () => {
  assert.match(validateCost({ amount: 15 }).error, /covers is required/);
  assert.match(validateCost({ amount: 15, covers: '   ' }).error, /covers is required/);
  assert.match(validateCost({ covers: 'pizza' }).error, /amount/);
});

test('non-positive, non-numeric amounts and junk shapes are rejected', () => {
  assert.ok(validateCost({ amount: 0, covers: 'x' }).error);
  assert.ok(validateCost({ amount: -5, covers: 'x' }).error);
  assert.ok(validateCost({ amount: '15', covers: 'x' }).error);
  assert.ok(validateCost({ amount: Infinity, covers: 'x' }).error);
  assert.ok(validateCost('15 dollars').error);
  assert.ok(validateCost(null).error);
  assert.ok(validateCost({ amount: 5, covers: 'x', tip: true }).error);
});

// ─── maxAttendance ───

test('maxAttendance must be an integer at or above the minimum (organizer included)', () => {
  assert.deepEqual(validateMaxAttendance(8, 3), { value: 8 });
  assert.deepEqual(validateMaxAttendance(5, 5), { value: 5 });
  assert.ok(validateMaxAttendance(4, 5).error);
  assert.ok(validateMaxAttendance(2, undefined).error, 'default minimum is 3');
  assert.ok(validateMaxAttendance(7.5, 3).error);
  assert.ok(validateMaxAttendance('8', 3).error);
});

// ─── isFull ───

test('full when member spots (maxAttendance - organizer) are taken', () => {
  assert.equal(isFull({ maxAttendance: 4, confirmedCount: 3 }), true);
  assert.equal(isFull({ maxAttendance: 4, confirmedCount: 4 }), true, 'overshoot still full');
  assert.equal(isFull({ maxAttendance: 4, confirmedCount: 2 }), false);
  assert.equal(isFull({ confirmedCount: 50 }), false, 'no cap → never full');
  assert.equal(isFull({ maxAttendance: 4 }), false, 'no confirmations yet');
});
