// In-app cancellation notices.
//
// When an event a member had committed to (interested or confirmed) is
// cancelled, the feed surfaces it once as a toast and permanently as a
// badge. The "seen" tracking is a client-side convenience only — the
// durable truth is the event row's cancelled state plus the member's
// interaction level, both from GET /events. Real notification channels
// (push/email) are the Group 7 notifications slice.

const SEEN_KEY = 'irl_seen_cancellations';

// Cancelled events the member was committed to and hasn't been shown yet.
export function unseenCancellations(events, seenIds) {
  const seen = new Set(seenIds ?? []);
  return (events ?? []).filter((e) => {
    const state = e.effectiveState || e.lifecycleState;
    return state === 'cancelled' && e.myLevel != null && !seen.has(e.eventId);
  });
}

// One toast line covering every newly-seen cancellation.
export function noticeMessage(cancelled) {
  if (!cancelled?.length) return null;
  const first = cancelled[0];
  const what = `“${first.title}” was cancelled`;
  const rest = cancelled.length > 1 ? ` (and ${cancelled.length - 1} more — check your feed)` : '';
  const why = cancelled.length === 1 && first.cancellationReason
    ? ` — ${first.cancellationReason}`
    : '';
  return `${what}${why}${rest}. You'd said you'd be there.`;
}

export function readSeen(storage) {
  try {
    const raw = storage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markSeen(storage, eventIds) {
  const merged = [...new Set([...readSeen(storage), ...eventIds])];
  storage.setItem(SEEN_KEY, JSON.stringify(merged));
  return merged;
}
