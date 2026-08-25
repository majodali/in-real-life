import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escapeHtml, renderInline, parseBlocks, renderBlocks, renderPage,
  buildRegisterPages, extractSection, buildPackPages,
} from './render-registers.mjs';

const META = { date: '2026-08-21', revision: 'abc1234' };
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('escapes HTML before any markdown handling', () => {
  const html = renderInline('a <script>alert("x")</script> & *emph*');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('<em>emph</em>'));
});

test('renders the inline subset: code, bold, italic, links', () => {
  assert.equal(renderInline('a `code` span'), 'a <code>code</code> span');
  assert.equal(renderInline('**bold** and *ital*'), '<strong>bold</strong> and <em>ital</em>');
  assert.equal(
    renderInline('[label](https://example.org/x)'),
    '<a href="https://example.org/x">label</a>',
  );
});

test('no formatting fires inside code spans; numbers in prose survive', () => {
  assert.equal(renderInline('`**not bold**`'), '<code>**not bold**</code>');
  const html = renderInline('cap is $20 per attendee, `a` and `b` spans');
  assert.ok(html.includes('$20 per attendee'));
  assert.ok(html.includes('<code>a</code>'));
  assert.ok(html.includes('<code>b</code>'));
});

test('relative markdown links rewrite to the GitHub docs URL; absolute and anchors pass through', () => {
  assert.ok(renderInline('[n](matching.md)')
    .includes('href="https://github.com/majodali/in-real-life/blob/main/docs/matching.md"'));
  assert.ok(renderInline('[n](https://e.org/)').includes('href="https://e.org/"'));
  assert.ok(renderInline('[n](#sec)').includes('href="#sec"'));
});

test('parses headings, paragraphs, lists, and tables', () => {
  const blocks = parseBlocks([
    '# Title', '', 'Para line one', 'continues.', '',
    '## Section', '- item one', '  continuation', '- item two', '',
    '| # | Decision | Where |', '|---|---|---|', '| D1 | Does a thing | `a.md` |',
  ].join('\n'));
  const types = blocks.map((b) => b.type);
  assert.deepEqual(types, ['heading', 'paragraph', 'heading', 'list', 'table']);
  assert.equal(blocks[1].text, 'Para line one continues.');
  assert.deepEqual(blocks[3].items, ['item one continuation', 'item two']);
  assert.equal(blocks[4].rows.length, 1);
});

test('register tables render as entry cards: id chip, body, labeled details', () => {
  const html = renderBlocks(parseBlocks([
    '| # | Finding | Severity | Status |', '|---|---|---|---|',
    '| 7 | **Bad thing** observed | medium | `fixed` |',
  ].join('\n')));
  assert.ok(html.includes('class="entry" id="7"'));
  assert.ok(html.includes('<strong>Bad thing</strong>'));
  assert.ok(html.includes('entry-label">Severity</span> medium'));
  assert.ok(html.includes('entry-label">Status</span> <code>fixed</code>'));
  assert.ok(!html.includes('<table'));
});

test('page chrome carries title, nav current-marker, and generation meta', () => {
  const html = renderPage({ title: 'Decision register', current: 'decisions', bodyHtml: '<p>x</p>', meta: META });
  assert.ok(html.includes('<title>Decision register — in·real·life</title>'));
  assert.ok(html.includes('<a href="decisions.html" class="current">'));
  assert.ok(html.includes('generated 2026-08-21'));
  assert.ok(html.includes('<code>abc1234</code>'));
  assert.ok(html.includes('regenerated on every site deploy'));
});

test('builds all three pages from the real registers', () => {
  const pages = buildRegisterPages({
    decisionsMd: readFileSync(join(repoRoot, 'docs', 'decisions.md'), 'utf-8'),
    risksMd: readFileSync(join(repoRoot, 'docs', 'open-risks.md'), 'utf-8'),
    meta: META,
  });
  assert.deepEqual(Object.keys(pages).sort(), ['decisions.html', 'index.html', 'risks.html']);
  // Every D-row present — the register carries blank lines between
  // some rows (D55+), which must not break the table.
  const dRows = (readFileSync(join(repoRoot, 'docs', 'decisions.md'), 'utf-8')
    .match(/^\| D\d+ \|/gm) ?? []).length;
  const dCards = (pages['decisions.html'].match(/id="D\d+"/g) ?? []).length;
  assert.equal(dCards, dRows);
  assert.ok(pages['decisions.html'].includes('id="D68"'));
  assert.ok(pages['risks.html'].includes('id="23"'));
  assert.ok(pages['index.html'].includes('Decisions are revisable'));
  for (const html of Object.values(pages)) {
    assert.ok(!html.includes('\u0000'), 'no placeholder bytes leak');
    assert.ok(html.includes('<!DOCTYPE html>'));
  }
});

test('extractSection takes one section by heading prefix, up to the next same-level heading', () => {
  const md = ['# Doc', '', '## 1. First section', 'body one', '', '### Sub', 'sub body', '',
    '## 2. Second section', 'body two'].join('\n');
  const section = extractSection(md, '1. First');
  assert.ok(section.includes('## 1. First section'));
  assert.ok(section.includes('sub body'));
  assert.ok(!section.includes('Second section'));
  assert.throws(() => extractSection(md, 'No such heading'), /No heading starting with/);
});

test('buildPackPages: index carries intro, questions, and the intake promise; excerpt pages carry questions + content', () => {
  const manifest = {
    title: 'Round one pack',
    intro: 'Two excerpts, **be direct**.',
    excerpts: [
      { file: 'a-note.md', title: 'Note A', questions: ['Is A right?'] },
      { file: 'b-note.md', heading: 'Only this', title: 'Note B (one section)', questions: [] },
    ],
  };
  const docs = {
    'a-note.md': '# Note A\n\nWhole-file content here.',
    'b-note.md': '# Note B\n\nPreamble.\n\n## Only this\nSection content.\n\n## Not this\nOther.',
  };
  const pages = buildPackPages({ manifest, loadDoc: (f) => docs[f], meta: META });
  assert.deepEqual(Object.keys(pages).sort(), ['a-note.html', 'b-note.html', 'index.html']);
  const index = pages['index.html'];
  assert.ok(index.includes('<strong>be direct</strong>'));
  assert.ok(index.includes('<a href="a-note.html">Note A</a>'));
  assert.ok(index.includes('Is A right?'));
  assert.ok(index.includes('Where your input goes'));
  assert.ok(index.includes('never a\nvote'));
  assert.ok(index.includes('Assembled 2026-08-21'));
  assert.ok(!index.includes('regenerated on every site deploy'));
  const a = pages['a-note.html'];
  assert.ok(a.includes("What we're asking"));
  assert.ok(a.includes('Whole-file content here.'));
  assert.ok(a.includes('Pack contents'));
  assert.ok(a.includes('blob/main/docs/a-note.md'));
  const b = pages['b-note.html'];
  assert.ok(b.includes('Section content.'));
  assert.ok(!b.includes('Other.'));
  assert.ok(!b.includes("What we're asking"), 'no questions box when the excerpt has no questions');
});

test('the committed round-one sample manifest builds against the real docs', () => {
  const manifest = JSON.parse(readFileSync(
    join(repoRoot, 'docs', 'advisor-packs', 'round-1.sample.json'), 'utf-8'));
  const pages = buildPackPages({
    manifest,
    loadDoc: (f) => readFileSync(join(repoRoot, 'docs', f), 'utf-8'),
    meta: META,
  });
  assert.equal(Object.keys(pages).length, manifest.excerpts.length + 1);
  assert.ok(pages['localities-and-constraints.html'].includes('Bremerton'));
  assert.ok(pages['index.html'].includes('Advisor round one'));
});

test('CRLF input (Windows checkout) parses identically to LF — the deploy-OOM regression', () => {
  const lf = readFileSync(join(repoRoot, 'docs', 'decisions.md'), 'utf-8');
  const crlf = lf.replaceAll('\n', '\r\n');
  const fromLf = renderBlocks(parseBlocks(lf));
  const fromCrlf = renderBlocks(parseBlocks(crlf));
  assert.equal(fromCrlf, fromLf);
});
