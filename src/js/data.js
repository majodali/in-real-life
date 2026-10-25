// ─── Static data for in·real·life ───
//
// The mock EVENTS catalog used to live here. It's gone — the feed reads
// real events from the backend. What remains is the onboarding /
// profile-followup question library and the avatar emoji palette.

import { text } from './copy.js';

// Question text lives in the bundle (src/copy/<locale>/interview.js);
// this file keeps the structure.

export const INTERVIEW_FLOW = [
  {
    id: 'name',
    text: text('interview.q.name.text'),
    subtext: text('interview.q.name.subtext'),
    type: 'name',
  },
  {
    id: 'describe_yourself',
    text: text('interview.q.describe_yourself.text'),
    subtext: text('interview.q.describe_yourself.subtext'),
    type: 'text',
    helpers: [
      text('interview.q.describe_yourself.helper1'),
      text('interview.q.describe_yourself.helper2'),
      text('interview.q.describe_yourself.helper3'),
    ],
  },
  {
    id: 'enjoy_doing',
    text: text('interview.q.enjoy_doing.text'),
    subtext: text('interview.q.enjoy_doing.subtext'),
    type: 'text',
    helpers: [
      text('interview.q.enjoy_doing.helper1'),
      text('interview.q.enjoy_doing.helper2'),
      text('interview.q.enjoy_doing.helper3'),
    ],
  },
  {
    id: 'social_goals',
    text: text('interview.q.social_goals.text'),
    subtext: text('interview.q.social_goals.subtext'),
    type: 'text',
    helpers: [
      text('interview.q.social_goals.helper1'),
      text('interview.q.social_goals.helper2'),
      text('interview.q.social_goals.helper3'),
    ],
  },
  {
    id: 'challenges',
    text: text('interview.q.challenges.text'),
    subtext: text('interview.q.challenges.subtext'),
    type: 'text',
    skippable: true,
    helpers: [
      text('interview.q.challenges.helper1'),
      text('interview.q.challenges.helper2'),
      text('interview.q.challenges.helper3'),
    ],
  },
];

export const FOLLOWUP_QUESTIONS = [
  {
    id: 'new_things',
    text: text('interview.q.new_things.text'),
    subtext: text('interview.q.new_things.subtext'),
    type: 'text',
    helpers: [
      text('interview.q.new_things.helper1'),
      text('interview.q.new_things.helper2'),
    ],
  },
  {
    id: 'social_update',
    text: text('interview.q.social_update.text'),
    subtext: text('interview.q.social_update.subtext'),
    type: 'text',
    helpers: [
      text('interview.q.social_update.helper1'),
      text('interview.q.social_update.helper2'),
    ],
  },
  {
    id: 'wish_list',
    text: text('interview.q.wish_list.text'),
    subtext: text('interview.q.wish_list.subtext'),
    type: 'text',
    helpers: [
      text('interview.q.wish_list.helper1'),
      text('interview.q.wish_list.helper2'),
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
