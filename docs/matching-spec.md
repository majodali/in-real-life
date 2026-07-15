# Ranking Spec — v2 (implemented)

The **explicit, versioned ranking spec** that `matching.md` requires ("how
recommendations are ranked is never implicit or emergent-from-code"). This
file is the source of truth for what the live ranker actually computes;
`infrastructure/lambda/api/matching/tunables.mjs` mirrors the version number
and every default verbatim. Change here first. A change to any input or
weight flows through the hypothesis register (`hypotheses.md`) and, when
consequential, the decision register.

`matching.md` holds the philosophy and the influence map; this file holds
the current mechanics — including an honest register of what the spec
deliberately does **not** do yet, and why.

## What it ranks

`GET /events` returns, alongside the full event list, a `recommendations`
array: the caller's feasible, joinable events **ordered** by the ranker.
Ordering is the only thing that leaves the server — **no score, fit value,
or nudge ever appears in a response** (backstage-and-legible: a member sees
an order, never a number). Events absent from the list are infeasible for
this member right now (full, conflicting, already committed, or not
joinable), not "scored low".

## Hard constraints (the only gate)

Filtered out before scoring, per the influence map:

| Constraint | Status |
|---|---|
| Joinable lifecycle | implemented — only `idea` / `proposed` / `planned` are candidates |
| Capacity | implemented — `full` events are not recommended (interest stays open on the event itself) |
| Schedule overlap | implemented — candidates overlapping any of the caller's live confirmed commitments are excluded (half-open intervals; ideas never conflict) |
| Already committed | implemented — an event the caller already confirmed is a plan, not a recommendation |
| Protective blocks (D50) | **not built** (Group 4). Noted here so the gap is never silent: when blocks land, the candidate filter is where they apply |
| Adults-only | enforced at registration, not per-event |
| Distance / travel willingness | **not built** — no structured locality/travel model yet (single-locality launch; `constraints.maxTravel` in the store is free text) |

## Fit (base signal)

`fit = interestFit + doorFit`, capped at `fitCap`.

**Interest fit is two-tiered** against the event's shape (D56,
`event-shape-prompt.md` — extracted at propose time, organizer-correctable):

- An interest matching the shape's `activityTags` scores
  `fitActivityTagWeight × interestWeight` — the high-confidence tier.
- Otherwise, a match against the `title + description` token set scores
  `fitInterestWeight × interestWeight` — the fallback that keeps
  shapeless/older events ranking. One interest never scores both tiers.

A tag **matches** when at least half its tokens (rounded up) appear in the
target token set (lowercased, alphanumeric tokens, naive
plural-stripping). Interest weights come from the user-model store
(`interest#` items: onboarding-seeded, debrief-adjusted ±0.1 per
D7-observed delta; default `interestDefaultWeight` when unset).

**Door fit is structured on both sides**: the member's onboarding door
weights (`profile#core` → `doors`) against the shape's doors — each shared
door scores `fitDoorWeight × memberDoorWeight`.

**Still deliberately thin on the envelope:** the shape's `structure` is
**captured, not used** (capture ≠ use) — the member-side comfort envelope
remains free-text annotations (`comfort: "small groups"`), so there is
nothing honest to compare against yet. When the envelope gets a comparable
form (a member-model evolution, i.e. a re-extraction job per
`projection-store.md`), structure/size fit lands with no event-side
backfill needed. Cold-start still holds: interests and doors both exist
from onboarding with zero history.

## Affinity nudge (outgoing only, capped)

For each candidate event, count the people this member has tapped "want to
see again" (positive taps only — `affinity#` edges with `seeAgain > 0`,
top `affinityEdgeLimit` edges by tap count) who are currently interested
or confirmed on that event. Then:

`nudge = min( affinityNudgeCap, count × affinityPerPersonNudge × generosity )`

`generosity` is the H2-lite self-discount (D47's transform, simplest
form): `1` while the member's total positive taps ≤
`affinityGenerosityPivot`, then `pivot / totalTaps` — a member who taps
everyone nudges their own feed toward no one in particular.

Scope honesty (per the influence map):

- **Own feed only.** A tap boosts the *tapper's* recommendations. It never
  alters the tapped person's or any third party's ranking.
- **Mutual amplification is not in yet.** Consuming mutuality requires
  reading the *other* member's edges (a cross-partition read needing the
  `otherUserId` GSI flagged in `projection-store.md`), and D47's full
  strength model (weaker-side combiner, co-attendance confirmation,
  differential decay). Deferred to the affinity/crews slice; the one-sided
  nudge here is the component D47 says survives untouched.
- **Do-not-interact zeroing** (D47/D49) has nothing to zero yet —
  avoidance capture is Group 3/4 work. When it lands, it zeroes the pair's
  nudge here.

## Exploration (noise + floor)

Two mechanisms, per `matching.md`:

- **Noise on every score:** `explorationNoise × hash01(userId | eventId |
  specVersion | weekBucket)`. Deterministic (replayable, testable), varies
  per member/event, reshuffles weekly. Softness is a feature: mechanical
  obvious ranking is the worst UX, and noise keeps placement effects from
  reading as clean signal.
- **Guaranteed exploratory share:** after score-ordering, every *k*-th slot
  (k ≈ 1/`explorationShare`) is filled from a pure noise-ordered list
  instead — a fixed floor of recommendations that owe nothing to fit or
  affinity.

**Newcomer injection note:** the floor here is exploration within one member's
own feed. The *injection* half of `matching.md`'s floor — newcomers
surfaced into others' rooms — becomes meaningful when there are
people-surfaces and group composition to inject into; today the feed is
events-only, and a newcomer's own cold-start is already served (fit works
from onboarding, and with a thin model the noise share dominates —
their feed is naturally exploratory).

## Tunables (v2 defaults)

Every value is configuration, not a constant; **tunable to zero** (zeroing
`affinityPerPersonNudge` removes affinity entirely; zeroing
`explorationShare` and `explorationNoise` yields pure fit order).

| Tunable | Default | Meaning |
|---|---|---|
| `fitActivityTagWeight` | 0.5 | score per interest matching the shape's activityTags, × interest weight |
| `fitInterestWeight` | 0.4 | score per interest matching title+description (fallback tier), × interest weight |
| `fitDoorWeight` | 0.15 | score per shared door, × member door weight |
| `fitCap` | 1.0 | max total fit contribution |
| `interestDefaultWeight` | 0.5 | interest weight when the item carries none |
| `affinityPerPersonNudge` | 0.12 | per tapped-person-present, × generosity |
| `affinityNudgeCap` | 0.24 | max total affinity contribution |
| `affinityGenerosityPivot` | 12 | positive taps before self-discount begins |
| `affinityEdgeLimit` | 20 | strongest edges consulted per ranking |
| `explorationNoise` | 0.2 | amplitude of the per-event deterministic noise |
| `explorationShare` | 0.25 | guaranteed exploratory share of list slots |

**Invariant (open-risks #6, structural):** `affinityNudgeCap <
fitCap` — all soft nudges together stay below what fit can express, so no
outcome is ever driven solely by a backstage signal. The unit tests assert
this relationship against the defaults.

## Deliberately absent (and where each lands)

| Input | Why absent | Lands with |
|---|---|---|
| Envelope fit (size/structure) | member envelope is free text — shape's `structure` captured, not used | structured profile form (member-model re-extraction, Group 3) |
| Mutual affinity strength (D47) | needs `otherUserId` GSI + strength model | affinity/crews slice |
| Crews | needs mutual edges + co-attendance detection | crews slice |
| Contributor rating | not built (Group 4); composition-only anyway | rating slice |
| Avoidance / didn't-click | capture not built | preferences/safety slices |
| Newcomer injection into others' feeds | no people-surfaces/composition yet | group formation slice |
| Blocks (D50/D52) | Group 4; advocate review first | protective-blocks build |
| Travel/distance | no structured locality model | travel-willingness slice |

## Version history

- **v2** — event shape (D56): interest fit gains the activityTags tier
  (`fitActivityTagWeight`, text match demoted to fallback), door fit added
  (`fitDoorWeight`); shape `structure` captured-not-used. Spec-version bump
  reshuffles the deterministic exploration noise.
- **v1** — first implemented spec: interests-only fit, outgoing capped
  affinity nudge with generosity self-discount, deterministic
  noise + exploratory-share floor, hard-constraint candidate filter.
