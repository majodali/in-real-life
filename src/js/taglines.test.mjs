// Specifications for the tagline picker.
//
// Each tagline carries an `active` flag — inactive ones live in the file
// (so we don't lose ideas) but never get shown by pickActiveTagline. The
// picker takes an injectable `random` so tests can be deterministic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickActiveTagline, TAGLINES } from './taglines.js';

test('returns one of the active taglines', () => {
  const taglines = [
    { text: 'first', active: true },
    { text: 'second', active: true },
  ];
  const picked = pickActiveTagline({ taglines, random: () => 0 });
  assert.equal(picked.text, 'first');
});

test('picks the last active tagline when random returns close to 1', () => {
  const taglines = [
    { text: 'first', active: true },
    { text: 'second', active: true },
    { text: 'third', active: true },
  ];
  const picked = pickActiveTagline({ taglines, random: () => 0.99 });
  assert.equal(picked.text, 'third');
});

test('skips inactive taglines', () => {
  const taglines = [
    { text: 'inactive-one', active: false },
    { text: 'active-one', active: true },
    { text: 'inactive-two', active: false },
  ];
  const picked = pickActiveTagline({ taglines, random: () => 0 });
  assert.equal(picked.text, 'active-one');
});

test('falls back to a sensible default when no taglines are active', () => {
  const taglines = [{ text: 'inactive', active: false }];
  const picked = pickActiveTagline({ taglines });
  assert.equal(typeof picked.text, 'string');
  assert.ok(picked.text.length > 0);
});

test('preserves the attribution field on the chosen tagline', () => {
  const taglines = [{ text: 'Only connect.', attribution: 'E. M. Forster', active: true }];
  const picked = pickActiveTagline({ taglines, random: () => 0 });
  assert.equal(picked.attribution, 'E. M. Forster');
});

test('default TAGLINES export contains at least one active tagline', () => {
  const active = TAGLINES.filter(t => t.active);
  assert.ok(active.length > 0, 'expected at least one active tagline in the bundled list');
});

test('every tagline has text and an active boolean', () => {
  for (const t of TAGLINES) {
    assert.equal(typeof t.text, 'string');
    assert.ok(t.text.length > 0, `empty text on tagline: ${JSON.stringify(t)}`);
    assert.equal(typeof t.active, 'boolean', `non-boolean active on: ${JSON.stringify(t)}`);
  }
});
