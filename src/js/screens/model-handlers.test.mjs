// Specifications for the "How we understand you" view-model (D59).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENVELOPE_VIEW, envelopeRows, chipLists, handleModelLoad, handleCorrection,
} from './model-handlers.js';

test('every view dimension offers exactly its three positions as choices', () => {
  const rows = envelopeRows({});
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.equal(row.positionChoices.length, 3);
    assert.equal(row.position, undefined, 'unplaced by default');
    assert.ok(row.title);
  }
});

test('a placed dimension carries its label, story, edge, and source', () => {
  const rows = envelopeRows({
    groupSize: {
      position: 'small',
      edgeToward: 'large',
      source: 'you told us',
      latestObservation: 'the bigger room worked',
    },
    familiarity: { comfort: 'warms up slowly', source: "we've noticed" },
  });
  const groupSize = rows.find((r) => r.dimension === 'groupSize');
  assert.equal(groupSize.positionLabel, 'a small group (5–8)');
  assert.equal(groupSize.edgeLabel, 'a bigger group (9+)');
  assert.equal(groupSize.source, 'you told us');
  assert.equal(groupSize.story, 'the bigger room worked');

  const familiarity = rows.find((r) => r.dimension === 'familiarity');
  assert.equal(familiarity.story, 'warms up slowly', 'comfort text is the fallback story');
});

test('chip lists carry provenance and typed corrections for removables', () => {
  const chips = chipLists({
    doors: [{ door: 'connect', source: 'you told us' }],
    interests: [{ tag: 'pottery', source: 'you told us' }],
    strengths: [{ what: 'wheel throwing', source: 'you told us' }],
    barriers: [{ what: 'rooms of strangers', source: "we've noticed", easing: true }],
  });
  assert.deepEqual(chips.interests[0].correction, { type: 'interest-remove', tag: 'pottery' });
  assert.deepEqual(chips.barriers[0].correction, { type: 'barrier-remove', what: 'rooms of strangers' });
  assert.equal(chips.barriers[0].easing, true);
  assert.equal(chips.doors[0].source, 'you told us');
  assert.equal(chips.strengths[0].removable, undefined, 'strengths have no removal path');
});

test('no view surface ever exposes a weight or score field', () => {
  const rows = envelopeRows({ groupSize: { position: 'small', weight: 0.9 } });
  const chips = chipLists({ interests: [{ tag: 'pottery', weight: 0.8, source: 'you told us' }] });
  assert.doesNotMatch(JSON.stringify({ rows, chips }), /weight|score/);
});

test('handleModelLoad distinguishes no-model (null) from load failure (undefined)', async () => {
  const empty = await handleModelLoad({ commands: { getModel: async () => ({ model: null }) } });
  assert.equal(empty, null);

  const toasts = [];
  const failed = await handleModelLoad({
    commands: { getModel: async () => { throw new Error('network'); } },
    showToast: (m) => toasts.push(m),
  });
  assert.equal(failed, undefined);
  assert.equal(toasts.length, 1);
});

test('handleCorrection sends the typed correction and reloads on success', async () => {
  const sent = [];
  let reloaded = 0;
  const ok = await handleCorrection({
    commands: { correctModel: async ({ correction }) => { sent.push(correction); } },
    correction: { type: 'envelope', dimension: 'groupSize', position: 'small' },
    onDone: async () => { reloaded += 1; },
  });
  assert.equal(ok, true);
  assert.deepEqual(sent, [{ type: 'envelope', dimension: 'groupSize', position: 'small' }]);
  assert.equal(reloaded, 1);

  const failed = await handleCorrection({
    commands: { correctModel: async () => { throw new Error('409'); } },
    correction: { type: 'interest-remove', tag: 'x' },
  });
  assert.equal(failed, false);
});

test('view vocabulary mirrors the backend scales (3 positions, known poles)', () => {
  assert.deepEqual(Object.keys(ENVELOPE_VIEW.groupSize.positions), ['intimate', 'small', 'large']);
  assert.deepEqual(Object.keys(ENVELOPE_VIEW.structure.positions), ['activity-anchored', 'balanced', 'open-conversation']);
  assert.deepEqual(Object.keys(ENVELOPE_VIEW.familiarity.positions), ['needs-known-face', 'easier-with-known-face', 'fine-with-strangers']);
  assert.deepEqual(Object.keys(ENVELOPE_VIEW.role.positions), ['wants-a-job', 'either', 'happy-to-attend']);
  assert.deepEqual(Object.keys(ENVELOPE_VIEW.novelty.positions), ['prefers-ritual', 'mix', 'seeks-new']);
});
