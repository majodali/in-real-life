// The copy engine (src/js/copy.js; docs/page-copy.md). These pin the
// behaviors a translation or a review variant will lean on: the lookup
// chain, escaping by default, marked spans kept inside sentences,
// plurals and numbers by locale, dates by the bundle's locale.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCopy, escapeText, escapeAttr } from './copy.js';

const make = (layers, extra = {}) => createCopy({ locale: 'en-US', layers, ...extra });

test('a key resolves through the layers, first layer winning', () => {
  const base = { 'a.one': 'base one', 'a.two': 'base two' };
  const variant = { 'a.one': 'variant one' };
  const { t } = make([variant, base]);
  assert.equal(t('a.one'), 'variant one');
  assert.equal(t('a.two'), 'base two');
});

test('a missing key fails loudly by default, and can be handled', () => {
  assert.throws(() => make([{}]).t('nope.key'), /Missing copy key "nope\.key"/);
  const lenient = make([{}], { onMissing: (k) => `[${k}]` });
  assert.equal(lenient.t('nope.key'), '[nope.key]');
});

test('params are HTML-escaped — they carry member data into HTML strings', () => {
  const { t } = make([{ 'g.hi': 'Hello, {name}.' }]);
  assert.equal(t('g.hi', { name: '<img src=x onerror=alert(1)>' }), 'Hello, &lt;img src=x onerror=alert(1)&gt;.');
  assert.equal(t('g.hi', { name: 'Tom & Jerry' }), 'Hello, Tom &amp; Jerry.');
});

test('copy text is escaped too, so markup can only come from code', () => {
  const { t } = make([{ 'g.x': 'a < b & c > d' }]);
  assert.equal(t('g.x'), 'a &lt; b &amp; c &gt; d');
});

test('apostrophes and quotes stay literal in element content', () => {
  const { t } = make([{ 'g.x': "It's \"here\"" }]);
  assert.equal(t('g.x'), "It's \"here\"");
});

test('attr() escapes quotes as well, for attribute values', () => {
  const { attr } = make([{ 'g.x': 'Say "hi" to {who}' }]);
  assert.equal(attr('g.x', { who: "O'Neil" }), 'Say &quot;hi&quot; to O&#39;Neil');
});

test('text() is plain: nothing escaped, marked spans reduced to their words', () => {
  const { text } = make([{ 'g.x': 'Tom & {name} — {link:sign in}' }]);
  assert.equal(text('g.x', { name: '<b>', link: () => 'IGNORED' }), 'Tom & <b> — sign in');
});

test('a marked span stays inside its sentence, wrapped by code', () => {
  const { t } = make([{ 'g.x': 'New here? {link:Create an account} today.' }]);
  const link = (inner) => `<a href="#signup">${inner}</a>`;
  assert.equal(t('g.x', { link }), 'New here? <a href="#signup">Create an account</a> today.');
});

test('the wrapped text is escaped before the wrapper sees it', () => {
  const { t } = make([{ 'g.x': '{link:a <b> & c}' }]);
  assert.equal(t('g.x', { link: (inner) => `[${inner}]` }), '[a &lt;b&gt; &amp; c]');
});

test('b, em and strong have default wrappers', () => {
  const { t } = make([{ 'g.x': 'meet, {em:in real life.} {strong:now} {b:Instead:}' }]);
  assert.equal(t('g.x'), 'meet, <em>in real life.</em> <strong>now</strong> <b>Instead:</b>');
});

test('a marked span without a wrapper is an error, not silent text', () => {
  assert.throws(() => make([{ 'g.x': '{link:here}' }]).t('g.x'), /needs a wrapper function/);
});

test('an unfilled {param} is an error, not a blank', () => {
  assert.throws(() => make([{ 'g.x': 'Hi {name}' }]).t('g.x'), /has no value/);
});

test('double braces are literal braces', () => {
  const { t } = make([{ 'g.x': 'use {{name}} for {what}' }]);
  assert.equal(t('g.x', { what: 'a value' }), 'use {name} for a value');
});

test('plurals follow the locale, with exact forms first', () => {
  const { t } = make([{ 'g.n': { '=0': 'No one yet', one: '{count} person', other: '{count} people' } }]);
  assert.equal(t('g.n', { count: 0 }), 'No one yet');
  assert.equal(t('g.n', { count: 1 }), '1 person');
  assert.equal(t('g.n', { count: 5 }), '5 people');
});

test('plural rules are the locale’s, not English’s', () => {
  // Polish has one / few / many: 2–4 take "few", 5+ take "many".
  const pl = createCopy({ locale: 'pl', layers: [{ 'g.n': { one: '{count} osoba', few: '{count} osoby', many: '{count} osób', other: '{count} osoby' } }] });
  assert.equal(pl.t('g.n', { count: 1 }), '1 osoba');
  assert.equal(pl.t('g.n', { count: 3 }), '3 osoby');
  assert.equal(pl.t('g.n', { count: 5 }), '5 osób');
});

test('a plural key needs a numeric count', () => {
  assert.throws(() => make([{ 'g.n': { one: 'x', other: 'y' } }]).t('g.n'), /needs a numeric count/);
});

test('numbers are formatted for the locale', () => {
  const { t } = make([{ 'g.n': '{count} going' }]);
  assert.equal(t('g.n', { count: 1200 }), '1,200 going');
  const de = createCopy({ locale: 'de-DE', layers: [{ 'g.n': '{count} dabei' }] });
  assert.equal(de.t('g.n', { count: 1200 }), '1.200 dabei');
});

test('dates use the bundle’s locale, not the browser’s', () => {
  const formats = { day: { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' } };
  const us = createCopy({ locale: 'en-US', layers: [{}], formats });
  const gb = createCopy({ locale: 'en-GB', layers: [{}], formats });
  const when = '2026-09-21T18:30:00Z';
  assert.equal(us.date(when, 'day'), '09/21/2026');
  assert.equal(gb.date(when, 'day'), '21/09/2026');
  assert.throws(() => us.date(when, 'nope'), /Unknown date format/);
});

test('escape helpers', () => {
  assert.equal(escapeText(`<a href="x">'&'</a>`), `&lt;a href="x"&gt;'&amp;'&lt;/a&gt;`);
  assert.equal(escapeAttr(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
});
