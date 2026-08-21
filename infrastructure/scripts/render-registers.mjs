#!/usr/bin/env node
// Render the public register views (K-009) from the markdown registers.
//
// The markdown files under docs/ stay the source of truth; this script
// generates static HTML snapshots of the decision and risk registers
// plus an index page with the supporting explanation (K-008). Design
// note: docs/hosted-register-views.md.
//
// Usage:
//   node infrastructure/scripts/render-registers.mjs --out <dir>
//
// Zero dependencies (same posture as inject-config.mjs). Pure
// rendering functions are exported for unit tests; the CLI wrapper at
// the bottom reads the real registers and stamps generation metadata.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_DOCS_URL = 'https://github.com/majodali/in-real-life/blob/main/docs/';

// ── Inline markdown (escape first, then the subset we use) ──

export function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function rewriteHref(href) {
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return href;
  return REPO_DOCS_URL + href; // relative register/note reference
}

export function renderInline(text) {
  let out = escapeHtml(text);
  // Code spans first, via placeholders, so no other rule fires inside them.
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, label, href) => `<a href="${rewriteHref(href)}">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(>])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
  return out;
}

// ── Block parsing (headings, tables, lists, paragraphs) ──

export function parseBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const heading = line.match(/^(#{1,4}) (.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      // A register table may carry blank lines between rows (the real
      // decisions register does, D55+); a blank followed by another
      // `|` row continues the same table rather than ending it.
      while (i < lines.length
        && (lines[i].startsWith('|')
          || (!lines[i].trim() && lines[i + 1]?.startsWith('|')))) {
        if (!lines[i].trim()) { i += 1; continue; }
        // Markdown table cells cannot contain a bare `|` (it would be
        // escaped `\|`, which these registers don't use), so a plain
        // pipe split is the correct markdown read.
        const cells = lines[i].replace(/^\|/, '').replace(/\|\s*$/, '')
          .split('|').map((c) => c.trim());
        rows.push(cells);
        i += 1;
      }
      const [header, separator, ...body] = rows;
      if (separator && separator.every((c) => /^:?-+:?$/.test(c))) {
        blocks.push({ type: 'table', header, rows: body });
      } else {
        blocks.push({ type: 'table', header: rows[0] ?? [], rows: rows.slice(1) });
      }
      continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || /^\s+\S/.test(lines[i]))) {
        if (lines[i].startsWith('- ')) items.push(lines[i].slice(2));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    // Paragraph: consecutive non-blank, non-structural lines.
    const para = [];
    while (i < lines.length && lines[i].trim()
      && !lines[i].startsWith('|') && !lines[i].startsWith('- ')
      && !/^#{1,4} /.test(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') });
  }
  return blocks;
}

// Register tables render as stacked entry cards (mobile-first — the
// prose cells are far too wide for a literal table). First column is
// the entry id chip, second the body, the rest labeled detail lines.
function renderTable({ header, rows }) {
  const entries = rows.map((cells) => {
    const [id, body, ...rest] = cells;
    const details = rest.map((cell, idx) => {
      const label = header[idx + 2] ?? '';
      return `<p class="entry-detail"><span class="entry-label">${renderInline(label)}</span> ${renderInline(cell)}</p>`;
    }).join('\n');
    return `<article class="entry" id="${escapeHtml(id ?? '')}">
<h3 class="entry-id">${renderInline(id ?? '')}</h3>
<div class="entry-body"><p>${renderInline(body ?? '')}</p>
${details}</div>
</article>`;
  });
  return `<div class="entries">\n${entries.join('\n')}\n</div>`;
}

export function renderBlocks(blocks, { skipTitle = true } = {}) {
  const html = [];
  for (const block of blocks) {
    if (block.type === 'heading') {
      if (block.level === 1 && skipTitle) continue; // page chrome owns the title
      html.push(`<h${block.level}>${renderInline(block.text)}</h${block.level}>`);
    } else if (block.type === 'paragraph') {
      html.push(`<p>${renderInline(block.text)}</p>`);
    } else if (block.type === 'list') {
      html.push(`<ul>\n${block.items.map((it) => `<li>${renderInline(it)}</li>`).join('\n')}\n</ul>`);
    } else if (block.type === 'table') {
      html.push(renderTable(block));
    }
  }
  return html.join('\n');
}

// ── Page chrome ──

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --earth: #2d3a2e; --moss: #4a6741; --sage: #7a9e6e; --mist: #c8d8b8;
  --cream: #f5f0e8; --warm: #e8ddc8; --amber: #c4853a; --rust: #a85c38;
  --text: #1e2a1f; --soft: #6b7c6c;
}
body {
  font-family: 'DM Sans', sans-serif; background: var(--cream);
  color: var(--text); line-height: 1.55; padding: 0 20px 60px;
}
main { max-width: 760px; margin: 0 auto; }
header.site { max-width: 760px; margin: 0 auto; padding: 28px 0 8px; }
.wordmark {
  font-family: 'Playfair Display', serif; font-size: 28px;
  color: var(--earth); letter-spacing: -0.02em; text-decoration: none;
  display: inline-block;
}
.wordmark span { color: var(--amber); }
nav.registers { margin: 10px 0 26px; font-size: 14px; }
nav.registers a { color: var(--moss); text-decoration: none; margin-right: 16px; }
nav.registers a.current { color: var(--earth); font-weight: 500; border-bottom: 2px solid var(--amber); }
h1 { font-family: 'Playfair Display', serif; font-size: 30px; color: var(--earth); margin: 6px 0 14px; }
h2 { font-family: 'Playfair Display', serif; font-size: 22px; color: var(--earth); margin: 30px 0 10px; }
h3 { font-size: 16px; margin: 18px 0 8px; }
p { margin: 0 0 12px; }
ul { margin: 0 0 14px 20px; }
li { margin-bottom: 6px; }
a { color: var(--moss); }
code {
  font-size: 0.88em; background: var(--warm); border-radius: 4px;
  padding: 1px 5px; word-break: break-word;
}
.entries { margin: 14px 0 20px; }
.entry {
  background: #fff; border: 1px solid var(--warm); border-radius: 12px;
  padding: 14px 16px; margin-bottom: 12px;
}
.entry-id {
  font-size: 13px; color: var(--amber); font-weight: 600;
  letter-spacing: 0.04em; margin: 0 0 6px;
}
.entry-body p { margin-bottom: 8px; }
.entry-body p:last-child { margin-bottom: 0; }
.entry-detail { font-size: 13px; color: var(--soft); }
.entry-label { font-weight: 600; }
.entry-label::after { content: ':'; }
footer.meta {
  max-width: 760px; margin: 40px auto 0; font-size: 12.5px;
  color: var(--soft); border-top: 1px solid var(--warm); padding-top: 14px;
}
footer.meta p { margin-bottom: 6px; }
`;

export function renderPage({ title, current, bodyHtml, meta }) {
  const navLink = (href, label, key) =>
    `<a href="${href}"${current === key ? ' class="current"' : ''}>${label}</a>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — in·real·life</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header class="site">
<a class="wordmark" href="/">in<span>·</span>real<span>·</span>life</a>
<nav class="registers">
${navLink('index.html', 'How we decide', 'index')}
${navLink('decisions.html', 'Decisions', 'decisions')}
${navLink('risks.html', 'Open risks', 'risks')}
</nav>
</header>
<main>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</main>
<footer class="meta">
<p>Latest snapshot, generated ${escapeHtml(meta.date)} from revision <code>${escapeHtml(meta.revision)}</code>. The <a href="${REPO_DOCS_URL}">markdown registers on GitHub</a> are the source of truth; these pages are regenerated on every site deploy.</p>
</footer>
</body>
</html>
`;
}

const INDEX_BODY = `
<p>in·real·life is designed in the open. Every significant design
decision — how matching works, what the debrief asks, what we will
and won't do with your information — is recorded in a public
register with the reasoning it rests on, and every known gap or
weakness we haven't resolved yet is recorded next to it. These pages
are the latest snapshot of both.</p>
<p><strong>Decisions are revisable.</strong> Each entry is a current
best call, not a permanent commitment — real usage teaches us, and
entries carry dated revision notes when it does. Nothing here is
edited silently.</p>
<p><strong>Feedback lands on decisions.</strong> When feedback
touches a recorded decision, we answer with one of three outcomes:
the decision <em>changed</em>, it <em>stands</em> (with the
reasoning and what would move it), or it was <em>routed</em> to the
right register. "We hear you" without one of those is not an
answer we allow ourselves.</p>
<ul>
<li><a href="decisions.html">The decision register</a> — every
decision, one line each, with a pointer to the design note holding
the reasoning.</li>
<li><a href="risks.html">Open risks</a> — the honest defect list:
findings from our own critical reviews, with severity and status.
Published as-is, frank language included.</li>
</ul>
<p>The full design notes live in the
<a href="https://github.com/majodali/in-real-life">public
repository</a>.</p>
`;

export function buildRegisterPages({ decisionsMd, risksMd, meta }) {
  return {
    'index.html': renderPage({
      title: 'How we decide', current: 'index', bodyHtml: INDEX_BODY.trim(), meta,
    }),
    'decisions.html': renderPage({
      title: 'Decision register', current: 'decisions',
      bodyHtml: renderBlocks(parseBlocks(decisionsMd)), meta,
    }),
    'risks.html': renderPage({
      title: 'Open risks', current: 'risks',
      bodyHtml: renderBlocks(parseBlocks(risksMd)), meta,
    }),
  };
}

// Read the real registers, stamp generation metadata, write the pages.
// Used by the CLI below and by inject-config.mjs during deploys.
export function renderRegisters(outDir) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const rev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' });
  const meta = {
    date: new Date().toISOString().slice(0, 10),
    revision: rev.status === 0 ? rev.stdout.trim() : 'unknown',
  };
  const pages = buildRegisterPages({
    decisionsMd: readFileSync(join(repoRoot, 'docs', 'decisions.md'), 'utf-8'),
    risksMd: readFileSync(join(repoRoot, 'docs', 'open-risks.md'), 'utf-8'),
    meta,
  });
  mkdirSync(outDir, { recursive: true });
  for (const [name, html] of Object.entries(pages)) {
    writeFileSync(join(outDir, name), html);
  }
  return { count: Object.keys(pages).length, revision: meta.revision };
}

// ── CLI ──

function main() {
  const outFlag = process.argv.indexOf('--out');
  if (outFlag === -1 || !process.argv[outFlag + 1]) {
    console.error('Usage: node infrastructure/scripts/render-registers.mjs --out <dir>');
    process.exit(1);
  }
  const outDir = process.argv[outFlag + 1];
  const { count, revision } = renderRegisters(outDir);
  console.log(`Rendered ${count} pages to ${outDir} (rev ${revision})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
