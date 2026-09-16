// Guards the installability + viewport requirements the design spec
// fixes in chunk 2 (§5 install, §8 accessibility). These are static
// facts about the shipped files, so they are cheap to assert and the
// kind of thing that silently regresses in an HTML edit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'app.html', 'terms.html', 'taglines.html'];
const page = (name) => readFileSync(join(src, name), 'utf-8');

test('no page disables pinch-zoom (WCAG 1.4.4; spec §8)', () => {
  for (const name of PAGES) {
    assert.doesNotMatch(page(name), /user-scalable\s*=\s*no/, `${name} blocks zoom`);
  }
});

test('every page links the manifest and the iOS icon (spec §5)', () => {
  for (const name of PAGES) {
    const html = page(name);
    assert.match(html, /rel="manifest" href="manifest\.json"/, `${name} has no manifest link`);
    assert.match(html, /rel="apple-touch-icon"/, `${name} has no apple-touch-icon`);
    assert.match(html, /name="theme-color"/, `${name} has no theme-color`);
  }
});

test('the manifest carries what installability requires', () => {
  const m = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf-8'));
  assert.ok(m.name && m.short_name, 'name/short_name');
  assert.ok(m.start_url, 'start_url');
  assert.equal(m.display, 'standalone');
  assert.ok(m.background_color && m.theme_color, 'launch colors');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), '192px icon required');
  assert.ok(sizes.includes('512x512'), '512px icon required');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon');
  assert.ok(!('prefer_related_applications' in m) || m.prefer_related_applications === false);
});

test('the service worker never caches API responses (spec §5)', () => {
  const sw = readFileSync(join(src, 'sw.js'), 'utf-8');
  // Same-origin guard: the API lives on another origin, so a
  // cross-origin request must return before any caching happens.
  assert.match(sw, /url\.origin\s*!==\s*self\.location\.origin\)\s*return/);
  assert.doesNotMatch(sw, /api\.in-real\.life/);
});

test('the responsive layer exists and is additive (spec G5)', () => {
  const css = readFileSync(join(src, 'css', 'styles.css'), 'utf-8');
  const queries = css.match(/@media \(min-width: (\d+)px\)/g) ?? [];
  assert.ok(queries.length >= 2, 'breakpoints present');
  // Phone-first: every breakpoint is min-width, so the phone layout is
  // what a browser without media-query support would still get.
  assert.doesNotMatch(css, /@media \(max-width/);
});
