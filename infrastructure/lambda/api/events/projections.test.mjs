// Specifications for Event aggregate projections.
//
// Each projection takes an EventProposed/EventScheduled/etc. event and
// returns a DynamoDB write op for the irl-events state row.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectEventProposed } from './projections.mjs';

const proposed = {
  eventType: 'EventProposed',
  version: 1,
  seq: 1,
  aggregateId: 'event#01HXEXAMPLE000000000000000',
  wallTime: '2026-05-19T10:00:00.000Z',
  data: {
    eventId: '01HXEXAMPLE000000000000000',
    source: 'community',
    title: 'Morning coffee & walk',
    description: 'Easy walk along the waterfront, coffee after.',
    startTime: '2026-06-01T16:00:00.000Z',
    endTime: '2026-06-01T17:30:00.000Z',
    location: 'Blackbird Bakery',
    organizerId: 'user-abc',
    organizerName: 'Matthew',
    minimumAttendance: 3,
  },
};

test('projectEventProposed: returns a Put on the events table', () => {
  const write = projectEventProposed(proposed, { eventsTable: 'irl-events-test' });
  assert.ok(write.Put, 'expected a Put op');
  assert.equal(write.Put.TableName, 'irl-events-test');
});

test('projectEventProposed: Item carries the core event fields', () => {
  const item = projectEventProposed(proposed, { eventsTable: 't' }).Put.Item;
  assert.equal(item.eventId, '01HXEXAMPLE000000000000000');
  assert.equal(item.source, 'community');
  assert.equal(item.title, 'Morning coffee & walk');
  assert.equal(item.description, 'Easy walk along the waterfront, coffee after.');
  assert.equal(item.startTime, '2026-06-01T16:00:00.000Z');
  assert.equal(item.endTime, '2026-06-01T17:30:00.000Z');
  assert.equal(item.location, 'Blackbird Bakery');
  assert.equal(item.organizerId, 'user-abc');
  assert.equal(item.organizerName, 'Matthew');
  assert.equal(item.minimumAttendance, 3);
});

test('projectEventProposed: starts in lifecycleState=proposed with zero counts', () => {
  const item = projectEventProposed(proposed, { eventsTable: 't' }).Put.Item;
  assert.equal(item.lifecycleState, 'proposed');
  assert.equal(item.interestCount, 0);
  assert.equal(item.confirmedCount, 0);
});

test('projectEventProposed: timesApproximate defaults to false, carried when set', () => {
  const dflt = projectEventProposed(proposed, { eventsTable: 't' }).Put.Item;
  assert.equal(dflt.timesApproximate, false);
  const approx = projectEventProposed(
    { ...proposed, data: { ...proposed.data, timesApproximate: true } },
    { eventsTable: 't' },
  ).Put.Item;
  assert.equal(approx.timesApproximate, true);
});

test('projectEventProposed: records seq and createdAt from the event envelope', () => {
  const item = projectEventProposed(proposed, { eventsTable: 't' }).Put.Item;
  assert.equal(item.seq, 1);
  assert.equal(item.createdAt, '2026-05-19T10:00:00.000Z');
});

test('projectEventProposed: condition prevents overwriting an existing eventId', () => {
  const write = projectEventProposed(proposed, { eventsTable: 't' });
  assert.match(write.Put.ConditionExpression, /attribute_not_exists/);
  assert.match(write.Put.ConditionExpression, /eventId/);
});

test('projectEventProposed: minimumAttendance omitted from item when not provided', () => {
  const event = { ...proposed, data: { ...proposed.data } };
  delete event.data.minimumAttendance;
  const item = projectEventProposed(event, { eventsTable: 't' }).Put.Item;
  assert.equal(item.minimumAttendance, undefined);
});

test('projectEventProposed: description optional', () => {
  const event = { ...proposed, data: { ...proposed.data } };
  delete event.data.description;
  const item = projectEventProposed(event, { eventsTable: 't' }).Put.Item;
  assert.equal(item.description, undefined);
});
