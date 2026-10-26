// The one way member-facing text reaches a page (docs/page-copy.md).
//
// Copy lives in bundles under src/copy/<locale>/ — plain ES modules of
// keyed strings, no build step. Screens call t('key', params) instead of
// writing text inline; the static pages name keys in their markup and are
// filled at deploy time (infrastructure/scripts/render-copy.mjs) through
// the same engine (src/js/copy-engine.js, which documents the message
// syntax), so both paths format copy identically.

import { createCopy, escapeText, strictMissing } from './copy-engine.js';
import base from '../copy/en-US/index.js';
import variant from '../copy/active.js';

export { createCopy, escapeText, escapeAttr } from './copy-engine.js';

// The app's own instance: the review variant this deploy names (none
// unless a workshop deploy chose one; src/copy/active.js) over the base
// bundle the page shipped with. Strict in
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
  layers: [variant, base.strings],
  formats: base.formats,
  onMissing: appMissing,
});

export const { t, attr, text, date } = copy;
