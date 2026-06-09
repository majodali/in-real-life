// Effective lifecycle state for an event.
//
// Stored states are the human-controlled ones the organizer drives by
// command: proposed → planned (schedule) and any → cancelled (cancel).
// "in-progress" and "over" are *time-derived* — they're a function of the
// stored state plus the simulated clock, so we don't need a scheduled job
// to flip rows as wall-time passes. Every reader that cares about whether an
// event has started or finished must compute the effective state rather than
// trust the stored lifecycleState column, which only ever holds the
// command-driven states.
//
// See lifecycle-state.test.mjs for the spec and docs/event-sourcing.md for
// why time transitions are derived rather than event-sourced.

// The phases during which an event is still open to changes — proposing
// suggestions, editing, registering interest/confirmation. Once an event is
// in-progress, over, or cancelled, these surfaces close.
export const CHANGE_OPEN_STATES = new Set(['proposed', 'planned']);

// nowIso is the simulated-clock ISO timestamp (see simulatedNowIso). Passing
// it in (rather than reading the clock here) keeps this a pure function so it
// can be unit-tested and reused across readers within a single request.
export function computeEffectiveState(row, nowIso) {
  if (row.lifecycleState === 'cancelled') return 'cancelled';
  if (row.lifecycleState !== 'planned') return row.lifecycleState;
  if (row.endTime && nowIso >= row.endTime) return 'over';
  if (row.startTime && nowIso >= row.startTime) return 'in-progress';
  return 'planned';
}

// True while the event is still open to suggestions / edits / interest.
export function isOpenForChanges(row, nowIso) {
  return CHANGE_OPEN_STATES.has(computeEffectiveState(row, nowIso));
}

// The simulated "now" as an ISO string: real wall-clock plus the workshop
// offset. offsetMs is 0 (real time) outside workshop mode.
export function simulatedNowIso(offsetMs) {
  return new Date(Date.now() + (offsetMs || 0)).toISOString();
}
