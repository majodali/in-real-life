// The one way member-facing text reaches a page (docs/page-copy.md).
//
// Copy lives in bundles under src/copy/<locale>/ — plain ES modules of
// keyed strings, no build step. Screens call t('key', params) instead of
// writing text inline; the static pages name keys in their markup and are
// filled at deploy time (infrastructure/scripts/render-copy.mjs) through
// this same engine, so both paths format copy identically.
//
// Message syntax, kept small on purpose:
//   {name}          a value. Escaped for HTML. Numbers are formatted for
//                   the bundle's locale.
//   {name:inner}    marked text — a link, emphasis — kept INSIDE the
//                   sentence so a translator can move it. The caller
//                   supplies a function for `name` that wraps the
//                   (escaped) inner text; em and strong have defaults.
//   {{ and }}       literal braces.
//   { one, other }  a plural: the form is chosen by Intl.PluralRules for
//                   the bundle's locale from params.count; '=0', '=1'…
//                   exact forms win when present.
//
// Escaping is the default because screens build HTML strings and
// params carry member data (first names, event titles). Copy text itself
// is escaped too — markup enters only through {name:inner} wrappers,
// which are code, never copy.

import base from '../copy/en-US/index.js';

const TEXT_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const ATTR_ESCAPES = { ...TEXT_ESCAPES, '"': '&quot;', "'": '&#39;' };

export function escapeText(value) {
  return String(value).replace(/[&<>]/g, (c) => TEXT_ESCAPES[c]);
}

export function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => ATTR_ESCAPES[c]);
}

const DEFAULT_WRAPPERS = {
  em: (inner) => `<em>${inner}</em>`,
  strong: (inner) => `<strong>${inner}</strong>`,
};

// {{ }} literals, {name} and {name:inner}. Inner text may not contain
// braces — marked spans are short phrases, and refusing nesting keeps
// the grammar one a translator can read.
const TOKEN = /\{\{|\}\}|\{([A-Za-z][\w-]*)(?::([^{}]*))?\}/g;

function strictMissing(key) {
  throw new Error(`Missing copy key "${key}"`);
}

/**
 * @param {{
 *   locale: string,
 *   layers: Array<Record<string, string|object>>,  // first wins: variant…, base
 *   formats?: Record<string, Intl.DateTimeFormatOptions>,
 *   onMissing?: (key: string) => string,
 * }} options
 */
export function createCopy({ locale, layers, formats = {}, onMissing = strictMissing }) {
  const plurals = new Intl.PluralRules(locale);
  const numbers = new Intl.NumberFormat(locale);
  const dateFormats = new Map();

  function lookup(key) {
    for (const layer of layers) {
      if (Object.prototype.hasOwnProperty.call(layer, key)) return layer[key];
    }
    return undefined;
  }

  function choose(value, params, key) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const n = params.count;
      if (typeof n !== 'number') throw new Error(`Copy key "${key}" is plural and needs a numeric count`);
      return value[`=${n}`] ?? value[plurals.select(n)] ?? value.other;
    }
    throw new Error(`Copy key "${key}" has no usable value`);
  }

  function token([match, name, inner], params, escape, plain) {
    if (match === '{{') return '{';
    if (match === '}}') return '}';
    const param = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : DEFAULT_WRAPPERS[name];
    if (inner !== undefined) {
      if (plain) return inner; // plain text keeps the words, not the markup
      if (typeof param !== 'function') throw new Error(`Copy token {${name}:…} needs a wrapper function`);
      return param(escape(inner));
    }
    if (param === undefined) throw new Error(`Copy token {${name}} has no value`);
    if (typeof param === 'function') return param('');
    return escape(typeof param === 'number' ? numbers.format(param) : param);
  }

  // Text between tokens is escaped as well; the tokens' own output is not
  // escaped again (wrappers return markup on purpose).
  function format(key, params, escape, plain = false) {
    const raw = lookup(key);
    if (raw === undefined) return onMissing(key);
    const message = choose(raw, params, key);
    let out = '';
    let last = 0;
    for (const m of message.matchAll(TOKEN)) {
      out += escape(message.slice(last, m.index)) + token(m, params, escape, plain);
      last = m.index + m[0].length;
    }
    return out + escape(message.slice(last));
  }

  /** Copy for element content: HTML-escaped, marked spans wrapped. */
  function t(key, params = {}) {
    return format(key, params, escapeText);
  }

  /** Copy for an attribute value (placeholder, aria-label, title). */
  function attr(key, params = {}) {
    return format(key, params, escapeAttr);
  }

  /** Plain text, for textContent and toasts: nothing escaped, marked
   *  spans reduced to their words. Never put this into innerHTML. */
  function text(key, params = {}) {
    return format(key, params, (v) => String(v), true);
  }

  /** A date or time in the bundle's locale, by a named format. */
  function date(value, formatName) {
    const options = formats[formatName];
    if (!options) throw new Error(`Unknown date format "${formatName}"`);
    if (!dateFormats.has(formatName)) dateFormats.set(formatName, new Intl.DateTimeFormat(locale, options));
    return dateFormats.get(formatName).format(value instanceof Date ? value : new Date(value));
  }

  return { locale, t, attr, text, date, has: (key) => lookup(key) !== undefined };
}

// The app's own instance: the bundle the page shipped with. Strict in
// tests and on workshop stacks (a missing key is a bug to see at once);
// on production a missing key shows the key itself and is logged,
// because a blank or a crashed screen is worse for a member than an odd
// label. A dedicated test checks every key the code uses exists, so this
// fallback should never be seen.
function appMissing(key) {
  const config = globalThis.__IRL_CONFIG__;
  if (config && config.workshopMode === false) {
    console.error(`Missing copy key "${key}"`);
    return escapeText(key);
  }
  return strictMissing(key);
}

export const copy = createCopy({
  locale: base.locale,
  layers: [base.strings],
  formats: base.formats,
  onMissing: appMissing,
});

export const { t, attr, text, date } = copy;
