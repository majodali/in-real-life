// ─── Mock data for in·real·life ───

// ─── Events ───
// Some events are in the past (for testing debrief), some upcoming.

export const EVENTS = [
  // ── Past events ──
  {
    id: 'evt_coffee_walk_past',
    title: 'Morning coffee & walk',
    type: 'possible-meetup',
    typeLabel: 'Possible meetup',
    when: 'Last Sat 8:30am',
    date: '2026-03-28T08:30:00',
    endDate: '2026-03-28T09:30:00',
    where: 'Blackbird Bakery',
    distance: 'Town centre',
    duration: '~1 hour',
    baseGoing: 3,
    accent: 'amber',
    tab: 'happening',
    people: [
      { name: 'Sarah', avatar: '\u{2615}', vibeMessage: 'Coffee first, everything else second', status: 'going' },
      { name: 'Tom', avatar: '\u{1F6B5}', vibeMessage: 'Training for my first century ride', status: 'going' },
    ],
  },
  {
    id: 'evt_acoustic_past',
    title: 'Acoustic night at Harbour Pub',
    type: 'local-event',
    typeLabel: 'Local event',
    when: 'Last Fri 7pm',
    date: '2026-03-27T19:00:00',
    endDate: '2026-03-27T22:00:00',
    where: 'Harbour Pub',
    distance: '0.8 mi',
    duration: '~3 hours',
    baseGoing: 12,
    accent: 'rust',
    tab: 'happening',
    people: [
      { name: 'Mike', avatar: '\u{1F3B8}', vibeMessage: 'If there\u2019s live music, I\u2019m there', status: 'going' },
      { name: 'Ava', avatar: '\u{2728}', vibeMessage: 'Making things and making friends', status: 'going' },
      { name: 'Jordan', avatar: '\u{1F6B2}', vibeMessage: 'Two wheels, one island', status: 'going' },
      { name: 'Nadia', avatar: '\u{1F372}', vibeMessage: 'Always bringing snacks', status: 'going' },
    ],
  },

  // ── Upcoming events ──
  {
    id: 'evt_farmers_market',
    title: 'Winslow Farmers Market',
    type: 'community-event',
    typeLabel: 'Community event',
    when: 'Sat 9am',
    date: '2026-04-05T09:00:00',
    endDate: '2026-04-05T11:00:00',
    where: 'Winslow Way',
    distance: '0.4 mi',
    duration: '~2 hours',
    baseGoing: 4,
    accent: 'sage',
    tab: 'happening',
    people: [
      { name: 'Linda', avatar: '\u{1F33B}', vibeMessage: 'Sunflowers and sourdough', status: 'going' },
      { name: 'James', avatar: '\u{1F9D1}\u200D\u{1F373}', vibeMessage: 'Cooking my way through the island', status: 'going' },
      { name: 'Priya', avatar: '\u{1F9D8}', vibeMessage: 'Finding my zen', status: 'going' },
    ],
  },
  {
    id: 'evt_coffee_walk',
    title: 'Morning coffee & walk',
    type: 'possible-meetup',
    typeLabel: 'Possible meetup',
    when: 'Sat 8:30am',
    date: '2026-04-05T08:30:00',
    endDate: '2026-04-05T09:30:00',
    where: 'Blackbird Bakery',
    distance: 'Town centre',
    duration: '~1 hour',
    baseGoing: 2,
    accent: 'amber',
    tab: 'possible',
    people: [
      { name: 'Sarah', avatar: '\u{2615}', vibeMessage: 'Coffee first, everything else second', status: 'in' },
      { name: 'Tom', avatar: '\u{1F6B5}', vibeMessage: 'Training for my first century ride', status: 'in' },
    ],
  },
  {
    id: 'evt_acoustic_night',
    title: 'Acoustic night at Harbour Pub',
    type: 'local-event',
    typeLabel: 'Local event',
    when: 'Fri 7pm',
    date: '2026-04-04T19:00:00',
    endDate: '2026-04-04T22:00:00',
    where: 'Harbour Pub',
    distance: '0.8 mi',
    duration: '~3 hours',
    baseGoing: 12,
    accent: 'rust',
    tab: 'happening',
    people: [
      { name: 'Mike', avatar: '\u{1F3B8}', vibeMessage: 'If there\u2019s live music, I\u2019m there', status: 'going' },
      { name: 'Ava', avatar: '\u{2728}', vibeMessage: 'Making things and making friends', status: 'going' },
      { name: 'Jordan', avatar: '\u{1F6B2}', vibeMessage: 'Two wheels, one island', status: 'going' },
      { name: 'Nadia', avatar: '\u{1F372}', vibeMessage: 'Always bringing snacks', status: 'going' },
    ],
  },
  {
    id: 'evt_book_swap',
    title: 'Outdoor book swap',
    type: 'possible-meetup',
    typeLabel: 'Possible meetup',
    when: 'Sun 11am',
    date: '2026-04-06T11:00:00',
    endDate: '2026-04-06T12:30:00',
    where: 'Waterfront Park',
    distance: '0.6 mi',
    duration: '~1.5 hours',
    baseGoing: 1,
    accent: 'sage',
    tab: 'possible',
    people: [
      { name: 'Diana', avatar: '\u{1F4DA}', vibeMessage: 'Three books at once, always', status: 'interested' },
    ],
  },
  {
    id: 'evt_trail_run',
    title: 'Grand Forest trail run',
    type: 'community-event',
    typeLabel: 'Community event',
    when: 'Sat 7am',
    date: '2026-04-05T07:00:00',
    endDate: '2026-04-05T08:00:00',
    where: 'Grand Forest trailhead',
    distance: '1.2 mi',
    duration: '~1 hour',
    baseGoing: 6,
    accent: 'sage',
    tab: 'happening',
    people: [
      { name: 'Ben', avatar: '\u{1F3C3}', vibeMessage: 'Slow miles are still miles', status: 'going' },
      { name: 'Carla', avatar: '\u{1F343}', vibeMessage: 'Forest bathing enthusiast', status: 'going' },
    ],
  },
  {
    id: 'evt_pottery_studio',
    title: 'Open pottery studio',
    type: 'local-event',
    typeLabel: 'Local event',
    when: 'Thu 6pm',
    date: '2026-04-03T18:00:00',
    endDate: '2026-04-03T20:00:00',
    where: 'Island Clay Co.',
    distance: '0.9 mi',
    duration: '~2 hours',
    baseGoing: 3,
    accent: 'amber',
    tab: 'nearby',
    people: [
      { name: 'Kenji', avatar: '\u{1FAD9}', vibeMessage: 'Clay under my nails, always', status: 'going' },
    ],
  },
  {
    id: 'evt_sunrise_yoga',
    title: 'Sunrise yoga on the beach',
    type: 'possible-meetup',
    typeLabel: 'Possible meetup',
    when: 'Sun 6:30am',
    date: '2026-04-06T06:30:00',
    endDate: '2026-04-06T07:30:00',
    where: 'Fay Bainbridge Park',
    distance: '2.1 mi',
    duration: '~1 hour',
    baseGoing: 2,
    accent: 'sage',
    tab: 'nearby',
    people: [
      { name: 'Priya', avatar: '\u{1F9D8}', vibeMessage: 'Finding my zen', status: 'interested' },
      { name: 'Lena', avatar: '\u{1F31E}', vibeMessage: 'Early riser, late bloomer', status: 'interested' },
    ],
  },
];

export function getEvent(id) {
  return EVENTS.find(e => e.id === id) || null;
}

export function getEventsByTab(tab) {
  return EVENTS.filter(e => e.tab === tab);
}

// ─── Event time state ───

export function getEventTimeState(event) {
  const now = new Date();
  const start = new Date(event.date);
  const end = new Date(event.endDate);
  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'happening';
  return 'past';
}

// ─── Interview questions ───

export const INTERVIEW_FLOW = [
  {
    id: 'name',
    text: "First things first \u2014 what should we call you?",
    subtext: "Just your first name or whatever you go by.",
    type: 'name',
  },
  {
    id: 'describe_yourself',
    text: "How would you describe yourself to new acquaintances?",
    subtext: "There\u2019s no wrong answer \u2014 just share what feels natural.",
    type: 'text',
    helpers: [
      "What do people usually learn about you first?",
      "What are you passionate about?",
      "How would a close friend introduce you?",
    ],
  },
  {
    id: 'enjoy_doing',
    text: "What kinds of things do you enjoy doing \u2014 especially things you\u2019d love to share with others?",
    subtext: "Hobbies, activities, regular routines, guilty pleasures \u2014 all fair game.",
    type: 'text',
    helpers: [
      "What does a perfect weekend look like for you?",
      "Is there something you\u2019ve been meaning to try?",
      "What could you talk about for hours?",
    ],
  },
  {
    id: 'social_goals',
    text: "What are you hoping to get out of connecting with people nearby?",
    subtext: "Maybe you\u2019re new to the area, or just looking for something different.",
    type: 'text',
    helpers: [
      "Are you looking for regular companions or casual hangouts?",
      "Is there a specific kind of group you\u2019d love to find?",
      "What\u2019s been missing from your social life?",
    ],
  },
  {
    id: 'challenges',
    text: "Is there anything that makes it hard to meet people or try new things?",
    subtext: "No pressure \u2014 skip this one if you\u2019d rather.",
    type: 'text',
    skippable: true,
    helpers: [
      "Do you feel like you have enough free time?",
      "Is anything holding you back from showing up?",
      "Are there situations that feel uncomfortable?",
    ],
  },
];

export const FOLLOWUP_QUESTIONS = [
  {
    id: 'new_things',
    text: "Anything new you\u2019ve been wanting to try?",
    subtext: "Something you\u2019ve been curious about, or heard others doing.",
    type: 'text',
    helpers: [
      "Seen anything on the island that caught your eye?",
      "Is there a skill you\u2019ve always wanted to pick up?",
    ],
  },
  {
    id: 'social_update',
    text: "How have things been going socially since you joined?",
    subtext: "We\u2019d love to hear what\u2019s working and what isn\u2019t.",
    type: 'text',
    helpers: [
      "Have you met anyone interesting?",
      "Is there something we could do better?",
    ],
  },
  {
    id: 'wish_list',
    text: "Any events or activities you\u2019d love to see happen here?",
    subtext: "Dream big \u2014 if enough people want it, it might just happen.",
    type: 'text',
    helpers: [
      "What\u2019s something your old neighbourhood had that this one doesn\u2019t?",
      "If you could organise one thing, what would it be?",
    ],
  },
];

// ─── Debrief questions (optional deep dive after basic debrief) ───

export const DEBRIEF_QUESTIONS = [
  {
    id: 'highlight',
    text: "What was the highlight of this event for you?",
    subtext: "A moment, conversation, or feeling that stood out.",
    type: 'text',
  },
  {
    id: 'connection',
    text: "Did you feel a connection with anyone there?",
    subtext: "Tell us about it \u2014 even small moments count.",
    type: 'text',
  },
  {
    id: 'different',
    text: "Is there anything you\u2019d change about the event?",
    subtext: "Time, place, format, size \u2014 anything.",
    type: 'text',
    skippable: true,
  },
];

// ─── Emoji palette for avatar picker ───

export const AVATAR_EMOJIS = [
  '\u{1F331}', '\u{1F33F}', '\u{1F33B}', '\u{1F343}', '\u{2615}',
  '\u{1F3B5}', '\u{1F3B8}', '\u{1F3A8}', '\u{1F4DA}', '\u{1F9D7}',
  '\u{1F6B5}', '\u{1F6B2}', '\u{1F3C3}', '\u{1F9D8}', '\u{1F31E}',
  '\u{1F372}', '\u{1F373}', '\u{2728}', '\u{1F30A}', '\u{1F333}',
  '\u{1F98B}', '\u{1F43E}', '\u{1F525}', '\u{1F30D}',
];
