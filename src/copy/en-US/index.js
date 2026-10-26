// en-US — the base bundle (U11: US spelling and usage).
//
// One file per surface, every key prefixed with its surface name
// (site.*, landing.*, feed.*, …), so a key says where it is used and the
// files never collide. The locale and date formats are in locale.js.
// Syntax: src/js/copy-engine.js. Reasoning: docs/page-copy.md.

import { locale, formats } from './locale.js';
import site from './site.js';
import landing from './landing.js';
import terms from './terms.js';
import common from './common.js';
import errors from './errors.js';
import auth from './auth.js';
import interview from './interview.js';
import onboarding from './onboarding.js';
import feed from './feed.js';
import event from './event.js';
import propose from './propose.js';
import edit from './edit.js';
import profile from './profile.js';
import menu from './menu.js';
import taglines from './taglines.js';

export const SURFACES = {
  site, landing, terms, taglines,
  common, errors, auth, interview, onboarding, feed, event, propose, edit, profile, menu,
};

export default {
  locale,
  formats,
  strings: Object.assign({}, ...Object.values(SURFACES)),
};
