// ─── Content alternatives system ───
//
// Defines switchable content/visual variants for each screen.
// Users toggle alternatives via the ellipsis menu.
// Selections persist in localStorage.

const STORE_KEY = 'irl_alt_selections';
const VOTES_KEY = 'irl_alt_votes';

export const ALTERNATIVES = {
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
