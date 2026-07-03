import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEffectiveState,
  isOpenForChanges,
  simulatedNowIso,
  CHANGE_OPEN_STATES,
} from './lifecycle-state.mjs';

const NOW = '2026-06-01T12:00:00Z';

// ─── computeEffectiveState ───

test('cancelled stays cancelled regardless of time', () => {
  const row = { lifecycleState: 'cancelled', startTime: '2026-05-01T00:00:00Z', endTime: '2026-05-01T01:00:00Z' };
  assert.equal(computeEffectiveState(row, NOW), 'cancelled');
});

test('proposed stays proposed even past its startTime', () => {
  const row = { lifecycleState: 'proposed', startTime: '2026-05-01T00:00:00Z', endTime: '2026-05-01T01:00:00Z' };
  assert.equal(computeEffectiveState(row, NOW), 'proposed');
});

test('planned in the future stays planned', () => {
  const row = { lifecycleState: 'planned', startTime: '2026-07-01T00:00:00Z', endTime: '2026-07-01T02:00:00Z' };
  assert.equal(computeEffectiveState(row, NOW), 'planned');
});

test('planned currently happening → in-progress', () => {
  const row = { lifecycleState: 'planned', startTime: '2026-06-01T11:00:00Z', endTime: '2026-06-01T13:00:00Z' };
  assert.equal(computeEffectiveState(row, NOW), 'in-progress');
});

test('planned past endTime → over', () => {
  const row = { lifecycleState: 'planned', startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T11:00:00Z' };
  assert.equal(computeEffectiveState(row, NOW), 'over');
});

test('boundary: now exactly at startTime → in-progress', () => {
  const row = { lifecycleState: 'planned', startTime: NOW, endTime: '2026-06-01T14:00:00Z' };
  assert.equal(computeEffectiveState(row, NOW), 'in-progress');
});

test('boundary: now exactly at endTime → over', () => {
  const row = { lifecycleState: 'planned', startTime: '2026-06-01T10:00:00Z', endTime: NOW };
  assert.equal(computeEffectiveState(row, NOW), 'over');
});

test('planned with no endTime → in-progress once startTime passes (no auto-over)', () => {
  const row = { lifecycleState: 'planned', startTime: '2026-06-01T11:00:00Z' };
  assert.equal(computeEffectiveState(row, NOW), 'in-progress');
});

// ─── isOpenForChanges ───

test('isOpenForChanges: true for proposed and planned-in-future', () => {
  assert.equal(isOpenForChanges({ lifecycleState: 'proposed' }, NOW), true);
  assert.equal(
    isOpenForChanges({ lifecycleState: 'planned', startTime: '2026-07-01T00:00:00Z', endTime: '2026-07-01T02:00:00Z' }, NOW),
    true,
  );
});

test('isOpenForChanges: false once in-progress, over, or cancelled', () => {
  assert.equal(
    isOpenForChanges({ lifecycleState: 'planned', startTime: '2026-06-01T11:00:00Z', endTime: '2026-06-01T13:00:00Z' }, NOW),
    false,
  );
  assert.equal(
    isOpenForChanges({ lifecycleState: 'planned', startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T11:00:00Z' }, NOW),
    false,
  );
  assert.equal(isOpenForChanges({ lifecycleState: 'cancelled' }, NOW), false);
});

// ─── CHANGE_OPEN_STATES ───

test('CHANGE_OPEN_STATES is exactly proposed + planned', () => {
  assert.deepEqual([...CHANGE_OPEN_STATES].sort(), ['planned', 'proposed']);
});

// ─── simulatedNowIso ───

test('simulatedNowIso adds the offset to wall time', () => {
  const base = Date.now();
  const iso = simulatedNowIso(60 * 60 * 1000); // +1h
  const delta = new Date(iso).getTime() - base;
  // Allow a little slack for execution time between the two clock reads.
  assert.ok(delta >= 60 * 60 * 1000 - 1000 && delta <= 60 * 60 * 1000 + 1000, `delta was ${delta}`);
});

test('simulatedNowIso with no offset is ~now', () => {
  const iso = simulatedNowIso(0);
  assert.ok(Math.abs(new Date(iso).getTime() - Date.now()) < 1000);
});
