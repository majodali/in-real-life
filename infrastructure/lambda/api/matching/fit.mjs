import { ENVELOPE_DIMENSIONS, adjacencyScore } from '../lib/envelope.mjs';
import { COMMUNITY } from '../lib/localities.mjs';
import { windowOf, isValidTimeWindow } from '../lib/time-windows.mjs';

// Fit scoring — interests + doors + envelope positions
// (docs/matching-spec.md → Fit; envelope form per D58).
//
// Interests match two-tiered: against the event's extracted activityTags
// (D56 shape — the high-confidence tier) first, falling back to the
// title + description token match (shapeless/older events still rank).
// Doors match structured-to-structured: the member's onboarding door
// weights vs the shape's doors. Envelope positions (D58) now compare
// directly: structure via the 1:1 shape map, group size via attendance
// banding. role/novelty positions stay captured-not-used until their
// comparands exist.

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

// Structure fit (spec v5): the member's position compared against the
// event shape's structure via the 1:1 map — exact 1, adjacent 0.5,
// opposite 0. Absent on either side → the component simply doesn't apply.
export function structureFit(envelope, event, tunables) {
  const position = envelope?.structure?.position;
  const shapeStructure = event.shape?.structure;
  if (!position || !shapeStructure) return 0;
  const map = ENVELOPE_DIMENSIONS.structure.shapeMap;
  const eventPosition = Object.keys(map).find((k) => map[k] === shapeStructure);
  const score = adjacencyScore('structure', position, eventPosition);
  return score === null ? 0 : tunables.fitStructureWeight * score;
}

// Expected-size banding: the cap when set, else the larger of the
// threshold and current interest — a coarse read, matching the coarse
// member scale on purpose.
export function sizeBandOf(event) {
  const expected = event.maxAttendance
    ?? Math.max(event.minimumAttendance ?? 3,
      (event.confirmedCount ?? 0) + (event.interestCount ?? 0));
  return expected <= 4 ? 'intimate' : expected <= 8 ? 'small' : 'large';
}

export function sizeFit(envelope, event, tunables) {
  const position = envelope?.groupSize?.position;
  if (!position) return 0;
  const score = adjacencyScore('groupSize', position, sizeBandOf(event));
  return score === null ? 0 : tunables.fitSizeWeight * score;
}

// Time-window fit (D62, spec v8): the event's window (startTime in the
// community's clock) against the member's structured windows — a match
// adds, a mismatch adds nothing (rhythm is preference, never a gate).
// Free-text legacy windows simply never match a slug.
export function timeWindowFit(constraints, event, tunables) {
  const windows = (constraints?.timeWindows ?? []).filter(isValidTimeWindow);
  if (windows.length === 0) return 0;
  const eventWindow = windowOf(event.startTime, COMMUNITY.timezone);
  if (!eventWindow) return 0;
  return windows.includes(eventWindow) ? tunables.fitTimeWindowWeight : 0;
}

// model: { interests, doors, envelope, constraints } — the member-side
// fit inputs.
export function eventFit(model, event, tunables) {
  return Math.min(
    tunables.fitCap,
    interestFit(model.interests ?? [], event, tunables)
      + doorFit(model.doors ?? [], event, tunables)
      + structureFit(model.envelope, event, tunables)
      + sizeFit(model.envelope, event, tunables)
      + timeWindowFit(model.constraints, event, tunables),
  );
}
