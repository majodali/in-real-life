import { ENVELOPE_DIMENSIONS, adjacencyScore } from '../lib/envelope.mjs';
import { COMMUNITY } from '../lib/localities.mjs';
import { windowOf, isValidTimeWindow } from '../lib/time-windows.mjs';
import { familyOf } from '../lib/event-types.mjs';

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

// Token matching now lives in lib/text-match.mjs (shared with event-type
// classification); re-exported so existing consumers keep one import site.
import { tokenize, tagMatches } from '../lib/text-match.mjs';

export { tokenize, tagMatches } from '../lib/text-match.mjs';

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

// Again-intent fit (D63, spec v9) — the flagship consumer of the
// event-type register: the member's own latest "worth another go?" on
// this kind. yes → full weight, maybe → half, no or no history →
// nothing (never a penalty). Their word is superseded only by their
// own next word (the next debrief of this kind — D7, no clocks).
export function againFit(outcomes, event, tunables) {
  const typeId = event.eventTypeId;
  if (!typeId) return 0;
  const lastAgain = outcomes?.[typeId]?.lastAgain;
  if (lastAgain === 'yes') return tunables.fitAgainWeight;
  if (lastAgain === 'maybe') return tunables.fitAgainWeight / 2;
  return 0;
}

// Novelty fit (D63): the novelty position finally has its comparand —
// the member's own outcome history with this kind and its family.
// seeks-new: no history with the kind pays (family-new fully, new kind
// in a familiar family half). prefers-ritual: a kept-returning kind
// pays (ritual is real fit, not a rut — exploration keeps stretching
// them regardless). mix / no position / untyped → doesn't apply.
export function noveltyFit(envelope, outcomes, event, tunables) {
  const position = envelope?.novelty?.position;
  const typeId = event.eventTypeId;
  if (!position || !typeId) return 0;
  const history = outcomes?.[typeId];
  if (position === 'seeks-new') {
    if (history) return 0;
    const family = familyOf(typeId);
    const familyFamiliar = family !== null
      && Object.keys(outcomes ?? {}).some((known) => familyOf(known) === family);
    return familyFamiliar ? tunables.fitNoveltyWeight / 2 : tunables.fitNoveltyWeight;
  }
  if (position === 'prefers-ritual') {
    return (history?.attended ?? 0) >= tunables.noveltyRitualPivot
      ? tunables.fitNoveltyWeight
      : 0;
  }
  return 0;
}

// model: { interests, doors, envelope, constraints, outcomes } — the
// member-side fit inputs.
export function eventFit(model, event, tunables) {
  return Math.min(
    tunables.fitCap,
    interestFit(model.interests ?? [], event, tunables)
      + doorFit(model.doors ?? [], event, tunables)
      + structureFit(model.envelope, event, tunables)
      + sizeFit(model.envelope, event, tunables)
      + timeWindowFit(model.constraints, event, tunables)
      + againFit(model.outcomes, event, tunables)
      + noveltyFit(model.envelope, model.outcomes, event, tunables),
  );
}
