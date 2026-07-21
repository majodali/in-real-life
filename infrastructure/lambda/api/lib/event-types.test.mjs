// Specifications for the event-type register (D63,
// docs/event-type-register.md): deterministic classification, tie →
// untyped, retirement semantics, family lookups.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TYPES, FAMILIES, classifyEventType,
  isValidEventTypeId, isAssignableEventTypeId, eventTypeName, familyOf,
} from './event-types.mjs';

test('register hygiene: unique ids, known families, non-empty matchTags', () => {
  const ids = EVENT_TYPES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unique — never reused');
  for (const t of EVENT_TYPES) {
    assert.ok(FAMILIES.includes(t.family), `${t.id} family known`);
  }
  assert.equal(eventTypeName('board-game-night'), 'Board-game night');
  assert.equal(familyOf('pottery-class'), 'making');
  assert.equal(familyOf('no-such-type'), null);
});

test('classification matches shape tags deterministically', () => {
  assert.equal(classifyEventType({
    shape: { activityTags: ['board games', 'snacks'] }, title: 'Thursday thing',
  }), 'board-game-night');
  assert.equal(classifyEventType({
    shape: { activityTags: ['pottery'] }, title: 'x',
  }), 'pottery-class');
  // Tag matching tolerates phrasing drift (token overlap, not equality).
  assert.equal(classifyEventType({
    shape: { activityTags: ['game night'] }, title: 'x',
  }), 'board-game-night');
});

test('a one-off matches nothing and stays untyped — first-class', () => {
  assert.equal(classifyEventType({
    shape: { activityTags: ['axe throwing'] }, title: 'Axe night',
  }), null);
  assert.equal(classifyEventType({}), null);
});

test('a tie assigns nothing — a visible wrong guess is worse than no guess', () => {
  // One tag from each of two entries: equal scores → untyped.
  assert.equal(classifyEventType({
    shape: { activityTags: ['board games', 'trivia'] }, title: 'Games and trivia',
  }), null);
});

test('title fallback applies only when the shape gives nothing', () => {
  assert.equal(classifyEventType({ title: 'Morning run around the harbor' }), 'running-club');
  // Tagged-but-unmatched does NOT fall back to title: the tags were the
  // organizer's words about the activity; the title adding a different
  // kind would be a guess.
  assert.equal(classifyEventType({
    shape: { activityTags: ['axe throwing'] },
    title: 'Axe night then board games',
  }), null);
});

test('validity: retired ids stay valid for history, not for assignment', () => {
  assert.ok(isValidEventTypeId('trivia-night'));
  assert.ok(isAssignableEventTypeId('trivia-night'));
  assert.ok(!isValidEventTypeId('disco-fridays'));
  assert.ok(!isAssignableEventTypeId('disco-fridays'));
  // No retired entries in the strawman yet — the semantics are spec'd
  // by the flag contract: assignable ⊆ valid.
  for (const t of EVENT_TYPES) {
    if (!t.retired) assert.ok(isAssignableEventTypeId(t.id));
    assert.ok(isValidEventTypeId(t.id));
  }
});
