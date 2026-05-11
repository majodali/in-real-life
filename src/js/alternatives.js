// ─── Content alternatives system ───
//
// Defines switchable content/visual variants for each screen.
// Users toggle alternatives via the ellipsis menu.
// Selections persist in localStorage.

const STORE_KEY = 'irl_alt_selections';
const VOTES_KEY = 'irl_alt_votes';

export const ALTERNATIVES = {
  'feed-tabs': {
    label: 'Tab labels',
    screen: 'feed',
    options: [
      { id: 'a', label: 'Happening / Possible / Nearby', value: ['Happening', 'Possible', 'Nearby'] },
      { id: 'b', label: 'This week / Forming / Around here', value: ['This week', 'Forming', 'Around here'] },
      { id: 'c', label: 'Confirmed / Open / Explore', value: ['Confirmed', 'Open', 'Explore'] },
    ],
    default: 'a',
  },
  'feed-rsvp-btn': {
    label: 'RSVP button text',
    screen: 'feed',
    options: [
      { id: 'a', label: "I'm in", value: "I'm in" },
      { id: 'b', label: 'Count me in', value: 'Count me in' },
      { id: 'c', label: "I'll be there", value: "I'll be there" },
    ],
    default: 'a',
  },
  'detail-confirm-btn': {
    label: 'Confirm button text',
    screen: 'detail',
    options: [
      { id: 'a', label: 'Confirm & show up \u2192', value: 'Confirm & show up \u2192' },
      { id: 'b', label: "I'll be there \u2192", value: "I'll be there \u2192" },
      { id: 'c', label: 'Count me in \u2192', value: 'Count me in \u2192' },
    ],
    default: 'a',
  },
  'detail-privacy': {
    label: 'Privacy note',
    screen: 'detail',
    options: [
      { id: 'a', label: 'Show on page', value: 'inline' },
      { id: 'b', label: 'Hide from page', value: 'hidden' },
      { id: 'c', label: 'Show as tooltip', value: 'tooltip' },
    ],
    default: 'a',
  },
  'feed-card-style': {
    label: 'Card accent style',
    screen: 'feed',
    options: [
      { id: 'a', label: 'Color bar on top', value: 'accent-top' },
      { id: 'b', label: 'Color bar on left', value: 'accent-left' },
      { id: 'c', label: 'No color bar', value: 'no-accent' },
    ],
    default: 'a',
  },
  'feed-header-style': {
    label: 'Header style',
    screen: 'feed',
    options: [
      { id: 'a', label: 'Dark header', value: 'dark' },
      { id: 'b', label: 'Light header', value: 'light' },
    ],
    default: 'a',
  },
};

// ─── Helpers ───

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getAltSelection(altId) {
  const selections = readStore(STORE_KEY, {});
  const alt = ALTERNATIVES[altId];
  if (!alt) return null;
  const selectedId = selections[altId] || alt.default;
  const option = alt.options.find(o => o.id === selectedId) || alt.options[0];
  return option.value;
}

export function getAltSelectedId(altId) {
  const selections = readStore(STORE_KEY, {});
  const alt = ALTERNATIVES[altId];
  if (!alt) return null;
  return selections[altId] || alt.default;
}

export function setAltSelection(altId, optionId) {
  const selections = readStore(STORE_KEY, {});
  selections[altId] = optionId;
  writeStore(STORE_KEY, selections);
}

export function voteAlt(altId, optionId) {
  const votes = readStore(VOTES_KEY, {});
  votes[altId] = optionId;
  writeStore(VOTES_KEY, votes);
}

export function getAltVote(altId) {
  const votes = readStore(VOTES_KEY, {});
  return votes[altId] || null;
}

export function getAltSnapshot() {
  return {
    selections: readStore(STORE_KEY, {}),
    votes: readStore(VOTES_KEY, {}),
  };
}

export function getAlternativesForScreen(screen) {
  return Object.entries(ALTERNATIVES)
    .filter(([_, alt]) => alt.screen === screen)
    .map(([id, alt]) => ({ id, ...alt }));
}
