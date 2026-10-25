// Fill the static pages' copy from a bundle (docs/page-copy.md).
//
// The landing and terms pages must read without JavaScript (design-spec
// §9), so their words are put into the HTML before it ships rather than
// by script in the browser. In the source, an element names its key and
// is empty — the bundle is the only copy:
//
//   <p class="lp-lede" data-copy="landing.hero.lede"></p>
//
// Rendering fills it through the same engine the app uses
// (src/js/copy.js) and removes the attribute, so the shipped page is
// plain HTML with no trace of the mechanism.
//
// Used by inject-config.mjs on every deploy, and on its own for a local
// preview:
//
//   node infrastructure/scripts/render-copy.mjs src/index.html --out src/index.local.html

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createCopy } from '../../src/js/copy.js';
import base from '../../src/copy/en-US/index.js';

// An element carrying data-copy, with nothing between its tags.
const ELEMENT = /<([a-z][a-z0-9]*)\b([^>]*?)\sdata-copy="([^"]+)"([^>]*)><\/\1>/g;

/** The base bundle's engine — strict: a missing key stops the deploy. */
export function baseCopy() {
  return createCopy({ locale: base.locale, layers: [base.strings], formats: base.formats });
}

/**
 * @param {string} html
 * @param {{ t: (key: string) => string }} copy
 * @returns {{ html: string, keys: string[] }}
 */
export function renderCopy(html, copy = baseCopy()) {
  const keys = [];
  const out = html.replace(ELEMENT, (match, tag, before, key, after) => {
    keys.push(key);
    return `<${tag}${before}${after}>${copy.t(key)}</${tag}>`;
  });
  // Anything left is an element the renderer could not fill cleanly —
  // text left in the source (two copies of the words, one of which would
  // drift) or markup it does not understand. Refuse rather than ship it.
  const left = out.match(/<[^>]*\sdata-copy="([^"]+)"[^>]*>/);
  if (left) {
    throw new Error(
      `data-copy="${left[1]}" was not filled: the element must be empty in the source `
      + '(the bundle holds the words) and closed on the same line as it opens.',
    );
  }
  return { html: out, keys };
}

// CLI: render one page for a local preview.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, flag, outPath] = process.argv.slice(2);
  if (!file || (flag && flag !== '--out')) {
    console.error('Usage: node infrastructure/scripts/render-copy.mjs <page.html> [--out <file>]');
    process.exit(1);
  }
  const { html, keys } = renderCopy(readFileSync(file, 'utf-8'));
  if (outPath) {
    writeFileSync(outPath, html);
    console.error(`Rendered ${keys.length} copy keys into ${outPath}`);
  } else {
    process.stdout.write(html);
  }
}
