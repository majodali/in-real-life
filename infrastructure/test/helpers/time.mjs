// Fixture timestamps for functional tests.
//
// Never pin a near-future calendar date in a fixture — the calendar passes it
// and the test rots (an event "in the future" silently becomes in-progress or
// over, and gating flips). That failure mode took down the suite once already.
// Far-past (2020) and far-future (2099) sentinels are fine; anything meant to
// be "soon" must be computed relative to real now via these helpers.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// Absolute ISO timestamp `ms` from real wall-clock now. Evaluated at module
// load; fixtures built from these stay coherent for the length of a test run.
export function isoFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}
