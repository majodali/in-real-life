# Localities & Structured Constraints — Design (decided: D62, implemented in ranking spec v8)

The structured-constraints follow-up named at the D58/D59 sign-off
(`profile-and-legibility.md` §3), plus its hidden dependency, named by
the founder: **a model of nearby localities and distances**, so a member
never types out every place they won't go — they state a reach once,
and everything farther gently falls down the suggestion order.

**Status: decided** (2026-07-19, D62) after two founder-review rounds,
and implemented as ranking spec v8. The reviews settled: **prioritization,
not filtering** — reach de-prioritizes, it never gates, "you never know
when someone wants to travel further for the right event, or on a
whim"; **effort is personal** — the register's bands are the
community's median judgment, the variance named, watched, deliberately
unmodeled in v1; **per-locality adjustments** are the member's
exceptions layer; and the **"wish this was closer" capture** ships
consumption-free, with the demand side tracked as radar R8.

**The launch register is a deliberate strawman** (`lib/localities.mjs`):
first-pass Kitsap band judgments, held as-is by founder decision until
it either causes real issues or advisor/workshop feedback corrects it —
the same evidence-first posture as everything else. Two known follow-ups
are tracked in the backlog, not built: the register belongs in a **data
store** eventually (in-code curation doesn't survive multi-community
operation or non-developer curators), with a **view/update/manage tool**
alongside — naturally part of the Group 4 admin surface.

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

## 2. Travel reach — prioritization, never filtering

The member states a **reach**: `here` | `nearby` | `a-trip` |
`anywhere`. **Default `anywhere`** — the constraint exists only when
the member (or their own onboarding words) sets it; we never narrow
anyone's world silently.

**Consumption (ranking spec v8): a graduated de-weight, not a gate.**
The founder's principle, recorded: *"as always this is prioritization,
not filtering — you never know when someone wants to travel further
for the right event, or on a whim."* An event's band (member home →
event locality) beyond the member's reach subtracts
`travelPenaltyPerBand` per band of excess, capped at
`travelDeweightCap` — beyond-reach rooms **sink in the suggestions,
they never leave them**:

```
penalty = min( travelDeweightCap,
               travelPenaltyPerBand × max(0, band − reach) )
```

- **The right event still wins**: the cap sits below `fitCap`, so a
  genuinely great fit outranks the distance penalty — a pottery
  intensive in Seattle can still top an island member's feed.
- **The whim door is structural**: the exploratory share fills its
  slots from the noise ordering, which ignores penalties entirely —
  distant rooms keep appearing on their own merits, tunably often.
- Nothing is ever hidden: the calendar is whole regardless; this only
  shapes suggestion order. Changing reach takes effect on the next
  feed read; a member who said "on-island only" sees island rooms
  *first*, not Bremerton *never*.

This softens the old influence-map assumption that distance would land
as a hard constraint — deliberately: in this design nothing gates
except true feasibility (capacity, conflicts, commitments, and one day
blocks). A stated reach is a strong preference about effort, not a
fact about possibility.

### Sources, D7-ordered (same pattern as D58 positions)

1. **Onboarding**: `constraints` gains optional structured
   `travelReach` (the extraction may set it only when the member's own
   words support it — "I don't really leave the island" → `here`;
   restraint over coverage; free-text `maxTravel` continues to travel
   alongside as the story). Projector validates, drops unrecognised.
2. **Correction (D59)**: a new correction type `constraint` — set
   `travelReach` (or clear to `anywhere`). Shown in `GET /me/model`
   with the usual provenance language; the member's word wins.

## 2b. Effort is personal — the v1 stance, and the patterns we watch

Named at review, and true: the register's bands are the **community's
median judgment**, but effort differs per person in both perception
and reality —

- **Mode**: most people drive for anything past 200 yards; some bike,
  walk, or ride transit and happily cover more ground.
- **Ferry sociology**: the crossing isn't one thing — some members
  will only socialize in Seattle with people *from the island*; others
  find their people over there.
- **Non-monotonic locality preference**: a member who'll drive to Port
  Orchard or Gig Harbor but not to closer Bremerton. Liking a place is
  not a distance function.

**v1 deliberately models none of this.** Small community, small range;
the personal dial v1 offers is the reach itself, and — because reach
de-prioritizes rather than gates — a band that's wrong about a person
costs them *ordering*, never *access*. The exploration floor keeps
disconfirming evidence arriving (distant rooms keep surfacing; if the
member keeps choosing them, that's data).

**Watch signals** (the patterns worth knowing, all readable from the
event log — attendance already carries member home, event locality,
and the debrief its outcome):

1. **Beyond-reach confirmations** and their debrief outcomes — members
   repeatedly traveling past their stated reach, happily: the reach
   was stated tight, or the right-event effect is real. Either way,
   grounded evidence for the personalization below.
2. **Within-reach abstention by locality** — a member never choosing a
   locality their band says is easy (the Bremerton pattern): personal
   locality preference the median band can't see.
3. **Reach correction rates** — many members correcting the same way
   = the register's band judgments are miscalibrated community-wide
   (the same aggregate-correction signal as D58's dimensions).

**Future refinement path (named, not built)**: per-member × locality
*observed* affinity — the member's lived attendance choices adjusting
their own effective bands, in the D60 spirit (grounded evidence, no
questionnaires about transport modes, no clocks). The ferry-sociology
pattern is a *company × locality* interaction and ties to the deferred
per-company travel granularity — both wait for the coarse model to
demonstrably chafe.

## 2c. Per-locality adjustments — the member's exceptions to the median

Decided at review: alongside the default banding + reach, members can
**manually bump specific localities closer or further** — the
exceptions layer. (The register itself still bands honestly on effort —
Bremerton *is* legitimately a long way around — the exception exists
because members genuinely differ from the median, in both directions.)

- **Shape**: `constraints.localityAdjustments` —
  `{ [localityId]: 'closer' | 'further' }`. An adjustment shifts that
  locality's **effective band one step** for this member (clamped at
  `here`/`far`); the travel de-weight computes from the effective band.
  One step only, deliberately: this is "the band is wrong about me,"
  not a per-place score — and `further` combined with a tight reach
  already sinks a locality hard without ever hiding it.
- **Capture, three surfaces**: onboarding extraction (only when the
  member's own words name the place — restraint over coverage); **the
  event detail** — viewing an event that carries a travel band offers
  a quiet "feels closer to me / feels further to me"; and the D59
  `constraint` correction type (set or clear an adjustment). All
  `stated` provenance, visible in "How we understand you" as their own
  word.

## 2d. "I wish this was closer" — capture now, the follow-up it opens

Named at review: a member sees a Bremerton or Seattle event and thinks
*"I wish this was closer."* That sentiment is worth recording for two
distinct reasons —

1. **Travel-preference evidence**: a wish followed by non-attendance is
   fundamentally different from silence — wanting-but-constrained, the
   exact distinction the effort-is-personal watch signals can't see on
   their own.
2. **Demand signal** (the more important one): it's a member telling us
   *what they'd like to exist locally* — the explicit-wish channel
   D51's demand sensing already names, now with its first concrete
   capture surface, feeding organizer surfacing and eventually
   app-suggested activities.

**This slice captures; consumption is the follow-up** (capture ≠ use,
the standing discipline): a light tap on a distant event's detail emits
`EventWishRecorded` — eventId, the event's locality and band, the
member's home locality, frozen at tap time — onto the log, and nothing
consumes it yet. The full design — the wish family (closer /
different-time / "more like this"), aggregation with D51's
minimum-cohort de-identification, how it reaches organizers and the
supply loop, and how it seeds event suggestions — is a radar
workstream (**R8, Demand signals & event suggestions**), activated once
wishes are accruing.

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
   (`travelReach`, `localityAdjustments`, window slugs), projector
   validation, `constraint` correction type (reach / adjustment /
   windows), recommend travel de-weight over effective bands +
   `fitTimeWindowWeight`, `EventWishRecorded` capture route, spec v8,
   tunables (`travelPenaltyPerBand`, `travelDeweightCap`), tests.
3. **Frontend (minimal)**: locality picker on propose/edit (default
   home), reach + windows + locality adjustments in "How we understand
   you" with correction affordances, band label on event detail ("a
   ferry trip away") with the feels-closer/further and
   wish-this-was-closer affordances.
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
