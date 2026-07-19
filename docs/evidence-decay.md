# Evidence-Based Decay — Design (proposal for ranking spec v6)

The fallout of the decay philosophy recorded at the D58/D59 sign-off
(`decisions.md` D59 watch note): spec v5 carries three **clock-based
half-lives** (`affinityTapHalfLifeDays` 90, `affinityConfirmedHalfLifeDays`
270, `crewHalfLifeDays` 180) that age affinity and crew strength on
elapsed simulated time. This note redesigns them on evidence instead.

**Status: proposal.** The philosophy is decided and on the record
(below); the concrete mechanism — the activity axis, the decay floors,
and the default-off counter-evidence signal — needs sign-off before
implementation.

## The philosophy, on the record (2026-07-19)

Recorded verbatim in intent, because it governs every future decay
mechanism, not just these three:

1. **A literal timer is a mechanism preferred for its ease, not its
   validity** — and "easier to explain" is part of the ease, not a
   rationale. Neither approach has overwhelming empirical support yet;
   what we need is a model we can **tune** that doesn't ignore
   potentially important factors. Direct evidence and interactions are
   far better justified than clock time. Time doesn't reduce the
   importance of information; only new grounded information can.
2. **Our evidence is known-incomplete, and the math must respect that**
   (the Bayesian element). IRL sees a slice: social contact continues
   off-platform, members under-report during selection and debrief —
   and, critically, **normalization can reduce in-platform signaling as
   a tie strengthens**: a crew can become so normal for a member that
   they tap and mention it *less*, not more. Absence of evidence inside
   IRL is weak evidence about the world outside it.
3. **Absence from a crew signifies approximately nothing.** Life and
   location interrupt in-person contact for many reasons that are
   neither disinterest nor falling-out — and reconnection after a long
   gap routinely feels like no time passed. (An adage, not a mechanism —
   but the lived pattern the mechanism must not contradict.)

Distilled requirements: **every parameter tunable (including to
off/zero)**, and **interpretation must respect incompleteness** — silence
is never treated as conclusive.

## What clock decay does today (spec v5)

| Component | Anchor | Half-life |
|---|---|---|
| Tap + mutual strength | my latest tap of that person | 90 days |
| Confirmed strength | older of the two sides' latest met-marks | 270 days |
| Crew gathering bonus | `lastAffirmedAt` | 180 days |

Each clock does a legitimate job — stale ties shouldn't steer feeds
forever; crew continuity is earned, not held — but the axis punishes
absence: a member away four months (illness, caregiving, travel) returns
to a model that has forgotten their people, exactly when known faces
matter most. And it isn't proportionate: 90 days is ~12 lived events for
a weekly member and ~3 for a monthly one, yet their ties fade alike.

## The redesign — three moves

### 1. The activity axis: decay per lived event, never per day

Keep the exponential machinery, caps, min-combiners, and generosity
weights unchanged; change what the exponent counts — **the member's own
debriefed events since the anchor**, not days since the anchor.
"The timer is the member's activity," made literal.

- Tap + mutual strength: decays per **my** debriefed events since my
  last tap of that person. Every event I live after the tap, the nudge
  was steering me toward their rooms and I went elsewhere — weak but
  real evidence, and the only grounded kind elapsed existence produces.
- Confirmed strength: decays per **min(my activity, their activity)**
  since our last reciprocal met — divergence is only evidence when
  *both* members are out living their IRL lives without each other. A
  friend gone quiet (broken leg, hard season) generates no divergence,
  so nothing fades. Same weaker-side discipline as D47's combiner.
- Crew bonus: decays per **my** debriefed events since the crew last
  gathered — each member sees the crew at the pace of their own lived
  experience. (Min-over-members is the purer form; own-activity is the
  cheap v1 — fellow-member stats reads already exist at consumption if
  the refinement earns its keep.)

Zero activity → zero decay → the away-and-return member finds their
social graph intact. Activity is measured in **debriefed events** — the
grounded "lived it" record we already maintain (`stats#affinity`), and
self-consistent: outgoing edges only ever come from debriefs, so a
member who never debriefs has no edges aging on an axis they never move.

### 2. Decay floors: the incompleteness prior

Decay-to-zero claims silence is eventually conclusive — which
known-incomplete evidence never is. Instead every component decays
toward a **floor**, not zero:

```
factor = floor + (1 − floor) × 2^(−Δactivity / halfLife)
```

The floor encodes the prior that a tie persists absent counter-evidence,
scaled by how established the tie is:

- **Fresh one-sided tap: floor 0.** A single "want to see again" with no
  reciprocation may honestly fade out.
- **Reciprocally-confirmed pair: floor ≈ 0.5.** A pattern both sides
  kept marking never falls below half strength on absence alone.
- **Crew: floor ≈ 0.5.** Same reasoning — the triad was earned through
  weighted co-attendance; silence doesn't unearn it.

Below the floor is reserved for **grounded counter-evidence only**:
avoidance capture when it lands (D49 zeroes the pair outright),
protective blocks (D50, hard), and any future explicit signal. Absence
never gets there.

Recovery is instant and total: any fresh tap, reciprocal met, or
gathering resets the anchor and the component returns to full strength —
the asymmetry that makes "reconnection feels like no time passed"
structural rather than aspirational.

Tunability: `floor = 0` recovers pure decay on the new axis; `floor = 1`
disables decay for that component entirely. Both ends stay reachable.

### 3. Ambiguous counter-evidence stays captured, not used

**Met-without-tap** (we were at the same event again; I listed them met
but didn't re-tap) looked like the sharpest decay evidence available —
it's already captured in every edge's `sources` history. The
normalization point kills its use as a default: an established crew is
*exactly* where re-tapping goes quiet because the tie is strong, and the
data cannot distinguish cooling from normalization. So it ships
**captured, default-unused** (`metWithoutTapMultiplier: 1.0` — a no-op),
a candidate tunable for *young one-sided edges only* (where novelty makes
silence more informative), promoted only if the hypothesis register earns
it evidence.

For the same reason, confirmed/crew **freshness anchoring** has a named
refinement path: roster-level co-attendance (both confirmed the same
event) is normalization-resistant — an established crew may stop
tapping and listing each other in debriefs while still appearing on the
same rosters. v6 keeps the existing met-mark anchor and lets the floor
absorb the normalization case; if floor-saturation telemetry shows
normalized crews pinned at the floor too often, the co-attendance anchor
is the next move (consumption already reads the data it needs).

## Tunables sketch (v6 proposal)

Calibrated so a weekly-cadence member sees ≈ v5 behavior early; the
divergence appears exactly where the philosophy demands it (inactive
members, established ties).

| Tunable | Proposed | Replaces / meaning |
|---|---|---|
| `affinityTapHalfLifeEvents` | 12 | `affinityTapHalfLifeDays` 90 (≈12 weekly events) |
| `affinityConfirmedHalfLifeEvents` | 36 | `affinityConfirmedHalfLifeDays` 270 |
| `crewHalfLifeEvents` | 24 | `crewHalfLifeDays` 180 |
| `affinityTapDecayFloor` | 0 | fresh signals may fade out |
| `affinityConfirmedDecayFloor` | 0.5 | established pairs never halve-below on silence |
| `crewDecayFloor` | 0.5 | crews never halve-below on silence |
| `metWithoutTapMultiplier` | 1.0 (off) | captured-not-used counter-evidence, young edges only if ever |

Caps and the ossification invariant are untouched: `affinityNudgeCap +
crewNudgeCap < fitCap` holds regardless of decay shape — floors change
how slowly a nudge fades, never how large it can be.

## Mechanics (small) and properties

- One running counter on `stats#affinity` (events debriefed) — the
  projector already maintains that item; edges and crews stamp a
  snapshot of the owner's counter at tap/affirmation time.
- Consumption already reads both sides' stats rows (generosity), so the
  confirmed min costs no extra IO.
- **Replay and determinism improve**: strengths change only when events
  happen, never silently between them. A workshop time-advance alone no
  longer ages anyone's social graph — the decay tests that today drive
  clocks forward become activity-driven, a truer test of the mechanism.
- Spam posture unchanged: generosity weights + caps still bound
  everything; a hyperactive member's own axis runs fast, so their stale
  taps fade proportionally to how much new experience they've actually
  accumulated.

## Watch signals (H4 revision)

- **Returning-member reconnection**: members lapsing ≥8 weeks — do they
  re-attend with known faces present more often than under v5's clocks?
  (The flagship case the redesign exists for.)
- **Floor saturation**: share of confirmed/crew components sitting at
  their floor. Most-at-floor means the half-life is too short or the
  floor too high — the floor should be a resting place for dormant real
  ties, not where every edge ends up.
- **Stale-steer complaints**: the one thing clocks did unconditionally
  was eventually silence everything. With floors, a persistent unwanted
  (but not block-worthy) nudge has no off-switch until avoidance capture
  (D49) lands — watch debrief texture around known-face events that
  disappoint, and treat it as pressure to prioritize D49, never to
  re-add clocks silently.

## Open questions

- Crew axis: own-activity (proposed) vs. min-over-members — revisit with
  floor-saturation data.
- Whether `energy`/pacing ever wants the same treatment (out of scope —
  pacing is a feed-level concern, its own design).
- Exact floor values are hypotheses, not principles — 0.5 is a starting
  prior to tune, not a claim.
