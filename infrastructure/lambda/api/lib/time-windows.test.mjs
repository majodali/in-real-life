// Specifications for the time-window vocabulary (D62).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIME_WINDOWS, isValidTimeWindow, windowOf } from './time-windows.mjs';

const TZ = 'America/Los_Angeles';

test('four coarse windows, closed vocabulary', () => {
  assert.equal(TIME_WINDOWS.length, 4);
  assert.ok(isValidTimeWindow('weekday-evening'));
  assert.ok(!isValidTimeWindow('weekday-evenings'), 'legacy free text is not a slug');
});

test('classification runs in the community clock, not UTC', () => {
  // 2026-07-22 is a Wednesday. 02:00 UTC on the 23rd = 19:00 PDT on the
  // 22nd — a weekday EVENING locally, though it's Thursday morning UTC.
  assert.equal(windowOf('2026-07-23T02:00:00.000Z', TZ), 'weekday-evening');
  // 17:00 UTC Wednesday = 10:00 PDT — weekday daytime.
  assert.equal(windowOf('2026-07-22T17:00:00.000Z', TZ), 'weekday-daytime');
  // Saturday 19:00 PDT.
  assert.equal(windowOf('2026-07-26T02:00:00.000Z', TZ), 'weekend-evening');
  // Sunday 10:00 PDT.
  assert.equal(windowOf('2026-07-26T17:00:00.000Z', TZ), 'weekend-daytime');
});

test('the evening boundary is 17:00 local', () => {
  // Wednesday 16:59 PDT vs 17:00 PDT.
  assert.equal(windowOf('2026-07-22T23:59:00.000Z', TZ), 'weekday-daytime');
  assert.equal(windowOf('2026-07-23T00:00:00.000Z', TZ), 'weekday-evening');
});

test('unparseable input classifies as null, never throws', () => {
  assert.equal(windowOf(undefined, TZ), null);
  assert.equal(windowOf('not a date', TZ), null);
});
