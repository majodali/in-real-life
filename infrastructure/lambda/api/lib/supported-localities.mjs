// The sign-up allowlist — now a thin adapter over the locality register
// (docs/localities-and-constraints.md): only localities marked `served`
// accept registrations, so the register can band nearby places for
// travel purposes without widening the launch gate. Both the public
// /locality/check gate and the authenticated /me/locality command read
// through here; expand by editing lib/localities.mjs.

import { servedAreaForPostalCode } from './localities.mjs';

export function getSupportedArea(postalCode) {
  return servedAreaForPostalCode(postalCode);
}

export function isSupportedPostalCode(postalCode) {
  return getSupportedArea(postalCode) !== null;
}
