// Validation for the richer optional event fields, shared by propose and
// edit so the rules can't drift.
//
// cost — D34's required disclosure: when money is involved, the listing
// states the amount AND what it covers ("purpose, not price"). Enforcement
// of the donation cap / fixed-price threshold is policy + pattern-watch
// (event-policy.md), not schema — the schema's job is that no event ever
// carries a fee without saying what it's for.
//
// maxAttendance — capacity, a hard constraint (matching.md). Counts the
// organizer, same convention as minimumAttendance.

const COVERS_MAX = 120;

// Returns { error } or { value } (value normalised).
export function validateCost(cost) {
  if (typeof cost !== 'object' || cost === null || Array.isArray(cost)) {
    return { error: 'cost must be an object like { amount, covers }' };
  }
  const keys = Object.keys(cost);
  if (keys.some((k) => k !== 'amount' && k !== 'covers')) {
    return { error: 'cost accepts only amount and covers' };
  }
  const amount = cost.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return { error: 'cost.amount must be a positive number (omit cost entirely for free events)' };
  }
  const covers = typeof cost.covers === 'string' ? cost.covers.trim() : '';
  if (!covers) {
    return { error: 'cost.covers is required — say what the fee pays for' };
  }
  return { value: { amount, covers: covers.slice(0, COVERS_MAX) } };
}

export function validateMaxAttendance(maxAttendance, minimumAttendance) {
  if (!Number.isInteger(maxAttendance)) {
    return { error: 'maxAttendance must be an integer' };
  }
  const floor = minimumAttendance ?? 3;
  if (maxAttendance < floor) {
    return { error: `maxAttendance must be at least the minimum attendance (${floor})` };
  }
  return { value: maxAttendance };
}

// Is the event out of member spots? maxAttendance includes the organizer,
// so members can take maxAttendance - 1 of them.
export function isFull(row) {
  if (!row?.maxAttendance) return false;
  return (row.confirmedCount ?? 0) >= row.maxAttendance - 1;
}
