// Time-window vocabulary (D62, docs/localities-and-constraints.md).
//
// Four coarse slugs — the member-side rhythm vocabulary and the
// event-side classification share this one module. Events classify
// from startTime in the COMMUNITY timezone; consumption is a soft fit
// component, never a gate (distance is feasibility, rhythm is
// preference).

export const TIME_WINDOWS = [
  'weekday-daytime',
  'weekday-evening',
  'weekend-daytime',
  'weekend-evening',
];

export function isValidTimeWindow(window) {
  return TIME_WINDOWS.includes(window);
}

// Evening starts at 17:00 local; weekend is Saturday/Sunday. Uses Intl
// so the simulated-time ISO strings classify in the community's own
// clock, not UTC's.
export function windowOf(startTimeIso, timezone) {
  const t = Date.parse(startTimeIso ?? '');
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(t));
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  if (!weekday || Number.isNaN(hour)) return null;
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  const evening = hour >= 17;
  return `${weekend ? 'weekend' : 'weekday'}-${evening ? 'evening' : 'daytime'}`;
}
