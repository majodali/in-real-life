// Specifications for the notify-list projection.
//
// We don't keep a state row for notify-list submissions — the event log is
// the source of truth. The projection is therefore audit-only: it returns
// null so the projector emits no DynamoDB writes for the state table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectLocationNotifyRequested } from './projections.mjs';

const sampleEvent = {
  eventType: 'LocationNotifyRequested',
  version: 1,
  seq: 1,
  aggregateId: 'notify#somebody@example.test',
  wallTime: '2026-05-10T12:00:00.000Z',
  data: {
    email: 'somebody@example.test',
    postalCode: '94110',
    country: 'US',
  },
};

test('projectLocationNotifyRequested: returns null (audit-only)', () => {
  const out = projectLocationNotifyRequested(sampleEvent, { /* no tables needed */ });
  assert.equal(out, null);
});
