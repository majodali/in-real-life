// Locality register helpers — client side (D62,
// docs/localities-and-constraints.md).
//
// The register itself is SERVED (GET /localities), never mirrored: the
// backend's lib/localities.mjs stays the single curated source, and the
// client computes bands from the served entries (edges arrive already
// symmetric). Only the member-facing band language lives here.

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

// Member-facing band language — effort words, never distances.
const BAND_LABELS = {
  here: 'right here',
  nearby: 'an easy hop away',
  'a-trip': 'a real trip away',
  far: 'a long way away',
};

export function bandLabel(band) {
  return BAND_LABELS[band];
}

// The full locality line for an event detail: name + effort read from
// the member's own home. Home events get just the name — "right here"
// as a label would read oddly on the island's own hall.
export function localityLine(register, homeId, localityId) {
  const locality = register?.byId?.get(localityId);
  if (!locality) return null;
  const band = bandBetween(register, homeId, localityId);
  if (band === null || band === 'here') return locality.name;
  return `${locality.name} — ${bandLabel(band)}`;
}
