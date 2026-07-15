// Specifications for event-shape extraction + normalization
// (docs/event-shape-prompt.md, D56).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShape, extractEventShape, EVENT_SHAPE_SCHEMA } from './event-shape.mjs';
import { createStubLlmProvider, stubEventShape } from '../lib/llm.mjs';

// ─── normalizeShape ───

test('normalizes tags: lowercase, collapsed punctuation, deduped, capped at 5', () => {
  const { value, error } = normalizeShape({
    activityTags: ['Board  Games!', 'board games', 'POTTERY', '', '  ', 'a', 'b', 'c', 'd'],
    structure: 'structured',
    doors: ['connect', 'connect'],
  });
  assert.equal(error, undefined);
  assert.deepEqual(value.activityTags, ['board games', 'pottery', 'a', 'b', 'c']);
  assert.deepEqual(value.doors, ['connect']);
  assert.equal('source' in value, false); // callers stamp provenance
});

test('rejects bad shapes with specific errors', () => {
  assert.match(normalizeShape('text').error, /must be an object/);
  assert.match(normalizeShape({ activityTags: 'x', structure: 'structured', doors: [] }).error, /activityTags/);
  assert.match(normalizeShape({ activityTags: [], structure: 'loose', doors: [] }).error, /structure/);
  assert.match(normalizeShape({ activityTags: [], structure: 'structured', doors: ['fun'] }).error, /doors/);
});

// ─── extractEventShape ───

test('extraction calls the seam with title + description and stamps source extracted', async () => {
  const seen = [];
  const llm = {
    complete: async (req) => {
      seen.push(req);
      return { activityTags: ['Trail Walk'], structure: 'semi-structured', doors: ['connect'] };
    },
  };
  const shape = await extractEventShape({
    llm, title: 'Saturday walk', description: 'easy loop, coffee after',
  });
  assert.equal(seen[0].task, 'event-shape');
  assert.equal(seen[0].schema, EVENT_SHAPE_SCHEMA);
  assert.match(seen[0].messages[0].content, /^TITLE: Saturday walk$/m);
  assert.match(seen[0].messages[0].content, /^DESCRIPTION: easy loop/m);
  assert.deepEqual(shape, {
    activityTags: ['trail walk'],
    structure: 'semi-structured',
    doors: ['connect'],
    source: 'extracted',
  });
});

test('extraction failure yields undefined — provider error and invalid output alike', async () => {
  assert.equal(await extractEventShape({
    llm: { complete: async () => { throw new Error('down'); } },
    title: 'x',
  }), undefined);
  assert.equal(await extractEventShape({
    llm: { complete: async () => ({ activityTags: [], structure: 'nope', doors: [] }) },
    title: 'x',
  }), undefined);
});

test('missing description is sent as (none)', async () => {
  const seen = [];
  const llm = {
    complete: async (req) => {
      seen.push(req);
      return { activityTags: [], structure: 'unstructured', doors: [] };
    },
  };
  await extractEventShape({ llm, title: 'Coffee' });
  assert.match(seen[0].messages[0].content, /^DESCRIPTION: \(none\)$/m);
});

// ─── The workshop/test stub (D37) ───

test('stub provider yields a deterministic, valid shape derived from the title', async () => {
  const llm = createStubLlmProvider();
  const shape = await extractEventShape({
    llm, title: 'Board games night', description: 'bring a favourite',
  });
  assert.deepEqual(shape, {
    activityTags: ['board', 'games'],
    structure: 'semi-structured',
    doors: ['connect'],
    source: 'extracted',
  });
  // And the raw stub output passes its own schema's normalization
  const { error } = normalizeShape(stubEventShape({
    messages: [{ role: 'user', content: 'TITLE: Pottery intro\nDESCRIPTION: (none)' }],
  }));
  assert.equal(error, undefined);
});
