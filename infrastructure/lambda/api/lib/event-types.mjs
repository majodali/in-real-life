// The event-type register (D63, docs/event-type-register.md).
//
// Shape describes one listing (D56); THIS register describes kinds —
// "graduated tags": tags that earned formality through recurrence so a
// member's "worth another go" has a stable key to land on. The primary
// purpose is repetition (§0 of the note): when a member says something
// was worth doing again, kinds are how we find them the next one.
//
// Governance, decided at review (§2 of the note):
//   - Types are EARNED BY RECURRENCE, never taxonomy-first. Flat list +
//     one coarse `family` grouping — no hierarchy, no sub-types.
//   - Assignment is deterministic (matchTags vs the shape's activityTags,
//     title tokens as fallback) — no LLM call, replayable. The type with
//     the most matched tags wins; A TIE ASSIGNS NOTHING (a visible wrong
//     guess is worse than no guess). Untyped is first-class.
//   - Organizer correction is authoritative (never re-derived over).
//   - Evidence flows into CURATION, never directly into assignment.
//   - Retirement, never deletion: `retired` types stop matching and
//     leave the picker; history keeps its meaning; ids are NEVER reused.
//
// DRAFT REGISTER — seeded from the kinds the workshop calendar actually
// contains, written to be corrected by curation, not deferred to. The
// same strawman posture (and the same future data store + management
// tool) as the locality register.

import { tokenize } from './text-match.mjs';

// Families are few and obvious; a type belongs to exactly one. Used
// only by the novelty read ("new kind vs new family") — backstage
// grouping, not a browsing hierarchy.
export const FAMILIES = [
  'games', 'making', 'food', 'outdoors', 'learning', 'conversation', 'service',
];

const REGISTER = [
  { id: 'board-game-night', name: 'Board-game night', family: 'games', matchTags: ['board games', 'game night', 'tabletop games'] },
  { id: 'trivia-night', name: 'Trivia night', family: 'games', matchTags: ['trivia', 'quiz night', 'pub quiz'] },
  { id: 'pottery-class', name: 'Pottery class', family: 'making', matchTags: ['pottery', 'ceramics', 'wheel throwing'] },
  { id: 'wood-shop-night', name: 'Wood-shop night', family: 'making', matchTags: ['woodworking', 'wood shop', 'maker space'] },
  { id: 'group-walk', name: 'Group walk', family: 'outdoors', matchTags: ['walk', 'coffee walk', 'hike'] },
  { id: 'running-club', name: 'Running club', family: 'outdoors', matchTags: ['running', 'morning run', 'jog'] },
  { id: 'potluck-dinner', name: 'Potluck dinner', family: 'food', matchTags: ['potluck', 'shared dinner', 'community meal'] },
  { id: 'book-club', name: 'Book club', family: 'conversation', matchTags: ['book club', 'book swap', 'reading group'] },
  { id: 'shore-cleanup', name: 'Shore cleanup', family: 'service', matchTags: ['beach cleanup', 'shore cleanup', 'harbor cleanup'] },
];

const byId = new Map(REGISTER.map((t) => [t.id, t]));

// Every type entry, including retired ones (history keeps its meaning);
// pickers and assignment filter on `retired` themselves.
export const EVENT_TYPES = REGISTER.map((t) => ({
  id: t.id,
  name: t.name,
  family: t.family,
  retired: t.retired === true,
}));

// Valid for correction/display: any registered id, retired included
// (an old event legitimately carries a retired kind).
export function isValidEventTypeId(id) {
  return byId.has(id);
}

// Valid for a NEW assignment or the organizer picker: unretired only.
export function isAssignableEventTypeId(id) {
  const t = byId.get(id);
  return t !== undefined && t.retired !== true;
}

export function eventTypeName(id) {
  return byId.get(id)?.name;
}

export function familyOf(id) {
  return byId.get(id)?.family ?? null;
}

// Classification matching is STRICTER than fit's interest matching:
// every token of the matchTag phrase must be present ("wheel throwing"
// must never claim "axe throwing" — fit's half-overlap rule is fine for
// nudging interest scores, far too loose for assigning identity keys).
function phraseIn(matchTag, tokenSet) {
  const phraseTokens = [...tokenize(matchTag)];
  return phraseTokens.length > 0 && phraseTokens.every((t) => tokenSet.has(t));
}

// Deterministic classification (D63): the shape's activityTags against
// each unretired entry's matchTags; title tokens as fallback ONLY when
// the shape carries no tags at all (tags were the organizer's words —
// overriding them from the title would be a guess). Most matched tags
// wins; a tie assigns nothing — the organizer can always pick at edit.
export function classifyEventType({ shape, title } = {}) {
  const tags = (shape?.activityTags ?? []).filter((t) => typeof t === 'string');
  const tagTokenSets = tags.map((t) => tokenize(t));

  const scoreBy = (matcher) => {
    let best = null;
    let bestScore = 0;
    let tied = false;
    for (const entry of REGISTER) {
      if (entry.retired === true) continue;
      const score = entry.matchTags.filter(matcher).length;
      if (score > bestScore) {
        best = entry.id;
        bestScore = score;
        tied = false;
      } else if (score === bestScore && score > 0) {
        tied = true;
      }
    }
    return bestScore > 0 && !tied ? best : null;
  };

  if (tags.length > 0) {
    return scoreBy((matchTag) => tagTokenSets.some((set) => phraseIn(matchTag, set)));
  }

  const titleTokens = tokenize(title);
  if (titleTokens.size === 0) return null;
  return scoreBy((matchTag) => phraseIn(matchTag, titleTokens));
}
