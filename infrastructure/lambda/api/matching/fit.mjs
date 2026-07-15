// Fit scoring v2 — interests + doors (docs/matching-spec.md → Fit).
//
// Interests match two-tiered: against the event's extracted activityTags
// (D56 shape — the high-confidence tier) first, falling back to the
// title + description token match (shapeless/older events still rank).
// Doors match structured-to-structured: the member's onboarding door
// weights vs the shape's doors. Envelope fit still waits on a comparable
// member-side form — the shape's `structure` is captured, not used.

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
export function interestFit(interests, event, tunables) {
  const shapeTokens = tokenize((event.shape?.activityTags ?? []).join(' '));
  const textTokens = tokenize(`${event.title ?? ''} ${event.description ?? ''}`);
  let score = 0;
  for (const interest of interests) {
    if (!interest?.tag) continue;
    const weight = typeof interest.weight === 'number'
      ? interest.weight
      : tunables.interestDefaultWeight;
    if (shapeTokens.size > 0 && tagMatches(interest.tag, shapeTokens)) {
      score += tunables.fitActivityTagWeight * weight;
    } else if (tagMatches(interest.tag, textTokens)) {
      score += tunables.fitInterestWeight * weight;
    }
  }
  return score;
}

// doors: profile#core payload doors [{ door, weight? }, ...] vs the
// shape's doors — structured on both sides, so no token matching.
export function doorFit(doors, event, tunables) {
  const eventDoors = event.shape?.doors ?? [];
  if (eventDoors.length === 0 || !doors?.length) return 0;
  const weightByDoor = new Map(doors
    .filter((d) => d?.door)
    .map((d) => [d.door, typeof d.weight === 'number' ? d.weight : tunables.interestDefaultWeight]));
  let score = 0;
  for (const door of eventDoors) {
    const weight = weightByDoor.get(door);
    if (weight !== undefined) score += tunables.fitDoorWeight * weight;
  }
  return score;
}

// model: { interests, doors } — the member-side fit inputs.
export function eventFit(model, event, tunables) {
  return Math.min(
    tunables.fitCap,
    interestFit(model.interests ?? [], event, tunables)
      + doorFit(model.doors ?? [], event, tunables),
  );
}
