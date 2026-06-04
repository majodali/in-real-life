// ─── Static data for in·real·life ───
//
// The mock EVENTS catalog used to live here. It's gone — the feed reads
// real events from the backend. What remains is the onboarding /
// profile-followup question library and the avatar emoji palette.

export const INTERVIEW_FLOW = [
  {
    id: 'name',
    text: "First things first — what should we call you?",
    subtext: "Just your first name or whatever you go by.",
    type: 'name',
  },
  {
    id: 'describe_yourself',
    text: "How would you describe yourself to new acquaintances?",
    subtext: "There’s no wrong answer — just share what feels natural.",
    type: 'text',
    helpers: [
      "What do people usually learn about you first?",
      "What are you passionate about?",
      "How would a close friend introduce you?",
    ],
  },
  {
    id: 'enjoy_doing',
    text: "What kinds of things do you enjoy doing — especially things you’d love to share with others?",
    subtext: "Hobbies, activities, regular routines, guilty pleasures — all fair game.",
    type: 'text',
    helpers: [
      "What does a perfect weekend look like for you?",
      "Is there something you’ve been meaning to try?",
      "What could you talk about for hours?",
    ],
  },
  {
    id: 'social_goals',
    text: "What are you hoping to get out of connecting with people nearby?",
    subtext: "Maybe you’re new to the area, or just looking for something different.",
    type: 'text',
    helpers: [
      "Are you looking for regular companions or casual hangouts?",
      "Is there a specific kind of group you’d love to find?",
      "What’s been missing from your social life?",
    ],
  },
  {
    id: 'challenges',
    text: "Is there anything that makes it hard to meet people or try new things?",
    subtext: "No pressure — skip this one if you’d rather.",
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
    text: "Anything new you’ve been wanting to try?",
    subtext: "Something you’ve been curious about, or heard others doing.",
    type: 'text',
    helpers: [
      "Seen anything on the island that caught your eye?",
      "Is there a skill you’ve always wanted to pick up?",
    ],
  },
  {
    id: 'social_update',
    text: "How have things been going socially since you joined?",
    subtext: "We’d love to hear what’s working and what isn’t.",
    type: 'text',
    helpers: [
      "Have you met anyone interesting?",
      "Is there something we could do better?",
    ],
  },
  {
    id: 'wish_list',
    text: "Any events or activities you’d love to see happen here?",
    subtext: "Dream big — if enough people want it, it might just happen.",
    type: 'text',
    helpers: [
      "What’s something your old neighbourhood had that this one doesn’t?",
      "If you could organise one thing, what would it be?",
    ],
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
