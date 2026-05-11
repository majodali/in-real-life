// Projections for the notify-list aggregate.
//
// We don't keep a state table for notify-list — the event log is the
// source of truth. When we want to "email everyone who asked about area
// X," we'll query the events log. This projection is audit-only.

export function projectLocationNotifyRequested(/* event, tables */) {
  return null;
}
