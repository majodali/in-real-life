// Fill the static pages' copy from a bundle (docs/page-copy.md).
//
// The landing and terms pages must read without JavaScript (design-spec
// §9), so their words are put into the HTML before it ships rather than
// by script in the browser. In the source, an element names its key and
// is empty — the bundle is the only copy:
//
//   <p class="lp-lede" data-copy="landing.hero.lede"></p>
//
// An attribute's words are named the same way, by prefixing the
// attribute's name — the meta description, an aria-label:
//
//   <meta name="description" data-copy-content="landing.meta.description">
//
// Rendering fills both through the same engine the app uses
// (src/js/copy.js) and removes the markers, so the shipped page is
// plain HTML with no trace of the mechanism.
//
// Used by inject-config.mjs on every deploy, and on its own for a local
// preview, optionally with a review variant over the base (§5):
//
//   node infrastructure/scripts/render-copy.mjs src/index.html --out src/index.local.html [--variant <name>]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createCopy, escapeText } from '../../src/js/copy-engine.js';
import base from '../../src/copy/en-US/index.js';
import { AGREEMENT_VERSION, AGREEMENT_LAST_UPDATED } from '../../src/js/agreement.js';
import { findVariant } from './copy-variants.mjs';

// An element carrying data-copy, with nothing between its tags.
const ELEMENT = /<([a-z][a-z0-9]*)\b([^>]*?)\sdata-copy="([^"]+)"([^>]*)><\/\1>/g;
// An attribute whose value is a copy key: data-copy-<attribute>="key".
const ATTRIBUTE = /\sdata-copy-([a-z][a-z-]*)="([^"]+)"/g;

/** The base bundle's engine, with a variant's keys over it when given —
 *  strict: a missing key stops the deploy. */
export function baseCopy(variant = {}) {
  return createCopy({ locale: base.locale, layers: [variant, base.strings], formats: base.formats });
}

// What every static page's copy may draw on besides its own words:
// values the code owns, and the wrappers for marked spans that are not
// the engine's defaults.
export const PAGE_PARAMS = {
  // The terms page shows the version a member accepts (agreement.js), so
  // the two cannot disagree.
  termsVersion: AGREEMENT_VERSION,
  termsUpdated: baseCopy().date(AGREEMENT_LAST_UPDATED, 'agreementDate'),
  mail: (address) => `<a href="mailto:${address.replace(/"/g, '&quot;')}">${address}</a>`,
};

// The renderer writes the quotes itself, always double, so an attribute
// value needs only its double quotes escaped beyond ordinary text — an
// apostrophe stays an apostrophe, as it was in the hand-written markup.
const quoted = (value) => escapeText(value).replace(/"/g, '&quot;');

/**
 * @param {string} html
 * @param {{ t: Function, text: Function }} copy
 * @param {Record<string, unknown>} params  values and wrappers every key may use
 * @returns {{ html: string, keys: string[] }}
 */
export function renderCopy(html, copy = baseCopy(), params = PAGE_PARAMS) {
  const keys = [];
  const out = html
    .replace(ATTRIBUTE, (match, name, key) => {
      keys.push(key);
      return ` ${name}="${quoted(copy.text(key, params))}"`;
    })
    .replace(ELEMENT, (match, tag, before, key, after) => {
      keys.push(key);
      return `<${tag}${before}${after}>${copy.t(key, params)}</${tag}>`;
    });
  // Anything left is an element the renderer could not fill cleanly —
  // text left in the source (two copies of the words, one of which would
  // drift) or markup it does not understand. Refuse rather than ship it.
  const left = out.match(/<[^>]*\sdata-copy(?:-[a-z-]+)?="([^"]+)"[^>]*>/);
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
  const [file, ...rest] = process.argv.slice(2);
  const option = (flag) => (rest.includes(flag) ? rest[rest.indexOf(flag) + 1] : undefined);
  const outPath = option('--out');
  const variantName = option('--variant');
  if (!file || rest.some((a, i) => a.startsWith('--') ? !['--out', '--variant'].includes(a) : !rest[i - 1]?.startsWith('--'))) {
    console.error('Usage: node infrastructure/scripts/render-copy.mjs <page.html> [--out <file>] [--variant <name>]');
    process.exit(1);
  }
  const copy = baseCopy(variantName ? findVariant(variantName).default : {});
  const { html, keys } = renderCopy(readFileSync(file, 'utf-8'), copy);
  if (outPath) {
    writeFileSync(outPath, html);
    console.error(`Rendered ${keys.length} copy keys into ${outPath}`);
  } else {
    process.stdout.write(html);
  }
}
