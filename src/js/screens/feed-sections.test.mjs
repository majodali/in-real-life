// Specifications for feed sectioning (ranking v1 surfacing).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionFeed } from './feed-sections.js';

const evt = (eventId, overrides = {}) => ({
  eventId, effectiveState: 'planned', myLevel: null, ...overrides,
});

test('splits plans / suggested / rest; suggested follows the ranked order', () => {
  const events = [
    evt('e-mine', { myLevel: 'confirmed' }),
    evt('e-b'),
    evt('e-a'),
    evt('e-over', { effectiveState: 'over' }),
  ];
  const { plans, suggested, rest } = sectionFeed(events, ['e-a', 'e-b']);
  assert.deepEqual(plans.map((e) => e.eventId), ['e-mine']);
  assert.deepEqual(suggested.map((e) => e.eventId), ['e-a', 'e-b']);
  assert.deepEqual(rest.map((e) => e.eventId), ['e-over']);
});

test('a cancelled event I was in is never a plan — it lands in rest', () => {
  const { plans, rest } = sectionFeed(
    [evt('e-c', { myLevel: 'confirmed', effectiveState: 'cancelled' })],
    [],
  );
  assert.deepEqual(plans, []);
  assert.equal(rest[0].eventId, 'e-c');
});

test('without recommendations everything keeps the incoming time order in rest', () => {
  const events = [evt('e-1'), evt('e-2')];
  const { plans, suggested, rest } = sectionFeed(events, undefined);
  assert.deepEqual(plans, []);
  assert.deepEqual(suggested, []);
  assert.deepEqual(rest.map((e) => e.eventId), ['e-1', 'e-2']);
});

test('events recommended but absent from the list (full, conflicting) fall to rest', () => {
  const events = [evt('e-full', { full: true })];
  const { rest } = sectionFeed(events, []);
  assert.deepEqual(rest.map((e) => e.eventId), ['e-full']);
});
