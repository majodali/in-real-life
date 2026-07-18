// Specifications for the local AttributeValue unmarshaller.
//
// The contract is equivalence with @aws-sdk/util-dynamodb for everything
// our event-log records can contain — the real package IS available to
// tests (node_modules), it's only the unbundled Lambda runtime that
// lacks it. marshall(x) → unmarshallImage → deepEqual(x) pins that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { unmarshallImage } from './dynamo-unmarshall.mjs';

test('round-trips a representative event-log record identically to util-dynamodb', () => {
  const logItem = {
    aggregateId: 'user#abc',
    seq: 3,
    eventId: '01TEST',
    eventType: 'DebriefSubmitted',
    version: 1,
    wallTime: '2026-07-15T10:00:00.000Z',
    simulatedTime: '2026-07-15T10:00:00.000Z',
    traceId: null,
    data: {
      userId: 'abc',
      attended: true,
      count: 2.5,
      nested: { deep: [{ a: 1 }, 'two', false, null] },
      tags: ['x', 'y'],
      encrypted: 'v1:aaa:bbb:ccc',
    },
  };
  const image = marshall(logItem, { removeUndefinedValues: true });
  assert.deepEqual(unmarshallImage(image), unmarshall(image));
  assert.deepEqual(unmarshallImage(image), logItem);
});

test('covers the set types and rejects unknown AttributeValue shapes', () => {
  assert.deepEqual(
    unmarshallImage({ s: { SS: ['a', 'b'] }, n: { NS: ['1', '2.5'] } }),
    { s: ['a', 'b'], n: [1, 2.5] },
  );
  assert.throws(() => unmarshallImage({ bad: { XX: 'nope' } }), /unsupported AttributeValue/);
  assert.throws(() => unmarshallImage({ bad: 'not-an-av' }), /not an AttributeValue/);
});

test('empty and missing images unmarshall to empty objects', () => {
  assert.deepEqual(unmarshallImage({}), {});
  assert.deepEqual(unmarshallImage(undefined), {});
});
