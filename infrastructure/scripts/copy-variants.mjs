// Review variants of the page copy (docs/page-copy.md §5).
//
// A variant (src/copy/variants/<name>.js) rewords some keys of the base
// bundle for a review round on a workshop instance. These checks run in
// the tests and again at deploy, so a variant that would break a page —
// or change what members agree to — never ships:
//
//   - every key it rewords exists in the base bundle (no typos, no
//     words a page never shows);
//   - no key is locked: the Terms of Use are versioned (agreement.js),
//     and a reworded term would change the agreement without a new
//     version;
//   - each message keeps its base's form (a plain message stays plain,
//     a plural stays a plural with an "other" form) and uses only the
//     values and marked spans its base uses — the screen supplies those,
//     so a new one would have nothing to fill it;
//   - every message parses.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { VARIANTS } from '../../src/copy/variants/index.js';
import base from '../../src/copy/en-US/index.js';

/** Key prefixes no variant may reword. */
export const LOCKED = ['terms.'];

const TOKEN = /\{\{|\}\}|\{([A-Za-z][\w-]*)(:[^{}]*)?\}/g;

// The values and spans a message uses, as "name" and "name:" entries.
function tokens(message) {
  const found = new Set();
  for (const m of message.matchAll(TOKEN)) {
    if (m[1]) found.add(m[2] === undefined ? m[1] : `${m[1]}:`);
  }
  return found;
}

const forms = (value) => (typeof value === 'string' ? { '': value } : value);

/**
 * @param {Record<string, unknown>} variant  the variant's keys and messages
 * @param {Record<string, unknown>} strings  the base bundle's strings
 * @returns {string[]} problems; empty when the variant may ship
 */
export function checkVariant(variant, strings = base.strings) {
  const problems = [];
  for (const [key, value] of Object.entries(variant)) {
    if (LOCKED.some((prefix) => key.startsWith(prefix))) {
      problems.push(`${key}: locked — the Terms of Use change only with a new agreement version`);
      continue;
    }
    if (!(key in strings)) {
      problems.push(`${key}: not in the base bundle`);
      continue;
    }
    const was = strings[key];
    if (typeof value !== typeof was || (typeof value === 'object' && !value)) {
      problems.push(`${key}: must be ${typeof was === 'string' ? 'a plain message' : 'a plural, like its base'}`);
      continue;
    }
    if (typeof value === 'object' && typeof value.other !== 'string') {
      problems.push(`${key}: a plural needs an "other" form`);
      continue;
    }
    const allowed = new Set(Object.values(forms(was)).flatMap((m) => [...tokens(m)]));
    for (const [form, message] of Object.entries(forms(value))) {
      if (typeof message !== 'string' || !message.trim()) {
        problems.push(`${key}${form && `.${form}`}: empty`);
        continue;
      }
      if (/[{}]/.test(message.replace(TOKEN, ''))) {
        problems.push(`${key}${form && `.${form}`}: stray brace — use {{ or }} for a literal one`);
      }
      for (const token of tokens(message)) {
        if (!allowed.has(token)) {
          problems.push(`${key}${form && `.${form}`}: {${token}…} is not in the base message, so nothing would fill it`);
        }
      }
    }
  }
  return problems;
}

/** A registered variant by name, or an error naming the ones there are. */
export function findVariant(name) {
  const found = VARIANTS[name];
  if (!found) {
    throw new Error(`No copy variant "${name}". Registered: ${Object.keys(VARIANTS).join(', ') || 'none'} (src/copy/variants/index.js).`);
  }
  return found;
}

/** The src/copy/active.js a deploy of this variant ships. */
export function activeModule(name) {
  return `// Written by inject-config.mjs --copy-variant ${name} (docs/page-copy.md §5).\n`
    + `export const name = ${JSON.stringify(name)};\n`
    + `export { default } from './variants/${name}.js';\n`;
}

// CLI: check every registered variant, or one by name.
//   node infrastructure/scripts/copy-variants.mjs [name]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = process.argv[2] ? [process.argv[2]] : Object.keys(VARIANTS);
  let failed = false;
  for (const name of names) {
    const problems = checkVariant(findVariant(name).default);
    console.log(problems.length ? `${name}: ${problems.length} problem(s)\n  ${problems.join('\n  ')}` : `${name}: ok`);
    failed ||= problems.length > 0;
  }
  process.exit(failed ? 1 : 0);
}
