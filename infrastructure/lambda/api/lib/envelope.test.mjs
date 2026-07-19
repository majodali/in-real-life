// Specifications for the envelope vocabulary (D58).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENVELOPE_DIMENSIONS, isValidPosition, isValidEdge, stepToward, adjacencyScore,
} from './envelope.mjs';

test('every dimension has exactly three positions (coarse by design)', () => {
  for (const [dim, def] of Object.entries(ENVELOPE_DIMENSIONS)) {
    assert.equal(def.positions.length, 3, dim);
  }
});

test('position and edge validation', () => {
  assert.equal(isValidPosition('groupSize', 'small'), true);
  assert.equal(isValidPosition('groupSize', 'medium'), false);
  assert.equal(isValidPosition('nope', 'small'), false);
  // Edges point at poles, never the middle
  assert.equal(isValidEdge('groupSize', 'large'), true);
  assert.equal(isValidEdge('groupSize', 'small'), false);
});

test('stepToward moves one step and clamps at the pole', () => {
  assert.equal(stepToward('groupSize', 'intimate', 'large'), 'small');
  assert.equal(stepToward('groupSize', 'small', 'large'), 'large');
  assert.equal(stepToward('groupSize', 'large', 'large'), 'large');
  assert.equal(stepToward('groupSize', 'large', 'intimate'), 'small');
});

test('adjacencyScore: exact 1, adjacent 0.5, opposite 0, unknown null', () => {
  assert.equal(adjacencyScore('structure', 'balanced', 'balanced'), 1);
  assert.equal(adjacencyScore('structure', 'balanced', 'open-conversation'), 0.5);
  assert.equal(adjacencyScore('structure', 'activity-anchored', 'open-conversation'), 0);
  assert.equal(adjacencyScore('structure', undefined, 'balanced'), null);
});

test('the structure shape map covers every position and every shape value', () => {
  const map = ENVELOPE_DIMENSIONS.structure.shapeMap;
  assert.deepEqual(Object.keys(map).sort(), [...ENVELOPE_DIMENSIONS.structure.positions].sort());
  assert.deepEqual(Object.values(map).sort(), ['semi-structured', 'structured', 'unstructured']);
});
