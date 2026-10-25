// Terms-of-use version metadata.
//
// AGREEMENT_VERSION is what we send to /me/register so the backend records
// which version of the terms the user accepted. Bump it when the terms
// themselves change (their words are in src/copy/en-US/terms.js).
// Both values are shown on the terms page, filled in at deploy by
// infrastructure/scripts/render-copy.mjs, and AGREEMENT_LAST_UPDATED on
// the in-app agreement screen.

export const AGREEMENT_VERSION = 'v1';
export const AGREEMENT_LAST_UPDATED = '14 May 2026';
