// Fit scoring v1 — interests only (docs/matching-spec.md → Fit).
//
// The one machine-readable fit substrate today is the interest# items in
// the user-model store (tag + numeric weight). An interest matches an
// event when at least half its tag tokens (rounded up) appear in the
// event's title + description tokens. Deliberately thin: envelope/doors
// fit waits on structured event shape (the event-type register).

export function tokenize(text) {
  const tokens = new Set();
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    tokens.add(stem(raw));
  }
  return tokens;
}

// Naive plural-stripping: "games" → "game", but never "chess" → "ches".
function stem(token) {
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

export function tagMatches(tag, eventTokens) {
  const tagTokens = [...tokenize(tag)];
  if (tagTokens.length === 0) return false;
  const needed = Math.ceil(tagTokens.length / 2);
  let hits = 0;
  for (const t of tagTokens) {
    if (eventTokens.has(t)) hits += 1;
    if (hits >= needed) return true;
  }
  return false;
}

// interests: decrypted interest# payloads [{ tag, weight? }, ...]
export function fitScore(interests, event, tunables) {
  const eventTokens = tokenize(`${event.title ?? ''} ${event.description ?? ''}`);
  let score = 0;
  for (const interest of interests) {
    if (!interest?.tag || !tagMatches(interest.tag, eventTokens)) continue;
    const weight = typeof interest.weight === 'number'
      ? interest.weight
      : tunables.interestDefaultWeight;
    score += tunables.fitInterestWeight * weight;
  }
  return Math.min(tunables.fitCap, score);
}
