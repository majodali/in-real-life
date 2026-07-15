# Ranking Spec — v3 (implemented)

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

## Affinity nudge (strength-weighted, capped — D47/H4)

For each candidate event, the people this member has tapped "want to see
again" (positive taps only — `affinity#` edges with `seeAgain > 0`, top
`affinityEdgeLimit` edges by tap count) who are currently interested or
confirmed on that event each contribute their edge **strength**
(`matching/affinity.mjs` — strength, never a boolean):

```
w_me   = generosity(my tapsGiven)      w_them = generosity(their tapsGiven)
generosity(n) = 1 while n ≤ affinityGenerosityPivot, else pivot / n

strength = affinityPerPersonNudge × w_me × tapDecay              (one-sided)
         + affinityMutualBonus × min(w_me, w_them) × tapDecay    (if they tapped back)
         + affinityConfirmedBonus                                 (if mutual AND
             × min(1, reciprocalMet / affinityConfirmationPivot)   reciprocally met)
             × confirmedDecay

nudge(event) = min( affinityNudgeCap, Σ strengths of tapped people present )
```

- **Generosity inputs** come from the projector-maintained `stats#affinity`
  item (running `tapsGiven` / `peopleMet` totals per member — the shared
  H2 transform's substrate). Missing stats fall back benignly (own side:
  sum own edges; other side: weight 1 — a replay gap, not selectivity).
- **Weaker-side combiner**: a mutual is two claims, credible only as its
  less selective tapper — a spam tapper's "mutuals" amplify ≈ nothing,
  while their own one-sided component survives at its own (self-discounted)
  weight, exactly D47's split.
- **Confirmation is reciprocal-met**: `reciprocalMet = min(my met count,
  their met count)` — both members must keep marking each other met, so
  co-presence alone (a follower) never strengthens the edge (F13 guard,
  structural). Deliberately **not** weight-gated: observed beats inferred —
  behaviour confirms what taps can't. v1 uses raw reciprocal counts; the
  above-calendar-chance-rate baseline is named H4 tuning work.
- **Dual half-lives**: tap-derived strength decays on
  `affinityTapHalfLifeDays`, confirmed strength on the longer
  `affinityConfirmedHalfLifeDays`; confirmed freshness takes the OLDER of
  the two sides' latest met. All decay anchors to simulated time
  (replay-safe).
- **Reverse edges are read pointwise** — the typed sort key
  `affinity#<otherUserId>` makes "did they tap me back" a `GetItem`, so
  the `otherUserId` GSI flagged in `projection-store.md` is deliberately
  NOT built yet: it becomes necessary when crew detection asks set-level
  questions ("who taps into this cluster"), and lands with that slice.
- **Own feed only.** All of this shapes the *tapper's* recommendations;
  reverse edges and stats are decrypted server-side, backstage, and never
  alter the tapped person's or any third party's ranking.
- **Do-not-interact zeroing** (D47/D49) has nothing to zero yet —
  avoidance capture is Group 3/4 work. When it lands, it zeroes the pair's
  strength here outright (a boost must never fight a de-weight).

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

## Tunables (v3 defaults)

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
| `affinityPerPersonNudge` | 0.12 | one-sided component, × own generosity weight |
| `affinityMutualBonus` | 0.12 | mutual amplification, × min(w_me, w_them) |
| `affinityConfirmedBonus` | 0.08 | reciprocal-met confirmation, × scale (not weight-gated) |
| `affinityConfirmationPivot` | 3 | reciprocal met count at which confirmation saturates |
| `affinityTapHalfLifeDays` | 90 | tap-derived strength half-life |
| `affinityConfirmedHalfLifeDays` | 270 | confirmed strength half-life (observed decays slower) |
| `affinityNudgeCap` | 0.24 | max total affinity contribution per event |
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
| Crews | needs weighted co-attendance accumulation + the `otherUserId` GSI (set-level queries — pointwise reverse reads sufficed for mutuals) | crews slice |
| Co-attendance chance-rate baseline | v1 confirmation uses raw reciprocal met counts; thin-calendar correction is tuning work | H4 evidence loop |
| Contributor rating | not built (Group 4); composition-only anyway | rating slice |
| Avoidance / didn't-click | capture not built | preferences/safety slices |
| Newcomer injection into others' feeds | no people-surfaces/composition yet | group formation slice |
| Blocks (D50/D52) | Group 4; advocate review first | protective-blocks build |
| Travel/distance | no structured locality model | travel-willingness slice |

## Version history

- **v3** — affinity becomes strength-weighted (D47/H4 v1): mutual
  amplification gated by the weaker side's generosity (`stats#affinity`
  substrate maintained by the projector), reciprocal-met confirmation with
  the F13 one-sided guard, dual half-lives on simulated time. The
  `otherUserId` GSI deliberately deferred to crews (reverse reads are
  pointwise via the typed sort key).
- **v2** — event shape (D56): interest fit gains the activityTags tier
  (`fitActivityTagWeight`, text match demoted to fallback), door fit added
  (`fitDoorWeight`); shape `structure` captured-not-used. Spec-version bump
  reshuffles the deterministic exploration noise.
- **v1** — first implemented spec: interests-only fit, outgoing capped
  affinity nudge with generosity self-discount, deterministic
  noise + exploratory-share floor, hard-constraint candidate filter.
