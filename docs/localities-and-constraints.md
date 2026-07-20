# Localities & Structured Constraints — Design (proposal)

The structured-constraints follow-up named at the D58/D59 sign-off
(`profile-and-legibility.md` §3), plus its hidden dependency, named by
the founder: **a model of nearby localities and distances**, so a member
never types out every place they won't go — they state a reach once,
and everything farther simply stops being suggested.

**Status: proposal.** Two sign-off points: the shape of the locality
register (curated effort bands, no coordinates), and the consumption
split (travel gates *suggestions only*; time windows never gate).

## 1. The locality register — curated effort bands, not coordinates

### Principle: distance here is effort, not kilometers

On and around an island, geometry lies: Seattle is eight miles away and
a ferry ride; Poulsbo is twelve miles away and a bridge. What a member
actually weighs is the *effort shape* of getting somewhere — same
place / easy hop / a real trip — not a radius. So the register models
exactly that, in the same spirit as the envelope's 3-position scales
(D58): a coarse honest vocabulary over false precision.

### The register (`lib/localities.mjs` — one vocabulary module)

A curated list of localities per community, each entry:

```jsonc
{
  "id": "bainbridge-island",
  "name": "Bainbridge Island",
  "postalCodes": ["98110"],       // absorbs lib/supported-localities.mjs
  "neighbors": ["poulsbo", "suquamish"],   // an easy hop (bridge/short drive)
  "crossings": ["seattle"]                  // a real trip (ferry / long haul)
}
```

plus a per-community `timezone` (needed to classify event start times
into windows, below). Edges are typed and symmetric (the module
enforces symmetry at load); **there are no coordinates and no distance
math** — every band assignment is a legible curatorial judgment you can
read straight out of the file, and adding a locality is editing a
register, not maintaining a geo dataset.

**Bands** are derived pairwise from direct edges only:

| Band | Meaning | Derivation |
|---|---|---|
| `here` | same locality | A = B |
| `nearby` | an easy hop | B ∈ A.neighbors |
| `a-trip` | a deliberate outing | B ∈ A.crossings |
| `far` | beyond the register's judgment | everything else |

Direct-edges-only is deliberate: no transitive reachability, so the
register never silently decides that neighbor-of-neighbor is "nearby" —
if Kingston should be nearby from Bainbridge, the curator says so by
listing it. The launch register is small (Bainbridge + the handful of
places members actually go: Poulsbo, Suquamish, Kingston, Bremerton,
Seattle — exact list and band judgments are the founder's local
knowledge, an open item below). Multi-community later (radar R5) is
just more entries — bands are pairwise, so nothing is anchored to one
home community.

### Where each side's locality comes from

- **Members**: the verified-locality flow already captures a postal
  code (`/me/locality` → admin verify); the register resolves it to a
  locality id. That's the member's *home* — no new capture. Unverified
  workshop personas default to the community's home locality.
- **Events**: a new optional `localityId` at propose/edit, validated
  against the register — **organizer-declared, never LLM-extracted**
  (a locality is a fact the organizer owns, like the start time; shape
  extraction stays about texture, D56). Default and absent-field
  reading: the community's home locality — which also grandfathers
  every existing event with zero backfill. External events identical
  (the steward declares it).

## 2. Travel reach — one setting, suggestions-only gate

The member states a **reach**: `here` | `nearby` | `a-trip` |
`anywhere`. **Default `anywhere`** — the constraint exists only when
the member (or their own onboarding words) sets it; we never narrow
anyone's world silently.

**Consumption (ranking spec v8): reach gates the candidate set for
`recommendations` — it never hides an event.** An event whose band
(member home → event locality) exceeds the member's reach simply isn't
*suggested*; it stays on the calendar, browsable and joinable like any
other (the feed's "More on the calendar" is untouched). This is the
distance row of `matching.md`'s hard-constraint table finally landing —
and it's a **member-set** gate, the same class as "already committed",
not a ranking weight to tune. Changing reach takes effect on the next
feed read.

Why gate suggestions rather than de-weight: a member who said
"on-island only" and keeps seeing Bremerton suggestions learns that
their word doesn't govern their own constraint — the exact opposite of
D59's lesson. Their stated reach is theirs; the calendar staying whole
keeps it from ever becoming a wall.

### Sources, D7-ordered (same pattern as D58 positions)

1. **Onboarding**: `constraints` gains optional structured
   `travelReach` (the extraction may set it only when the member's own
   words support it — "I don't really leave the island" → `here`;
   restraint over coverage; free-text `maxTravel` continues to travel
   alongside as the story). Projector validates, drops unrecognised.
2. **Correction (D59)**: a new correction type `constraint` — set
   `travelReach` (or clear to `anywhere`). Shown in `GET /me/model`
   with the usual provenance language; the member's word wins.

## 3. Time windows — structured, but never a gate

`constraints.timeWindows` gains a small vocabulary:
`weekday-daytime` | `weekday-evening` | `weekend-daytime` |
`weekend-evening`. Events classify from `startTime` in the community
timezone (from the register). Sources: onboarding (validated slugs
alongside the free text) and the same `constraint` correction type
(add/remove a window).

**Consumption: a soft fit component, never a gate** —
`fitTimeWindowWeight` (spec v8) added when the event's window is one of
the member's, nothing subtracted when it isn't. Distance is
*feasibility* (a ferry you won't take is a room you're not in); rhythm
is *preference* (a Tuesday-evenings person can absolutely make one
Saturday brunch, and the exploration philosophy wants that door open).
Gating on windows would quietly shrink lives along exactly the
dimension we want to gently stretch.

## 4. What this deliberately does not do

- **No free-text place blocklists** — the founder's framing, kept: a
  reach plus a curated register replaces enumerating the world.
- **No per-event-type or per-company travel granularity** ("would go
  further for pottery / with my crew") — real, deferred; needs evidence
  that the coarse reach actually chafes. Named future refinement.
- **No coordinates, ETAs, or map UI** — the register is a vocabulary,
  not a geo service. If a future community genuinely needs drive-time
  math, that's a new design conversation, not a quiet upgrade.
- **No locality inference from event text** — organizer-declared only;
  a wrong guess about which town a room is in is worse than defaulting
  to home.
- **Postal-code → locality stays the only member location data** (D8/
  D9 posture: no addresses, no geolocation, ever).

## 5. Slice plan (after sign-off)

1. **Register**: `lib/localities.mjs` (entries, symmetry check, band
   function, timezone, postal resolution; absorbs
   `supported-localities.mjs` — the sign-up gate reads the same
   register).
2. **Backend**: event `localityId` (propose/edit/external, projection,
   detail/list annotation), onboarding schema + prompt docs
   (`travelReach`, window slugs), projector validation, `constraint`
   correction type, recommend gate + `fitTimeWindowWeight`, spec v8,
   tunables, tests.
3. **Frontend (minimal)**: locality picker on propose/edit (default
   home), reach + windows in "How we understand you" with correction
   affordances, band label on event detail ("a ferry trip away").
4. **Registers**: D62, backlog (travel willingness item), matching-spec
   version history, functional coverage.

## Open questions (beyond the sign-off points)

- **The launch register's contents** — which localities, which edges
  are `neighbors` vs `crossings`, and their postal codes: founder's
  local knowledge to fill in at implementation.
- Whether `a-trip` ever needs splitting (ferry-trip vs long-drive) —
  wait for a real member to say the band lied to them.
- Whether reach belongs in the onboarding interview's practical card
  explicitly (today it emerges from free conversation; the extraction
  stays restrained either way).
