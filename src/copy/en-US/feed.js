// The feed (src/js/screens/feed.js): the greeting, the cards, the
// section labels, and the one-time notice when an event a member was in
// gets cancelled (src/js/cancellation-notices.js).

export default {
  // {br} is a line break.
  'feed.greeting.morning': 'Good morning,{br}{name}.',
  'feed.greeting.afternoon': 'Good afternoon,{br}{name}.',
  'feed.greeting.evening': 'Good evening,{br}{name}.',
  'feed.community': '📍 Bainbridge Island',
  'feed.propose': 'Propose something',
  'feed.loadFailed': "Couldn't load events.",
  'feed.tryAgain': 'Try again in a moment.',
  'feed.empty.title': 'Nothing proposed yet.',
  'feed.empty.sub': 'Be the first to put something out there.',
  'feed.section.plans': 'Your plans',
  'feed.section.suggested': 'Suggested for you',
  'feed.section.rest': 'More on the calendar',

  'feed.card.timeTbd': 'Time TBD',
  'feed.card.placeTbd': 'Place TBD',
  'feed.card.nobody': 'No-one in yet',
  'feed.card.counts': '{confirmed} confirmed · {interested} interested',
  'feed.card.by': 'by {name}',
  'feed.card.listedBy': 'listed by {name}',
  'feed.card.confirmed': "✓ You're confirmed",
  'feed.card.interested': "★ You're interested",
  'feed.card.conflict': '⚠ Overlaps another plan',
  'feed.card.full': 'Full — interest only',
  'feed.card.cancelledOnMe': '✕ Canceled — you were in',

  // Shown once, as a toast, when events a member was in are cancelled.
  'feed.notice.one': "“{title}” was canceled. You'd said you'd be there.",
  'feed.notice.oneWithReason': "“{title}” was canceled — {reason}. You'd said you'd be there.",
  // {count} is how many more besides the first.
  'feed.notice.many': {
    one: "“{title}” was canceled (and {count} more — check your feed). You'd said you'd be there.",
    other: "“{title}” was canceled (and {count} more — check your feed). You'd said you'd be there.",
  },
};
