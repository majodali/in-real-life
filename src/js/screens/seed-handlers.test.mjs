// Spec for the workshop-seed screen handlers (D64 slice 2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSeedPersonas, runAddSeedEvent, openAsUrl } from './seed-handlers.js';

test('runSeedPersonas loops until remaining hits zero, passing bindings only once', async () => {
  const calls = [];
  const outputs = [
    { processed: ['a', 'b'], remaining: 3, seeded: 2, total: 5 },
    { processed: ['c', 'd'], remaining: 1, seeded: 4, total: 5 },
    { processed: ['e'], remaining: 0, seeded: 5, total: 5 },
  ];
  const progress = [];
  const out = await runSeedPersonas({
    commands: { seedPersonas: async (args) => { calls.push(args); return outputs[calls.length - 1]; } },
    localityBindings: { A: 'poulsbo' },
    onProgress: (o) => progress.push(o.seeded),
  });
  assert.equal(out.remaining, 0);
  assert.deepEqual(progress, [2, 4, 5]);
  assert.deepEqual(calls[0], { localityBindings: { A: 'poulsbo' } });
  assert.deepEqual(calls[1], {});
  assert.deepEqual(calls[2], {});
});

test('runSeedPersonas surfaces a stall instead of spinning forever', async () => {
  const stuck = { processed: [], remaining: 2, errors: [{ id: 'tom', error: 'Boom' }] };
  await assert.rejects(
    runSeedPersonas({ commands: { seedPersonas: async () => stuck } }),
    /tom \(Boom\)/,
  );
});

test('runAddSeedEvent returns the per-event result and throws on error status', async () => {
  const ok = await runAddSeedEvent({
    commands: { seedEvents: async () => ({ results: [{ id: 'seed-e05', status: 'added' }] }) },
    eventId: 'seed-e05',
  });
  assert.equal(ok.status, 'added');

  await assert.rejects(
    runAddSeedEvent({
      commands: { seedEvents: async () => ({ results: [{ id: 'seed-e05', status: 'error', error: 'boom' }] }) },
      eventId: 'seed-e05',
    }),
    /boom/,
  );

  await assert.rejects(
    runAddSeedEvent({
      commands: { seedEvents: async () => ({ results: [], remaining: ['seed-e05'] }) },
      eventId: 'seed-e05',
    }),
    /not processed/,
  );
});

test('openAsUrl builds a same-shell sign-in link with the email prefilled', () => {
  assert.equal(
    openAsUrl('seed-priya@workshop.in-real.life', '/app.html'),
    '/app.html#signin/seed-priya%40workshop.in-real.life',
  );
});
