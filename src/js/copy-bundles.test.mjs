// The bundles themselves (src/copy/; docs/page-copy.md). The engine is
// tested in copy.test.mjs; these keep the copy honest: every key lives
// in its surface's file, none is defined twice, every message parses,
// every key the code or the markup names exists, and nothing in a
// bundle is dead — a reviewer should never be editing copy no page shows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import base, { SURFACES } from '../copy/en-US/index.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Keys named in code: t('k'), attr('k'), text('k') with a literal key.
// Keys named in markup: data-copy="k", data-copy-<attribute>="k".
function keysUsed() {
  const used = new Map();
  const add = (key, where) => used.set(key, [...(used.get(key) ?? []), where]);
  for (const f of walk(join(SRC, 'js'))) {
    if (!f.endsWith('.js') || f.endsWith(join('js', 'copy.js'))) continue; // the engine documents the syntax
    for (const m of readFileSync(f, 'utf-8').matchAll(/\b(?:t|attr|text)\(\s*'([a-z][\w.-]*)'/g)) add(m[1], f);
  }
  for (const f of readdirSync(SRC).filter((n) => n.endsWith('.html'))) {
    for (const m of readFileSync(join(SRC, f), 'utf-8').matchAll(/data-copy(?:-[a-z-]+)?="([^"]+)"/g)) add(m[1], f);
  }
  return used;
}

test('every key is prefixed with its surface name', () => {
  for (const [surface, strings] of Object.entries(SURFACES)) {
    for (const key of Object.keys(strings)) {
      assert.ok(key.startsWith(`${surface}.`), `${key} is in ${surface}.js`);
    }
  }
});

test('no key is defined in two surface files', () => {
  const seen = new Map();
  for (const [surface, strings] of Object.entries(SURFACES)) {
    for (const key of Object.keys(strings)) {
      assert.ok(!seen.has(key), `${key} is in both ${seen.get(key)}.js and ${surface}.js`);
      seen.set(key, surface);
    }
  }
});

test('every value is a non-empty message or a plural with an "other" form', () => {
  for (const [key, value] of Object.entries(base.strings)) {
    if (typeof value === 'string') {
      assert.ok(value.trim(), `${key} is empty`);
    } else {
      assert.equal(typeof value, 'object', `${key}`);
      assert.ok(typeof value.other === 'string' && value.other.trim(), `${key} needs an "other" form`);
    }
  }
});

test('every message parses — no stray braces', () => {
  const token = /\{\{|\}\}|\{[A-Za-z][\w-]*(?::[^{}]*)?\}/g;
  for (const [key, value] of Object.entries(base.strings)) {
    for (const message of typeof value === 'string' ? [value] : Object.values(value)) {
      assert.doesNotMatch(message.replace(token, ''), /[{}]/, `${key}: ${message}`);
    }
  }
});

test('every key the code or the markup names exists in the base bundle', () => {
  const missing = [...keysUsed()].filter(([key]) => !(key in base.strings))
    .map(([key, where]) => `${key} (${where.map((w) => w.replace(SRC, 'src')).join(', ')})`);
  assert.deepEqual(missing, []);
});

test('nothing in the base bundle is unused', () => {
  const used = keysUsed();
  const orphans = Object.keys(base.strings).filter((key) => !used.has(key));
  assert.deepEqual(orphans, []);
});
