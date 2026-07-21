// Shared token matching — used by fit scoring (matching/fit.mjs) and
// event-type classification (lib/event-types.mjs). Extracted here so the
// register never imports the ranker (and vice versa) — one rule, no
// cycles.

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
