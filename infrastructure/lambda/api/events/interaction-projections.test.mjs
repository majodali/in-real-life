// Specifications for user-event interaction projections.
//
// Each projection takes one of the InterestExpressed / AttendanceConfirmed
// / AttendanceWithdrawn events on the interaction#<userId>#<eventId>
// aggregate and returns an array of DynamoDB write ops:
//   1. Maintain the interaction state row (irl-interactions)
//   2. Atomic ADD on the event's counters (irl-events)
//
// The previousLevel field on the event data drives count deltas — the
// handler is responsible for reading the current state and stamping it on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectInterestExpressed,
  projectAttendanceConfirmed,
  projectAttendanceWithdrawn,
  projectDebriefSubmitted,
} from './interaction-projections.mjs';

const tables = { eventsTable: 'irl-events-test', interactionsTable: 'irl-interactions-test' };

const interestBase = {
  eventType: 'InterestExpressed',
  version: 1,
  seq: 1,
  aggregateId: 'interaction#user-a#evt-1',
  wallTime: '2026-05-23T10:00:00.000Z',
  data: {
    userId: 'user-a',
    eventId: 'evt-1',
    userName: 'Alex',
    previousLevel: null,
  },
};

const confirmBase = {
  eventType: 'AttendanceConfirmed',
  version: 1,
  seq: 1,
  aggregateId: 'interaction#user-a#evt-1',
  wallTime: '2026-05-23T10:05:00.000Z',
  data: {
    userId: 'user-a',
    eventId: 'evt-1',
    userName: 'Alex',
    previousLevel: null,
  },
};

const withdrawBase = {
  eventType: 'AttendanceWithdrawn',
  version: 1,
  seq: 2,
  aggregateId: 'interaction#user-a#evt-1',
  wallTime: '2026-05-23T10:10:00.000Z',
  data: {
    userId: 'user-a',
    eventId: 'evt-1',
    previousLevel: 'interested',
  },
};

// ─── InterestExpressed ───

test('InterestExpressed first time: Put interaction row + +1 interestCount', () => {
  const writes = projectInterestExpressed(interestBase, tables);
  assert.equal(writes.length, 2);

  const put = writes.find((w) => w.Put);
  assert.ok(put);
  assert.equal(put.Put.TableName, 'irl-interactions-test');
  assert.equal(put.Put.Item.userId, 'user-a');
  assert.equal(put.Put.Item.eventId, 'evt-1');
  assert.equal(put.Put.Item.level, 'interested');
  assert.equal(put.Put.Item.userName, 'Alex');
  assert.equal(put.Put.Item.seq, 1);
  assert.equal(put.Put.Item.updatedAt, '2026-05-23T10:00:00.000Z');
  assert.match(put.Put.ConditionExpression, /attribute_not_exists/);

  const update = writes.find((w) => w.Update);
  assert.equal(update.Update.TableName, 'irl-events-test');
  assert.deepEqual(update.Update.Key, { eventId: 'evt-1' });
  assert.match(update.Update.UpdateExpression, /ADD/);
  assert.match(update.Update.UpdateExpression, /interestCount/);
  assert.equal(update.Update.ExpressionAttributeValues[':interestDelta'], 1);
});

test('InterestExpressed downgrading from confirmed: -1 confirmed, +1 interested, Update interaction row', () => {
  const event = { ...interestBase, seq: 2, data: { ...interestBase.data, previousLevel: 'confirmed' } };
  const writes = projectInterestExpressed(event, tables);

  const interactionUpdate = writes.find((w) => w.Update?.TableName === 'irl-interactions-test');
  assert.ok(interactionUpdate, 'expected Update on interactions table when row exists');
  assert.match(interactionUpdate.Update.UpdateExpression, /SET/);
  assert.match(interactionUpdate.Update.ConditionExpression, /#seq = :prevSeq/);
  assert.equal(interactionUpdate.Update.ExpressionAttributeValues[':level'], 'interested');
  assert.equal(interactionUpdate.Update.ExpressionAttributeValues[':seq'], 2);
  assert.equal(interactionUpdate.Update.ExpressionAttributeValues[':prevSeq'], 1);

  const eventUpdate = writes.find((w) => w.Update?.TableName === 'irl-events-test');
  assert.equal(eventUpdate.Update.ExpressionAttributeValues[':interestDelta'], 1);
  assert.equal(eventUpdate.Update.ExpressionAttributeValues[':confirmedDelta'], -1);
});

test('InterestExpressed when already interested: no count change, Update interaction row only for seq bump', () => {
  const event = { ...interestBase, seq: 2, data: { ...interestBase.data, previousLevel: 'interested' } };
  const writes = projectInterestExpressed(event, tables);
  const eventUpdate = writes.find((w) => w.Update?.TableName === 'irl-events-test');
  // Either no event-table write, or a zero-delta one — both acceptable.
  if (eventUpdate) {
    assert.equal(eventUpdate.Update.ExpressionAttributeValues[':interestDelta'] ?? 0, 0);
    assert.equal(eventUpdate.Update.ExpressionAttributeValues[':confirmedDelta'] ?? 0, 0);
  }
});

// ─── AttendanceConfirmed ───

test('AttendanceConfirmed first time: Put interaction (level=confirmed) + +1 confirmedCount', () => {
  const writes = projectAttendanceConfirmed(confirmBase, tables);

  const put = writes.find((w) => w.Put);
  assert.ok(put);
  assert.equal(put.Put.Item.level, 'confirmed');

  const eventUpdate = writes.find((w) => w.Update?.TableName === 'irl-events-test');
  assert.equal(eventUpdate.Update.ExpressionAttributeValues[':confirmedDelta'], 1);
});

test('AttendanceConfirmed upgrading from interested: +1 confirmed, -1 interested', () => {
  const event = { ...confirmBase, seq: 2, data: { ...confirmBase.data, previousLevel: 'interested' } };
  const writes = projectAttendanceConfirmed(event, tables);
  const eventUpdate = writes.find((w) => w.Update?.TableName === 'irl-events-test');
  assert.equal(eventUpdate.Update.ExpressionAttributeValues[':confirmedDelta'], 1);
  assert.equal(eventUpdate.Update.ExpressionAttributeValues[':interestDelta'], -1);
});

// ─── AttendanceWithdrawn ───

test('AttendanceWithdrawn from interested: -1 interest, Delete interaction row', () => {
  const writes = projectAttendanceWithdrawn(withdrawBase, tables);

  const del = writes.find((w) => w.Delete);
  assert.ok(del);
  assert.equal(del.Delete.TableName, 'irl-interactions-test');
  assert.deepEqual(del.Delete.Key, { userId: 'user-a', eventId: 'evt-1' });

  const eventUpdate = writes.find((w) => w.Update?.TableName === 'irl-events-test');
  assert.equal(eventUpdate.Update.ExpressionAttributeValues[':interestDelta'], -1);
});

test('AttendanceWithdrawn from confirmed: -1 confirmed, Delete interaction row', () => {
  const event = { ...withdrawBase, data: { ...withdrawBase.data, previousLevel: 'confirmed' } };
  const writes = projectAttendanceWithdrawn(event, tables);
  const eventUpdate = writes.find((w) => w.Update?.TableName === 'irl-events-test');
  assert.equal(eventUpdate.Update.ExpressionAttributeValues[':confirmedDelta'], -1);
});

test('AttendanceWithdrawn carries delete condition on matching seq', () => {
  const writes = projectAttendanceWithdrawn(withdrawBase, tables);
  const del = writes.find((w) => w.Delete);
  assert.match(del.Delete.ConditionExpression, /#seq = :prevSeq/);
  assert.equal(del.Delete.ExpressionAttributeValues[':prevSeq'], 1);
});

// ─── DebriefSubmitted ───

const debriefBase = {
  eventType: 'DebriefSubmitted',
  version: 1,
  seq: 3,
  aggregateId: 'interaction#user-a#evt-1',
  wallTime: '2026-06-05T10:00:00.000Z',
  data: {
    userId: 'user-a',
    eventId: 'evt-1',
    rating: 4,
    notes: 'Nice walk, good chat.',
  },
};

test('DebriefSubmitted: Updates interaction row with debrief object + seq', () => {
  const writes = projectDebriefSubmitted(debriefBase, tables);
  assert.equal(writes.length, 1);
  const update = writes[0].Update;
  assert.equal(update.TableName, 'irl-interactions-test');
  assert.deepEqual(update.Key, { userId: 'user-a', eventId: 'evt-1' });
  assert.match(update.UpdateExpression, /debrief = :debrief/);
  assert.match(update.UpdateExpression, /#seq = :seq/);
  const debrief = update.ExpressionAttributeValues[':debrief'];
  assert.equal(debrief.rating, 4);
  assert.equal(debrief.notes, 'Nice walk, good chat.');
  assert.equal(debrief.submittedAt, '2026-06-05T10:00:00.000Z');
});

test('DebriefSubmitted: notes optional', () => {
  const ev = { ...debriefBase, data: { ...debriefBase.data, notes: undefined } };
  const writes = projectDebriefSubmitted(ev, tables);
  const debrief = writes[0].Update.ExpressionAttributeValues[':debrief'];
  assert.equal(debrief.rating, 4);
  assert.equal(debrief.notes, undefined);
});

test('DebriefSubmitted: condition guards prior seq', () => {
  const writes = projectDebriefSubmitted(debriefBase, tables);
  assert.match(writes[0].Update.ConditionExpression, /#seq = :prevSeq/);
  assert.equal(writes[0].Update.ExpressionAttributeValues[':prevSeq'], 2);
});
