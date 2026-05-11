// Specifications for the projection registry/dispatcher.
//
// A projector maps eventType → projection function, where each projection
// turns an event into one or more DynamoDB write ops suitable for inclusion
// in a TransactWriteItems request. Used by:
//   - the command path: route handlers project events to get stateWrites
//   - the replay path: tooling reads events from the log and dispatches
//     them through the same projections to rebuild state tables.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjector } from './projection.mjs';

test('returns the write op produced by the registered projection for the event type', () => {
  const registry = {
    UserRegistered: (event) => ({
      Put: { TableName: 'users', Item: { userId: event.data.userId } },
    }),
  };
  const projector = createProjector({ registry });

  const writes = projector.applyToOne({
    eventType: 'UserRegistered',
    data: { userId: 'abc' },
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].Put.Item.userId, 'abc');
});

test('passes the tables config to the projection function', () => {
  const registry = {
    UserRegistered: (event, tables) => ({
      Put: { TableName: tables.usersTable, Item: { userId: event.data.userId } },
    }),
  };
  const projector = createProjector({
    registry,
    tables: { usersTable: 'irl-users-test' },
  });

  const writes = projector.applyToOne({
    eventType: 'UserRegistered',
    data: { userId: 'a' },
  });

  assert.equal(writes[0].Put.TableName, 'irl-users-test');
});

test('throws when no projection is registered for an event type', () => {
  const projector = createProjector({ registry: {} });
  assert.throws(
    () => projector.applyToOne({ eventType: 'Mystery', data: {} }),
    /no projection.*Mystery/i,
  );
});

test('applyTo concatenates writes from multiple events in order', () => {
  const registry = {
    A: (e) => ({ Put: { TableName: 't', Item: { id: 'a-' + e.data.x } } }),
    B: (e) => ({ Put: { TableName: 't', Item: { id: 'b-' + e.data.x } } }),
  };
  const projector = createProjector({ registry });

  const writes = projector.applyTo([
    { eventType: 'A', data: { x: 1 } },
    { eventType: 'B', data: { x: 2 } },
    { eventType: 'A', data: { x: 3 } },
  ]);

  assert.deepEqual(
    writes.map(w => w.Put.Item.id),
    ['a-1', 'b-2', 'a-3'],
  );
});

test('a projection may return an array for events that produce multiple writes', () => {
  const registry = {
    Multi: () => [
      { Put: { TableName: 't1', Item: { id: 1 } } },
      { Update: { TableName: 't2', Key: { id: 2 }, UpdateExpression: 'SET x = :x', ExpressionAttributeValues: { ':x': 1 } } },
    ],
  };
  const projector = createProjector({ registry });

  const writes = projector.applyToOne({ eventType: 'Multi', data: {} });

  assert.equal(writes.length, 2);
  assert.ok(writes[0].Put);
  assert.ok(writes[1].Update);
});

test('a projection may return null to indicate an audit-only event with no state effect', () => {
  const registry = { Auditing: () => null };
  const projector = createProjector({ registry });

  const writes = projector.applyToOne({ eventType: 'Auditing', data: {} });

  assert.deepEqual(writes, []);
});

test('applyTo on an empty list returns an empty array', () => {
  const projector = createProjector({ registry: {} });
  assert.deepEqual(projector.applyTo([]), []);
});
