// Specifications for the event time-overlap test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsOverlap } from './overlap.mjs';

const at = (start, end) => ({
  startTime: `2026-06-01T${start}:00.000Z`,
  endTime: `2026-06-01T${end}:00.000Z`,
});

test('intersecting intervals overlap, in both directions', () => {
  assert.equal(eventsOverlap(at('16:00', '18:00'), at('17:00', '19:00')), true);
  assert.equal(eventsOverlap(at('17:00', '19:00'), at('16:00', '18:00')), true);
  assert.equal(eventsOverlap(at('16:00', '18:00'), at('16:30', '17:00')), true, 'containment');
});

test('back-to-back events do not overlap (half-open intervals)', () => {
  assert.equal(eventsOverlap(at('16:00', '17:00'), at('17:00', '18:00')), false);
});

test('disjoint intervals do not overlap', () => {
  assert.equal(eventsOverlap(at('10:00', '11:00'), at('16:00', '17:00')), false);
});

test('events without a full time pair (ideas) never overlap anything', () => {
  const timed = at('16:00', '18:00');
  assert.equal(eventsOverlap({ startTime: timed.startTime }, timed), false);
  assert.equal(eventsOverlap({}, timed), false);
  assert.equal(eventsOverlap(timed, { endTime: timed.endTime }), false);
  assert.equal(eventsOverlap(null, timed), false);
});
