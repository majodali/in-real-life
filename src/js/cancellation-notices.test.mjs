// Specifications for in-app cancellation notices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  unseenCancellations,
  noticeMessage,
  readSeen,
  markSeen,
} from './cancellation-notices.js';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

const cancelled = (id, overrides = {}) => ({
  eventId: id,
  title: `Event ${id}`,
  lifecycleState: 'cancelled',
  effectiveState: 'cancelled',
  myLevel: 'confirmed',
  ...overrides,
});

// ─── unseenCancellations ───

test('returns cancelled events the member was committed to and has not seen', () => {
  const events = [
    cancelled('a'),
    cancelled('b', { myLevel: 'interested' }),
    cancelled('c', { myLevel: null }),              // not committed — not theirs to mourn
    cancelled('d', { effectiveState: 'planned', lifecycleState: 'planned' }), // not cancelled
    cancelled('e'),                                  // already seen
  ];
  const out = unseenCancellations(events, ['e']);
  assert.deepEqual(out.map((e) => e.eventId), ['a', 'b']);
});

test('handles empty inputs', () => {
  assert.deepEqual(unseenCancellations([], []), []);
  assert.deepEqual(unseenCancellations(undefined, undefined), []);
});

// ─── noticeMessage ───

test('single cancellation names the event and includes the reason', () => {
  const msg = noticeMessage([cancelled('a', { title: 'Coffee walk', cancellationReason: 'rain' })]);
  assert.match(msg, /“Coffee walk” was cancelled — rain/);
  assert.match(msg, /You'd said you'd be there/);
});

test('multiple cancellations are summarised without individual reasons', () => {
  const msg = noticeMessage([
    cancelled('a', { title: 'Coffee walk', cancellationReason: 'rain' }),
    cancelled('b'),
  ]);
  assert.match(msg, /“Coffee walk” was cancelled \(and 1 more — check your feed\)/);
  assert.doesNotMatch(msg, /rain/);
});

test('returns null for nothing new', () => {
  assert.equal(noticeMessage([]), null);
  assert.equal(noticeMessage(undefined), null);
});

// ─── seen tracking ───

test('readSeen tolerates missing and corrupt storage', () => {
  assert.deepEqual(readSeen(fakeStorage()), []);
  assert.deepEqual(readSeen(fakeStorage({ irl_seen_cancellations: 'not json' })), []);
  assert.deepEqual(readSeen(fakeStorage({ irl_seen_cancellations: '{"a":1}' })), []);
});

test('markSeen merges and deduplicates', () => {
  const storage = fakeStorage();
  markSeen(storage, ['a', 'b']);
  const merged = markSeen(storage, ['b', 'c']);
  assert.deepEqual(merged, ['a', 'b', 'c']);
  assert.deepEqual(readSeen(storage), ['a', 'b', 'c']);
});
