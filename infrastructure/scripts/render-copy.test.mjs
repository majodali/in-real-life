// The static-page copy renderer (render-copy.mjs; docs/page-copy.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderCopy, baseCopy, PAGE_PARAMS } from './render-copy.mjs';
import { createCopy } from '../../src/js/copy.js';
import { AGREEMENT_VERSION } from '../../src/js/agreement.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fake = createCopy({
  locale: 'en-US',
  layers: [{
    'p.title': 'A title',
    'p.body': "It's {em:here} & now",
    'p.label': `Say "hi", it's {b:fine} & <ok>`,
    'p.version': 'Version {v}',
  }],
});

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

test('fills an attribute named data-copy-<attribute>, in place', () => {
  const { html, keys } = renderCopy('<nav class="n" data-copy-aria-label="p.title" id="x"></nav>', fake);
  assert.equal(html, '<nav class="n" aria-label="A title" id="x"></nav>');
  assert.deepEqual(keys, ['p.title']);
});

test('an attribute value is plain text with only double quotes escaped beyond text', () => {
  // The renderer writes the double quotes itself, so an apostrophe stays
  // as the hand-written markup had it; marked spans keep their words only.
  const { html } = renderCopy('<meta name="d" data-copy-content="p.label">', fake);
  assert.equal(html, `<meta name="d" content="Say &quot;hi&quot;, it's fine &amp; &lt;ok&gt;">`);
});

test('an element and its own attribute can both be filled', () => {
  const { html, keys } = renderCopy('<a data-copy-title="p.title" data-copy="p.body"></a>', fake);
  assert.equal(html, `<a title="A title">It's <em>here</em> &amp; now</a>`);
  assert.deepEqual(keys, ['p.title', 'p.body']);
});

test('page params reach every key: values and wrappers', () => {
  const { html } = renderCopy('<p data-copy="p.version"></p>', fake, { v: 'v9' });
  assert.equal(html, '<p>Version v9</p>');
  assert.equal(PAGE_PARAMS.mail('hello@in-real.life'), '<a href="mailto:hello@in-real.life">hello@in-real.life</a>');
});

test('the real landing page renders completely from the base bundle', () => {
  const source = readFileSync(join(repo, 'src', 'index.html'), 'utf-8');
  const { html, keys } = renderCopy(source, baseCopy());
  assert.ok(keys.length > 0, 'the landing page names copy keys');
  assert.doesNotMatch(html, /data-copy=/);
  assert.match(html, /<h1 id="h1">You're invited to meet your neighbors, <em>in real life\.<\/em><\/h1>/);
});

test('the real terms page renders completely, its version from agreement.js', () => {
  const source = readFileSync(join(repo, 'src', 'terms.html'), 'utf-8');
  const { html } = renderCopy(source, baseCopy());
  assert.doesNotMatch(html, /data-copy/);
  // The date is ISO in agreement.js and reads the bundle's way (en-US).
  assert.match(html, new RegExp(`Version ${AGREEMENT_VERSION} — last updated May 14, 2026`));
  assert.match(html, /Email us at <a href="mailto:hello@in-real\.life">hello@in-real\.life<\/a>\./);
});

test('no static page carries its words in markup: every text node and labeled attribute is keyed', () => {
  // The wordmark (in·real·life, split by its dots) is a mark, not copy.
  for (const page of ['index.html', 'terms.html']) {
    const source = readFileSync(join(repo, 'src', page), 'utf-8')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const words = [...source.matchAll(/>([^<]*\p{L}[^<]*)</gu)].map((m) => m[1].trim())
      .filter((w) => !['in', 'real', 'life'].includes(w));
    assert.deepEqual(words, [], `${page} has words outside the bundle`);
    const labels = [...source.matchAll(/\s(?:aria-label|title|alt|placeholder)="[^"]*"/g)].map((m) => m[0].trim());
    assert.deepEqual(labels, [], `${page} has a label outside the bundle`);
    assert.match(source, /<meta name="description" data-copy-content=|<title data-copy=/);
  }
});
