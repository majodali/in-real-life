// Review variants of the page copy (copy-variants.mjs; docs/page-copy.md §5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkVariant, findVariant, activeModule, LOCKED } from './copy-variants.mjs';
import { VARIANTS } from '../../src/copy/variants/index.js';
import { renderCopy, baseCopy } from './render-copy.mjs';
import { createCopy } from '../../src/js/copy-engine.js';

const variantsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'copy', 'variants');
const strings = {
  'landing.title': 'Hello, {name}. {link:Sign in}',
  'feed.count': { one: '{count} event', other: '{count} events' },
  'terms.who.p1': 'For adults.',
};

test('every registered variant may ship', () => {
  for (const [name, variant] of Object.entries(VARIANTS)) {
    assert.deepEqual(checkVariant(variant.default), [], `variant ${name}`);
    assert.ok(variant.about?.title && variant.about?.note, `variant ${name} says what it tries (about.title, about.note)`);
  }
});

test('every variant file is registered, and every registration has a file', () => {
  const files = readdirSync(variantsDir).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(Object.keys(VARIANTS).sort(), files);
});

test('the Terms of Use are locked', () => {
  assert.deepEqual(LOCKED, ['terms.']);
  assert.match(checkVariant({ 'terms.who.p1': 'For everyone.' }, strings)[0], /terms\.who\.p1: locked/);
});

test('a key the base lacks is refused', () => {
  assert.match(checkVariant({ 'landing.titel': 'Hi' }, strings)[0], /not in the base bundle/);
});

test('a message keeps its values and spans, and may drop them', () => {
  assert.deepEqual(checkVariant({ 'landing.title': 'Hi {name}, {link:come in}' }, strings), []);
  assert.deepEqual(checkVariant({ 'landing.title': 'Hi there' }, strings), []);
  assert.match(checkVariant({ 'landing.title': 'Hi {nickname}' }, strings)[0], /\{nickname…\} is not in the base message/);
  // {link} as a value is not the same as {link:…} as a span.
  assert.match(checkVariant({ 'landing.title': 'Hi {link}' }, strings)[0], /\{link…\}/);
});

test('a plural stays a plural, with an other form', () => {
  assert.deepEqual(checkVariant({ 'feed.count': { one: 'one thing', other: '{count} things' } }, strings), []);
  assert.match(checkVariant({ 'feed.count': '{count} things' }, strings)[0], /a plural, like its base/);
  assert.match(checkVariant({ 'feed.count': { one: 'one' } }, strings)[0], /needs an "other" form/);
  assert.match(checkVariant({ 'landing.title': { other: 'x' } }, strings)[0], /a plain message/);
});

test('stray braces and empty messages are refused', () => {
  assert.match(checkVariant({ 'landing.title': 'Hi {name' }, strings)[0], /stray brace/);
  assert.match(checkVariant({ 'landing.title': '  ' }, strings)[0], /empty/);
});

test('an unknown variant name says which ones exist', () => {
  assert.throws(() => findVariant('nope'), /No copy variant "nope"\. Registered: /);
});

test('a deploy of a variant ships an active.js that re-exports it', () => {
  const module = activeModule('sample');
  assert.match(module, /export const name = "sample";/);
  assert.match(module, /export \{ default \} from '\.\/variants\/sample\.js';/);
});

test('the static pages render the variant over the base', () => {
  const variant = { 'landing.hero.headline': 'Come and meet, {em:in person.}' };
  const { html } = renderCopy('<h1 data-copy="landing.hero.headline"></h1><p data-copy="landing.hero.lede"></p>', baseCopy(variant));
  assert.match(html, /<h1>Come and meet, <em>in person\.<\/em><\/h1>/);
  assert.match(html, /<p>in·real·life is a community-driven way/); // unchanged keys stay the base's
});

test('the variant wins over the base, key by key', () => {
  const { t } = createCopy({ locale: 'en-US', layers: [{ 'a.x': 'variant' }, { 'a.x': 'base', 'a.y': 'base y' }] });
  assert.equal(t('a.x'), 'variant');
  assert.equal(t('a.y'), 'base y');
});
