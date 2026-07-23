// The locality register (D62, docs/localities-and-constraints.md).
//
// Curated EFFORT BANDS, not coordinates: each locality carries typed
// edges — `neighbors` (an easy hop: bridge, short drive) and
// `crossings` (a real trip: ferry, long haul) — and pairwise bands
// derive from direct edges only: here / nearby / a-trip / far. No
// distance math, no transitive reachability; every band assignment is
// a legible curatorial judgment readable straight out of this file.
//
// The register is also the sign-up allowlist's source of truth: only
// localities marked `served` accept registrations (postal → locality →
// served), so adding a nearby place for banding purposes never widens
// the launch gate by accident.
//
// DRAFT REGISTER — first-pass band judgments for the launch community,
// written to be corrected by local knowledge, not deferred to. Edits
// here are curation, not code changes.

export const COMMUNITY = {
  homeLocalityId: 'bainbridge-island',
  timezone: 'America/Los_Angeles',
};

// Edges are declared once, in one direction; the module mirrors them
// (symmetry is structural, not a curation duty).
const REGISTER = [
  {
    id: 'bainbridge-island',
    name: 'Bainbridge Island',
    postalCodes: ['98110'],
    served: true,
    neighbors: ['poulsbo', 'suquamish'], // Agate Pass bridge
    crossings: ['seattle'], // the ferry
  },
  {
    id: 'poulsbo',
    name: 'Poulsbo',
    postalCodes: ['98370'],
    neighbors: ['suquamish', 'kingston', 'silverdale'],
  },
  {
    id: 'suquamish',
    name: 'Suquamish',
    postalCodes: ['98392'],
    neighbors: ['kingston'],
  },
  {
    id: 'kingston',
    name: 'Kingston',
    postalCodes: ['98346'],
  },
  {
    id: 'silverdale',
    name: 'Silverdale',
    postalCodes: ['98383'],
    neighbors: ['bremerton'],
  },
  {
    id: 'bremerton',
    name: 'Bremerton',
    postalCodes: ['98310', '98311', '98312', '98337'],
    neighbors: ['port-orchard'],
    crossings: ['seattle'], // its own ferry
  },
  {
    id: 'port-orchard',
    name: 'Port Orchard',
    postalCodes: ['98366', '98367'],
    neighbors: ['gig-harbor'],
  },
  {
    id: 'gig-harbor',
    name: 'Gig Harbor',
    postalCodes: ['98332', '98335'],
  },
  {
    id: 'seattle',
    name: 'Seattle',
    // Not a sign-up locality (`served` stays false — the gate is
    // unchanged); a downtown postal code so workshop seeding can bind a
    // locality slot here (D64: personas need a postal → home locality).
    postalCodes: ['98101'],
  },
];

// Build the symmetric closure once at load.
const byId = new Map(REGISTER.map((l) => [l.id, {
  ...l,
  neighbors: new Set(l.neighbors ?? []),
  crossings: new Set(l.crossings ?? []),
}]));
for (const l of byId.values()) {
  for (const n of l.neighbors) byId.get(n)?.neighbors.add(l.id);
  for (const c of l.crossings) byId.get(c)?.crossings.add(l.id);
}

export const LOCALITIES = [...byId.values()].map((l) => ({
  id: l.id,
  name: l.name,
  postalCodes: l.postalCodes ?? [],
  served: l.served === true,
  neighbors: [...l.neighbors].sort(),
  crossings: [...l.crossings].sort(),
}));

export function isValidLocalityId(id) {
  return byId.has(id);
}

export function localityName(id) {
  return byId.get(id)?.name;
}

// Bands are ordinal: index distance against a reach uses this order.
export const BANDS = ['here', 'nearby', 'a-trip', 'far'];
// A reach is a band the member is willing to go to; `anywhere` accepts
// everything (excess is zero even for `far`).
export const REACHES = ['here', 'nearby', 'a-trip', 'anywhere'];

export function isValidReach(reach) {
  return REACHES.includes(reach);
}

export function isValidAdjustment(feels) {
  return feels === 'closer' || feels === 'further';
}

// The community's median judgment: direct edges only.
export function bandBetween(fromId, toId) {
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) return null;
  if (fromId === toId) return 'here';
  if (from.neighbors.has(toId)) return 'nearby';
  if (from.crossings.has(toId)) return 'a-trip';
  return 'far';
}

// The member's view: the median band shifted one step by their own
// per-locality adjustment (D62's exceptions layer), clamped to the
// scale. Unknown localities and absent adjustments change nothing.
export function effectiveBand(fromId, toId, adjustments) {
  const base = bandBetween(fromId, toId);
  if (base === null) return null;
  const feels = adjustments?.[toId];
  if (!isValidAdjustment(feels)) return base;
  const shifted = BANDS.indexOf(base) + (feels === 'closer' ? -1 : 1);
  return BANDS[Math.min(BANDS.length - 1, Math.max(0, shifted))];
}

// Bands of excess beyond the member's reach — the travel de-weight's
// input (prioritization, never filtering). `anywhere` (or an unset /
// unrecognised reach) excesses nothing; so does an unresolvable band.
export function bandsBeyondReach(band, reach) {
  const bandIdx = BANDS.indexOf(band);
  if (bandIdx === -1) return 0;
  const reachIdx = isValidReach(reach) && reach !== 'anywhere'
    ? BANDS.indexOf(reach)
    : BANDS.length - 1;
  return Math.max(0, bandIdx - reachIdx);
}

export function localityForPostalCode(postalCode) {
  if (postalCode == null) return null;
  const key = String(postalCode).trim();
  if (!key) return null;
  for (const l of byId.values()) {
    if ((l.postalCodes ?? []).includes(key)) return l.id;
  }
  return null;
}

// The sign-up gate reads the same register: served localities only.
export function servedAreaForPostalCode(postalCode) {
  const id = localityForPostalCode(postalCode);
  if (!id) return null;
  const l = byId.get(id);
  return l.served === true ? l.name : null;
}
