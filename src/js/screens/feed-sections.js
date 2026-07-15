// Feed sectioning for ranking v1 (docs/matching-spec.md).
//
// The backend returns an ordered `recommendations` eventId list alongside
// the time-sorted events. The feed splits into:
//   plans     — the member's own live confirmed events (time order)
//   suggested — recommended events, in the server's ranked order
//   rest      — everything else (past, cancelled, full, conflicting…),
//               keeping the incoming time order
// Ordering is all the client ever sees — no scores exist anywhere.

export function sectionFeed(events, recommendations) {
  const rank = new Map((recommendations ?? []).map((id, i) => [id, i]));
  const plans = [];
  const suggested = [];
  const rest = [];

  for (const event of events ?? []) {
    const effective = event.effectiveState || event.lifecycleState;
    const live = effective !== 'cancelled' && effective !== 'over';
    if (event.myLevel === 'confirmed' && live) {
      plans.push(event);
    } else if (rank.has(event.eventId)) {
      suggested.push(event);
    } else {
      rest.push(event);
    }
  }

  suggested.sort((a, b) => rank.get(a.eventId) - rank.get(b.eventId));
  return { plans, suggested, rest };
}
