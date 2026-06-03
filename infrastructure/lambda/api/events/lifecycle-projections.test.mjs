// Specifications for lifecycle-transition projections on event#<id>.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectEventScheduled,
  projectEventCancelled,
  projectEventAutoPlanSettingChanged,
} from './lifecycle-projections.mjs';

const tables = { eventsTable: 'irl-events-test' };

const scheduledBase = {
  eventType: 'EventScheduled',
  version: 1,
  seq: 2,
  aggregateId: 'event#evt-1',
  wallTime: '2026-06-01T10:00:00.000Z',
  data: { eventId: 'evt-1', scheduledBy: 'organizer', autoTriggered: false },
};

const cancelledBase = {
  eventType: 'EventCancelled',
  version: 1,
  seq: 3,
  aggregateId: 'event#evt-1',
  wallTime: '2026-06-02T10:00:00.000Z',
  data: { eventId: 'evt-1', cancelledBy: 'organizer', reason: 'low interest' },
};

const autoPlanBase = {
  eventType: 'EventAutoPlanSettingChanged',
  version: 1,
  seq: 2,
  aggregateId: 'event#evt-1',
  wallTime: '2026-06-01T11:00:00.000Z',
  data: { eventId: 'evt-1', autoPlanOnThreshold: true },
};

// ─── EventScheduled ───

test('EventScheduled: Updates the event row to lifecycleState=planned', () => {
  const write = projectEventScheduled(scheduledBase, tables);
  assert.ok(write.Update);
  assert.equal(write.Update.TableName, 'irl-events-test');
  assert.deepEqual(write.Update.Key, { eventId: 'evt-1' });
  assert.match(write.Update.UpdateExpression, /lifecycleState/);
  assert.equal(write.Update.ExpressionAttributeValues[':state'], 'planned');
  assert.equal(write.Update.ExpressionAttributeValues[':seq'], 2);
});

test('EventScheduled: rejects unless prior seq is one less', () => {
  const write = projectEventScheduled(scheduledBase, tables);
  assert.match(write.Update.ConditionExpression, /#seq = :prevSeq/);
  assert.equal(write.Update.ExpressionAttributeValues[':prevSeq'], 1);
});

test('EventScheduled: also rejects if already planned/cancelled (must be proposed)', () => {
  const write = projectEventScheduled(scheduledBase, tables);
  assert.match(write.Update.ConditionExpression, /lifecycleState = :proposed/);
  assert.equal(write.Update.ExpressionAttributeValues[':proposed'], 'proposed');
});

test('EventScheduled: records who/how + scheduledAt', () => {
  const write = projectEventScheduled(scheduledBase, tables);
  const v = write.Update.ExpressionAttributeValues;
  assert.equal(v[':scheduledBy'], 'organizer');
  assert.equal(v[':autoTriggered'], false);
  assert.equal(v[':scheduledAt'], '2026-06-01T10:00:00.000Z');
});

// ─── EventCancelled ───

test('EventCancelled: Updates the event row to lifecycleState=cancelled', () => {
  const write = projectEventCancelled(cancelledBase, tables);
  assert.match(write.Update.UpdateExpression, /lifecycleState/);
  assert.equal(write.Update.ExpressionAttributeValues[':state'], 'cancelled');
});

test('EventCancelled: rejects unless prior seq matches and not already cancelled', () => {
  const write = projectEventCancelled(cancelledBase, tables);
  assert.match(write.Update.ConditionExpression, /#seq = :prevSeq/);
  assert.match(write.Update.ConditionExpression, /lifecycleState <> :cancelled/);
  assert.equal(write.Update.ExpressionAttributeValues[':prevSeq'], 2);
  assert.equal(write.Update.ExpressionAttributeValues[':cancelled'], 'cancelled');
});

test('EventCancelled: records who and reason', () => {
  const write = projectEventCancelled(cancelledBase, tables);
  const v = write.Update.ExpressionAttributeValues;
  assert.equal(v[':cancelledBy'], 'organizer');
  assert.equal(v[':reason'], 'low interest');
  assert.equal(v[':cancelledAt'], '2026-06-02T10:00:00.000Z');
});

test('EventCancelled: reason omitted from payload (still cancels)', () => {
  const event = { ...cancelledBase, data: { eventId: 'evt-1', cancelledBy: 'organizer' } };
  const write = projectEventCancelled(event, tables);
  const v = write.Update.ExpressionAttributeValues;
  assert.equal(v[':reason'] ?? null, null);
});

// ─── EventAutoPlanSettingChanged ───

test('EventAutoPlanSettingChanged: Updates autoPlanOnThreshold + seq', () => {
  const write = projectEventAutoPlanSettingChanged(autoPlanBase, tables);
  assert.match(write.Update.UpdateExpression, /autoPlanOnThreshold/);
  assert.equal(write.Update.ExpressionAttributeValues[':autoPlan'], true);
  assert.equal(write.Update.ExpressionAttributeValues[':seq'], 2);
  assert.equal(write.Update.ExpressionAttributeValues[':prevSeq'], 1);
});

test('EventAutoPlanSettingChanged: requires current state proposed', () => {
  // The toggle is only meaningful while proposed — once planned or cancelled
  // the auto-plan flag stops mattering.
  const write = projectEventAutoPlanSettingChanged(autoPlanBase, tables);
  assert.match(write.Update.ConditionExpression, /lifecycleState = :proposed/);
});
