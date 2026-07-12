// Time-overlap test for two events.
//
// Half-open interval intersection on the ISO timestamps (which compare
// lexicographically because everything is stored via toISOString): two
// events overlap when each starts before the other ends. Back-to-back
// events — one ending exactly when the next starts — do NOT overlap;
// attending both is physically possible and common at a shared venue.
// Events without a full time pair (ideas) never overlap anything.

export function eventsOverlap(a, b) {
  if (!a?.startTime || !a?.endTime || !b?.startTime || !b?.endTime) return false;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}
