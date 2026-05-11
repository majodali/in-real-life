// Specifications for workshop aggregate projections.
//
// projectWorkshopTimeAdvanced takes a WorkshopTimeAdvanced event and writes
// the new offset to the irl-config workshop-time row. No condition: the
// events-log seq guard upstream prevents concurrent writes; replay applies
// events in order so last-event-wins is correct.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectWorkshopTimeAdvanced } from './projections.mjs';

const sampleEvent = {
  eventType: 'WorkshopTimeAdvanced',
  version: 1,
  seq: 1,
  aggregateId: 'system#workshop-time',
  eventId: '01HX0000000000000000000000',
  wallTime: '2026-05-07T10:00:00.000Z',
  data: {
    action: 'advance',
    requested: { hours: 2 },
    newOffsetMs: 7200000,
    description: 'advanced 2h',
  },
};

test('projectWorkshopTimeAdvanced: returns a Put on the config table', () => {
  const write = projectWorkshopTimeAdvanced(sampleEvent, { configTable: 'irl-config-test' });
  assert.ok(write.Put);
  assert.equal(write.Put.TableName, 'irl-config-test');
});

test('projectWorkshopTimeAdvanced: Item has configKey "workshop-time" and the new offset', () => {
  const item = projectWorkshopTimeAdvanced(sampleEvent, { configTable: 't' }).Put.Item;
  assert.equal(item.configKey, 'workshop-time');
  assert.equal(item.offsetMs, 7200000);
  assert.equal(item.description, 'advanced 2h');
  assert.equal(item.updatedAt, '2026-05-07T10:00:00.000Z');
  assert.equal(item.seq, 1);
  assert.equal(item.eventId, '01HX0000000000000000000000');
});
