// en-US — the base bundle (U11: US spelling and usage).
//
// One file per surface, every key prefixed with its surface name
// (landing.*, auth.*), so a key says where it is used and the files
// never collide. Syntax: src/js/copy.js. Reasoning: docs/page-copy.md.

import landing from './landing.js';
import auth from './auth.js';

export const SURFACES = { landing, auth };

export default {
  locale: 'en-US',
  // Named date/time formats, used through copy.date(value, name). The
  // bundle owns the locale; the visitor's browser locale does not decide
  // how a US community's dates read.
  formats: {
    eventStart: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  },
  strings: Object.assign({}, ...Object.values(SURFACES)),
};
