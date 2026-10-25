// Locality register helpers — client side (D62,
// docs/localities-and-constraints.md).
//
// The register itself is SERVED (GET /localities), never mirrored: the
// backend's lib/localities.mjs stays the single curated source, and the
// client computes bands from the served entries (edges arrive already
// symmetric). Only the member-facing band language lives here.

import { text } from './copy.js';

let cache = null;

export async function loadLocalities({ commands }) {
  if (!cache) {
    const out = await commands.getLocalities();
    cache = {
      byId: new Map((out.localities ?? []).map((l) => [l.id, l])),
      community: out.community ?? {},
    };
  }
  return cache;
}

export function resetLocalitiesCache() {
  cache = null;
}

// Same derivation as the backend register: direct edges only.
export function bandBetween(register, fromId, toId) {
  const from = register?.byId?.get(fromId);
  if (!from || !register.byId.has(toId)) return null;
  if (fromId === toId) return 'here';
  if (from.neighbors?.includes(toId)) return 'nearby';
  if (from.crossings?.includes(toId)) return 'a-trip';
  return 'far';
}

// Member-facing band language — effort words, never distances
// (src/copy/<locale>/event.js).
const BAND_KEYS = {
  here: 'event.locality.band.here',
  nearby: 'event.locality.band.nearby',
  'a-trip': 'event.locality.band.aTrip',
  far: 'event.locality.band.far',
};

export function bandLabel(band) {
  return BAND_KEYS[band] ? text(BAND_KEYS[band]) : undefined;
}

// The full locality line for an event detail: name + effort read from
// the member's own home. Home events get just the name — "right here"
// as a label would read oddly on the island's own hall.
export function localityLine(register, homeId, localityId) {
  const locality = register?.byId?.get(localityId);
  if (!locality) return null;
  const band = bandBetween(register, homeId, localityId);
  if (band === null || band === 'here') return locality.name;
  return text('event.locality.line', { town: locality.name, band: bandLabel(band) });
}
