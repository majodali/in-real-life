// The static-page copy renderer (render-copy.mjs; docs/page-copy.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderCopy, baseCopy } from './render-copy.mjs';
import { createCopy } from '../../src/js/copy.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fake = createCopy({ locale: 'en-US', layers: [{ 'p.title': 'A title', 'p.body': "It's {em:here} & now" }] });

test('fills an empty element and removes the data-copy attribute', () => {
  const { html, keys } = renderCopy('<h1 id="h" data-copy="p.title"></h1>', fake);
  assert.equal(html, '<h1 id="h">A title</h1>');
  assert.deepEqual(keys, ['p.title']);
});

test('keeps every other attribute, in order, on either side of data-copy', () => {
  const { html } = renderCopy('<p class="a" data-copy="p.title" id="b"></p>', fake);
  assert.equal(html, '<p class="a" id="b">A title</p>');
});

test('renders through the engine: escaping and marked spans', () => {
  const { html } = renderCopy('<p data-copy="p.body"></p>', fake);
  assert.equal(html, "<p>It's <em>here</em> &amp; now</p>");
});

test('refuses an element that still has words in the source', () => {
  assert.throws(
    () => renderCopy('<p data-copy="p.title">Old words</p>', fake),
    /data-copy="p\.title" was not filled: the element must be empty/,
  );
});

test('an unknown key stops the render', () => {
  assert.throws(() => renderCopy('<p data-copy="p.nope"></p>', fake), /Missing copy key "p\.nope"/);
});

test('the real landing page renders completely from the base bundle', () => {
  const source = readFileSync(join(repo, 'src', 'index.html'), 'utf-8');
  const { html, keys } = renderCopy(source, baseCopy());
  assert.ok(keys.length > 0, 'the landing page names copy keys');
  assert.doesNotMatch(html, /data-copy=/);
  assert.match(html, /<h1 id="h1">You're invited to meet your neighbors, <em>in real life\.<\/em><\/h1>/);
});
