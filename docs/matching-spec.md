# Ranking Spec — v8 (implemented)

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
| Distance / travel willingness | **deliberately NOT a gate** (D62 revision of this table's old assumption): a stated reach de-prioritizes, never filters — see Travel de-weight below. "Prioritization, not filtering — you never know when someone wants to travel further for the right event, or on a whim" |

## Fit (base signal)

`fit = interestFit + doorFit + structureFit + sizeFit + timeWindowFit
[+ knownFaceBoost]`, capped at `fitCap`.

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

**Envelope fit (D58, `profile-and-legibility.md`)** — the member's coarse
3-position placements (`lib/envelope.mjs` vocabulary; onboarding-seeded,
debrief-shifted, member-correctable) compared against the event:

- **Structure**: member `structure.position` vs the shape's `structure`
  enum via the 1:1 map (`activity-anchored`↔`structured`, etc.) —
  `fitStructureWeight ×` adjacency (exact 1, adjacent 0.5, opposite 0).
- **Size**: member `groupSize.position` vs the event's expected-size band
  (`maxAttendance` when set, else max(threshold, current interest);
  ≤4 intimate, ≤8 small, else large) — `fitSizeWeight ×` adjacency. The
  banding is deliberately coarse, matching the coarse member scale.
- **Known face**: for a `needs-known-face` member, a positively-tapped
  person present on the candidate adds `fitKnownFaceWeight` — a **fit**
  component, not a nudge, because for that member a familiar face is what
  makes the room feasible at all. Applied inside `fitCap` in the ranker.
- A missing position on either side means the component simply doesn't
  apply — never a penalty for an unplaced member or a shapeless event.
- `role` and `novelty` positions are captured but **not yet consumed** —
  their comparands (facilitation-need on events, a member's event-history
  novelty read) don't exist yet. Capture ≠ use, named here so it's never
  silent.

**Time-window fit (D62)**: the event's window — `startTime` classified
in the community timezone (`lib/time-windows.mjs`: weekday/weekend ×
daytime/evening) — against the member's structured `timeWindows`. A
match adds `fitTimeWindowWeight`; a mismatch adds nothing. **Never a
gate**: rhythm is preference (a Tuesday-evenings member can make one
Saturday brunch, and exploration wants that door open); distance is the
feasibility-shaped one, and even it only de-prioritizes (below).
Legacy free-text window phrasings simply never match a slug.

Cold-start still holds: interests, doors, and (usually) positions all
exist from onboarding with zero history.

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

decay(Δ, halfLife, floor) = floor + (1 − floor) × 2^(−Δ / halfLife)
  tapDecay:       Δ = MY debriefed events since MY last tap of them
  confirmedDecay: Δ = min(both sides' debriefed events since their own
                         last met-mark of the pair)

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
- **Evidence-based decay (D60, `evidence-decay.md`)**: no clock
  anywhere. The axis is the member's own **debriefed events** (the
  projector-maintained `debriefedEvents` counter on `stats#affinity`;
  anchors are activity snapshots stamped on the edge at tap/met time),
  and every component decays toward a **floor**, never zero — the
  incompleteness prior. Tap-derived strength halves per
  `affinityTapHalfLifeEvents` (floor `affinityTapDecayFloor`, default 0);
  confirmed strength per `affinityConfirmedHalfLifeEvents` of
  `min(both sides' activity since their own last met-mark)` — divergence
  only counts when BOTH members are living without each other — with
  floor `affinityConfirmedDecayFloor` (default 0.5: an established pair
  never falls below half on silence alone). Zero activity → zero decay
  (the away-and-return member keeps their graph); missing anchors or
  counters → no decay (restraint over guessing); recovery on fresh
  evidence is instant and total. Below-floor is reserved for grounded
  counter-evidence: D49 avoidance zeroing when it lands, D50 blocks.
- **Met-without-tap is captured, not used**: edge `sources` already
  record co-attendance without a re-tap, but normalization (an
  established tie signaling less, not more) is indistinguishable from
  cooling — so `metWithoutTapMultiplier` ships at 1.0 with **no
  consumption path built**; promoting it is a spec bump with
  hypothesis-register evidence.
- **Reverse edges are read pointwise** — the typed sort key
  `affinity#<otherUserId>` makes "did they tap me back" a `GetItem`. The
  `otherUserId` GSI flagged in `projection-store.md` remains deliberately
  unbuilt: crew formation and consumption also turned out to be
  pointwise/partition reads, so it now waits for the ossification
  aggregate read ("who taps into this cluster") — see Crews below.
- **Own feed only.** All of this shapes the *tapper's* recommendations;
  reverse edges and stats are decrypted server-side, backstage, and never
  alter the tapped person's or any third party's ranking.
- **Avoidance zeroes the pair outright** (D47/D49/D61, spec v7): an
  `avoid` mark on EITHER direction of the edge returns strength 0 —
  structurally, in `edgeStrength` itself (a boost must never fight a
  de-weight). Either feed quietly stops being pulled toward the pair;
  nothing observable changes for anyone (information-symmetric,
  non-legible under noise). See the Avoidance section below for the
  de-weight side.

## Crews (D47) — gathering bonus, capped

**Formation (projector, incremental):** a crew is a triad whose three
pairs are all **mutual-strong** — both directions tapped positive AND
reciprocal met counts ≥ `crewMutualMetPivot` (weighted co-attendance,
never tap counts or boolean mutuals). Checked whenever a debrief lands a
positive tap; every re-detection **re-affirms** the crew
(`lastAffirmedAt`, `affirmations`). Crew rows live on every member's
partition (`crew#<hash of sorted members>`), each encrypted under that
member's own key — a shredded member simply stops carrying the crew.

**Consumption (ranker):** the crew signal is specifically the cluster
forming again — a **gathering** (≥2 fellow members present on the
candidate) adds `crewBonus × decay(myActivitySinceAffirmation,
crewHalfLifeEvents, crewDecayFloor)`, summed across crews and capped at
`crewNudgeCap`. Decay is evidence-based (D60): each member's crew row
stamps THAT member's own lived-events counter at affirmation, so the
crew fades — toward its floor (default 0.5), never below on silence —
at the pace of each member's own lived experience. A lone crew-mate is
just an affinity edge. Crew-mates are unioned into the presence watch
set so the edge limit can never hide a gathering.

**Must-not-ossify is structural:** `affinityNudgeCap + crewNudgeCap`
(0.36) is the total soft-nudge ceiling, re-applied in the ranker and
asserted below `fitCap` in tests — a crew can tilt a member toward their
people, never wall newcomers out of the score. The aggregate ossification
read (newcomer share of recurring events trending down — the gaming
register's detection signal) is future backstage work and is where the
`otherUserId` GSI finally earns its keep.

Deliberate v1 bounds, named: **triads only** (size-4 via crew merge is
future work); detection cost is O(strong partners) reverse reads per
tapped debrief — fine at community scale; the chance-rate co-attendance
baseline is the same H4 tuning work as edge confirmation.

## Avoidance (D49/D61) — comfort tier, soft de-weight, never a gate

**Capture** (D61): the debrief people step, behind a deliberately
tucked-away ⋯ affordance — never a per-person "no" chip in the main flow
(the step stays positive-first; untapped remains neutral, D21 signal
hygiene). Two typed tiers: `didnt-click` ("we didn't really click") and
`do-not-interact` ("I'd rather not cross paths"). Contradictory input
(tap + avoid on one person) is rejected at the command. The capture copy
is honest at capture time (`matching.md` #17's commitment): it reduces
co-placement, it cannot prevent co-attendance, and the named person
never knows. Safety routing is explicit in the copy: anything unsafe
belongs in the conduct question (a person reads it), never here.

**Storage**: `avoid` + `avoidedAt` on the member's own `affinity#` edge —
the newest word about the pair (D7): a later positive tap clears it, a
later avoidance replaces a tap's standing; historical counts are never
rewritten; every act stays on the edge's sources record.

**Consumption** (spec v7) — today's only surface is passive feed
suggestion, D49's SOFTEST tier; injection/composition apply their
stronger tiers when those surfaces exist:

- The pair's positive strength is zeroed structurally, either direction
  (above). An avoided person never counts as a known face (D58 fit
  boost) and never counts toward a crew gathering; an avoided pair can't
  form or re-affirm a crew at all (projector-side `mutualStrong`).
- Events where an avoided person is present take a capped de-weight in
  the NAMER's feed only: `avoidancePenalty` per do-not-interact person,
  `didntClickPenalty` per didn't-click person, summed and capped at
  `avoidanceDeweightCap`, subtracted from the event's soft nudge. Their
  room sinks; it never disappears — noise and the exploratory share
  still apply (no negative-space leak; open-risks #17).
- The de-weight never touches the named person's feed (a de-weight in
  their feed would be a snub they could eventually read).

**Deliberate v1 bounds, named**: capture happens only where members
actually cross paths (a debriefed event) — standalone naming of someone
you haven't met at an IRL event needs a people-picker that collides with
the no-directory privacy stance and waits for the blocks design (Group
4, D50/D52 — where "selective visibility" also lives). Conduct-flagged
debriefs carry no avoidance (safety ≠ preference, D22): the quarantine
drops the people step whole, and the safety path leads to a human, then
to blocks. Avoidance is Layer 3 — never shown to anyone, including the
member's own model view (D59); un-naming happens the same way naming
did: at the next shared event's debrief, or via the future blocks-tier
management surface. Tracked as H6.

## Travel de-weight (D62) — prioritization, never filtering

The locality register (`lib/localities.mjs`, served at `GET
/localities`) bands every event's declared locality against the
member's home by **curated effort, not distance**: `here` / `nearby` /
`a-trip` / `far`, from direct neighbor/crossing edges only. The member
states a **reach** (`constraints.travelReach`, default `anywhere` — no
silent narrowing) and may hold **per-locality exceptions**
(`localityAdjustments`: shift one locality's effective band a step
`closer`/`further` — the D62 exceptions layer, captured at onboarding,
on the event detail, or by correction).

```
penalty(event) = min( travelDeweightCap,
                      travelPenaltyPerBand
                        × bandsBeyondReach(effectiveBand(home, event), reach) )
```

subtracted from the event's soft-nudge net. The founder's principle,
verbatim: *"prioritization, not filtering — you never know when someone
wants to travel further for the right event, or on a whim."*
Structurally honored three ways: the cap sits below `fitCap` (a great
fit still wins), the exploratory share fills its slots from the noise
ordering which ignores penalties entirely (the whim door), and nothing
is ever hidden — the calendar is whole; only suggestion order moves.

**"I wish this was closer"** (`POST /events/:eventId/wish` →
`EventWishRecorded`) is captured alongside — event, locality, band, and
home frozen at tap time — and consumed by **nothing** yet: the demand
side (organizer surfacing, event suggestions) is radar R8; the
travel-evidence side joins the effort-is-personal watch signals in
`localities-and-constraints.md` §2b.

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

## Tunables (v8 defaults)

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
| `fitStructureWeight` | 0.25 | structure position vs shape structure, × adjacency |
| `fitSizeWeight` | 0.2 | groupSize position vs expected-size band, × adjacency |
| `fitKnownFaceWeight` | 0.2 | needs-known-face member + tapped person present (fit, not nudge) |
| `fitTimeWindowWeight` | 0.1 | event window ∈ member's structured windows (never a gate) |
| `travelPenaltyPerBand` | 0.15 | de-weight per effective band beyond the stated reach |
| `travelDeweightCap` | 0.45 | max travel de-weight per event (< fitCap — the right event wins) |
| `affinityPerPersonNudge` | 0.12 | one-sided component, × own generosity weight |
| `affinityMutualBonus` | 0.12 | mutual amplification, × min(w_me, w_them) |
| `affinityConfirmedBonus` | 0.08 | reciprocal-met confirmation, × scale (not weight-gated) |
| `affinityConfirmationPivot` | 3 | reciprocal met count at which confirmation saturates |
| `affinityTapHalfLifeEvents` | 12 | tap-strength half-life in MY lived events (was 90 days ≈ 12 weekly events) |
| `affinityConfirmedHalfLifeEvents` | 36 | confirmed half-life in min-of-both-sides lived events (was 270 days) |
| `affinityTapDecayFloor` | 0 | tap-decay asymptote — a fresh one-sided tap may fade out |
| `affinityConfirmedDecayFloor` | 0.5 | confirmed-decay asymptote — silence never conclusive for established pairs |
| `metWithoutTapMultiplier` | 1.0 | captured-not-used; no consumption path built (promoting it = spec bump) |
| `affinityNudgeCap` | 0.24 | max total affinity contribution per event |
| `crewMutualMetPivot` | 2 | reciprocal met count for a pair to be crew-strong |
| `crewBonus` | 0.1 | per crew gathering (≥2 fellows present), × affirmation decay |
| `crewNudgeCap` | 0.12 | max total crew contribution per event |
| `crewHalfLifeEvents` | 24 | crew half-life in MY lived events since affirmation (was 180 days) |
| `crewDecayFloor` | 0.5 | crew-decay asymptote — a crew is never unearned by silence |
| `affinityGenerosityPivot` | 12 | positive taps before self-discount begins |
| `affinityEdgeLimit` | 20 | strongest edges consulted per ranking |
| `avoidancePenalty` | 0.12 | de-weight per do-not-interact person present (namer's feed only) |
| `didntClickPenalty` | 0.04 | de-weight per didn't-click person present |
| `avoidanceDeweightCap` | 0.24 | max total avoidance de-weight per event |
| `explorationNoise` | 0.2 | amplitude of the per-event deterministic noise |
| `explorationShare` | 0.25 | guaranteed exploratory share of list slots |

**Invariant (open-risks #6, structural):** `affinityNudgeCap +
crewNudgeCap < fitCap` — all soft nudges together stay below what fit can
express, so no outcome is ever driven solely by a backstage signal. The
unit tests assert this relationship against the defaults.

## Deliberately absent (and where each lands)

| Input | Why absent | Lands with |
|---|---|---|
| Role / novelty fit | positions captured (D58) but comparands don't exist yet | facilitation-need on events; event-history novelty read |
| Crew size 4 / crew merge | v1 detects triads only | crews follow-up |
| Ossification aggregate read | newcomer-share trend per recurring event (gaming register signal); this is where the `otherUserId` GSI becomes necessary | backstage/admin slice |
| Co-attendance chance-rate baseline | v1 confirmation uses raw reciprocal met counts; thin-calendar correction is tuning work | H4 evidence loop |
| Contributor rating | not built (Group 4); composition-only anyway | rating slice |
| Standalone avoidance naming (no shared event) | needs a people-picker vs. the no-directory stance | blocks design (Group 4, D50/D52) |
| Graduated avoidance tiers (injection / composition) | those surfaces don't exist yet — passive feed is D49's softest tier | group formation / composition slices |
| Newcomer injection into others' feeds | no people-surfaces/composition yet | group formation slice |
| Blocks (D50/D52) | Group 4; advocate review first | protective-blocks build |
| Per-member × locality observed affinity | the coarse median bands must demonstrably chafe first | effort-is-personal refinement (`localities-and-constraints.md` §2b) |
| Wish consumption (demand → suggestions) | captured, deliberately unconsumed | radar R8 |

## Version history

- **v8** — localities & structured constraints (D62,
  `localities-and-constraints.md`): the curated effort-band register
  (no coordinates, direct edges only, served at `GET /localities`,
  absorbing the sign-up allowlist), organizer-declared event locality,
  travel reach as a **graduated de-weight** over per-member effective
  bands (adjustments = the exceptions layer) — prioritization, never
  filtering; time-window fit as a soft component; the
  "wish this was closer" capture (`EventWishRecorded`, consumed by
  nothing — R8). The hard-constraints table's old distance row
  deliberately softened.
- **v7** — avoidance (D49/D61): comfort-tier capture in the debrief
  people step (two typed tiers behind a tucked-away affordance;
  contradictory tap+avoid rejected), pair zeroing either-direction
  inside `edgeStrength` (no crew formation, no known-face, no gathering
  through an avoided pair), capped soft de-weight in the namer's feed
  only (`avoidancePenalty` / `didntClickPenalty` / `avoidanceDeweightCap`).
  Soft-only, information-symmetric, never shown to anyone. This is the
  grounded counter-evidence path the D60 floors reserve below-floor
  space for. Tracked as H6.
- **v6** — evidence-based decay (D60, `evidence-decay.md`): the three
  clock half-lives replaced by the lived-events axis (own debriefed
  events for tap strength and crews; min-of-both-sides for confirmed
  strength) with decay floors as the incompleteness prior (tap 0,
  confirmed 0.5, crew 0.5 — below-floor reserved for grounded
  counter-evidence, D49/D50). Zero activity → zero decay; recovery on
  fresh evidence instant and total; met-without-tap captured-not-used.
  A workshop time-advance alone no longer ages the social graph —
  strengths change only when events happen (replay determinism
  improves). Calibrated to ≈ v5 rates for a weekly-cadence member.
- **v5** — envelope fit (D58/D59): member 3-position placements
  (`lib/envelope.mjs`) become fit inputs — structure via the 1:1 shape
  map, group size via attendance banding, known-face comfort as a
  presence-dependent fit boost inside `fitCap` (fit, not nudge).
  Positions are member-legible and correctable (`GET /me/model`,
  `POST /me/model/correction`); a correction beats all older evidence,
  and observed shifts move a position one step only when they repeat.
- **v4** — crews (D47/D57): triad formation on mutual-strong pairs
  (reciprocal-met pivot), per-member encrypted crew rows, gathering bonus
  with affirmation decay, separate cap; total soft-nudge ceiling
  `affinityNudgeCap + crewNudgeCap` still below fitCap. GSI deferred a
  third time, now to the ossification aggregate read — formation and
  consumption are both pointwise/partition reads.
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
