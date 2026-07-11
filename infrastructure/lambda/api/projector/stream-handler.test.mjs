// Specifications for the Streams → projector adapter.
//
// Uses the real @aws-sdk/util-dynamodb unmarshall against marshalled
// fixtures, so the AttributeValue unwrapping is exercised for real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { createStreamHandler } from './stream-handler.mjs';

function record({ eventName = 'INSERT', sequenceNumber = '100', event }) {
  return {
    eventName,
    dynamodb: {
      SequenceNumber: sequenceNumber,
      ...(event && { NewImage: marshall(event, { removeUndefinedValues: true }) }),
    },
  };
}

const EVENT = {
  aggregateId: 'user#abc',
  seq: 3,
  eventId: '01E',
  eventType: 'OnboardingCompleted',
  simulatedTime: '2026-07-11T10:00:00.000Z',
  data: { userId: 'abc' },
};

test('unmarshalls INSERT records and applies them to every projector in order', async () => {
  const applied = [];
  const handler = createStreamHandler({
    projectors: [
      { applyEvent: async (e) => applied.push(['a', e.eventId, e.seq]) },
      { applyEvent: async (e) => applied.push(['b', e.eventId, e.seq]) },
    ],
    unmarshall,
  });

  const out = await handler({ Records: [record({ event: EVENT })] });

  assert.deepEqual(out, { batchItemFailures: [] });
  assert.deepEqual(applied, [['a', '01E', 3], ['b', '01E', 3]]);
});

test('skips MODIFY/REMOVE records and records without a new image', async () => {
  const applied = [];
  const handler = createStreamHandler({
    projectors: [{ applyEvent: async (e) => applied.push(e.eventId) }],
    unmarshall,
  });

  await handler({
    Records: [
      record({ eventName: 'MODIFY', event: EVENT }),
      record({ eventName: 'REMOVE', event: EVENT }),
      record({ eventName: 'INSERT' }), // no NewImage
    ],
  });
  assert.deepEqual(applied, []);
});

test('a failing record is reported and later records are left for the retry', async () => {
  const applied = [];
  const handler = createStreamHandler({
    projectors: [{
      applyEvent: async (e) => {
        if (e.eventId === 'poison') throw new Error('boom');
        applied.push(e.eventId);
      },
    }],
    unmarshall,
  });

  const out = await handler({
    Records: [
      record({ sequenceNumber: '1', event: { ...EVENT, eventId: 'ok-1' } }),
      record({ sequenceNumber: '2', event: { ...EVENT, eventId: 'poison' } }),
      record({ sequenceNumber: '3', event: { ...EVENT, eventId: 'ok-2' } }),
    ],
  });

  assert.deepEqual(out.batchItemFailures, [{ itemIdentifier: '2' }]);
  assert.deepEqual(applied, ['ok-1']);
});

test('an empty or missing Records list is a clean no-op', async () => {
  const handler = createStreamHandler({ projectors: [], unmarshall });
  assert.deepEqual(await handler({}), { batchItemFailures: [] });
  assert.deepEqual(await handler({ Records: [] }), { batchItemFailures: [] });
});
