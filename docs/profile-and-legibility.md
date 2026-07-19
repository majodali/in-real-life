# Structured Envelope & Model Legibility — Design (proposal)

The design for the two remaining Group 1 items — the **machine-comparable
envelope form** (ranking's biggest missing fit input, named in
`matching-spec.md`) and the **member-visible correction surface**
(`user-model.md` → "Backstage and legible": the subject can see and
correct what IRL believes; that surface doesn't exist yet). They are one
design because the correction surface is also how a member *sets*
structured envelope values directly — which doubles as the migration path
for members who onboarded before the structured form existed.

**Status: proposal.** The envelope vocabulary and the correction
precedence rule below need explicit sign-off — the vocabulary sits
squarely on the *creeping categorization* watch-item (`decisions.md`),
and precedence touches D7.

## 1. The machine-comparable envelope form

### Principle: position + story, never position instead of story

Each envelope dimension gains a **coarse scale position** (a 3-value
enum) *alongside* the existing free-text annotation — never replacing
it. The story stays the source of truth (Layer 1 → free-text comfort);
the position is the lossy index ranking can compare. This is the same
dual-capture pattern as event shape (D56): structured for the machine,
words for the human.

### The vocabulary (drawn from `user-model.md`'s own ranges)

Scales are deliberately **3-position** — coarse enough to resist false
precision, and each pole is language the design already uses:

| Dimension | Scale (pole ↔ pole) | Event-side comparand |
|---|---|---|
| `groupSize` | `intimate` (3–4) / `small` (5–8) / `large` (9+) | expected size: `maxAttendance` / `minimumAttendance` / confirmed count |
| `structure` | `activity-anchored` / `balanced` / `open-conversation` | shape `structure`: `structured` / `semi-structured` / `unstructured` — **direct 1:1 map** |
| `familiarity` | `needs-known-face` / `easier-with-known-face` / `fine-with-strangers` | known faces on the roster (affinity presence — already computed) |
| `role` | `wants-a-job` / `either` / `happy-to-attend` | shape `doors` contains `useful` (weak comparand — deferred) |
| `novelty` | `prefers-ritual` / `mix` / `seeks-new` | event recurrence (not modeled yet — deferred) |
| `energy` | already structured (`frequency` enum + capacity text) | over-suggestion pacing (a feed concern, not per-event fit) |

Each dimension's structured value is `{ position, growthEdge? }` where
`growthEdge` is a direction (toward which pole they want to stretch) —
the two-boundary envelope from `user-model.md`, now comparable.
Recommendation targets between comfort and edge, as designed.

**Categorization guard, stated:** the position is a *tool for fit*,
never a label. It is never shown to anyone but the member, never
aggregated into typologies, and the member can change it at will
(below). The free text always travels with it; a position without its
story is not a valid state for extraction to produce.

### Where structured values come from (three sources, D7-ordered)

1. **Onboarding extraction** — the extraction schema's `dim` gains
   optional `position` and `growthEdge` fields (extraction may omit them
   when the story doesn't support a placement — restraint over
   coverage). New members get positions from day one.
2. **Debrief/reflection deltas** — envelope updates gain an optional
   `positionShift` (`toward-<pole>` | `confirm`), applied by the
   projector as `observed` evidence: a shift moves the position one step
   only when repeated (2 shifts in the same direction; tunable), never
   on one story.
3. **Member correction** (below) — direct, instant, authoritative-fresh.

**No backfill job.** Pre-launch there are no real members to migrate;
the batched re-extraction job (`projection-store.md` → Re-derivability)
remains the designed future path, and the correction surface covers
workshop users meanwhile. This keeps the slice honest without building
the costed batch machinery early.

### Fit consumption (ranking spec v5, when implemented)

Three new fit components, each a named tunable, all capped inside
`fitCap` as today:

- **Structure fit** — direct enum comparison via the 1:1 map: exact
  match scores `fitStructureWeight`, adjacent scores half, opposite
  scores zero. Works immediately (event shape ships on every new event).
- **Size fit** — event expected size (max attendance if set, else
  confirmed + interested count, else minimum) banded into
  intimate/small/large and compared the same way.
- **Familiarity comfort** — for `needs-known-face` members only: a known
  face present (any positive affinity edge — already in the presence
  watch set) adds `fitKnownFaceWeight`. This is a *fit* component, not a
  nudge: for this member a known face is what makes the room feasible,
  which is exactly the barrier-lowering use `user-model.md` prescribes.
- Growth-edge targeting (scoring rooms *between* comfort and edge) is
  the follow-up refinement; v5 scores comfort positions only, edge
  recorded and displayed but not yet consumed.

`role`/`novelty` positions are captured but not consumed (capture ≠
use) until their comparands exist.

## 2. The legibility surface — "How we understand you"

### What the member sees (GET /me/model)

A member-facing read of Layer 2, in sentences and chips — never scores:

- **Envelope** — each dimension as a friendly statement of its position
  + growth edge, with its provenance rendered as plain language:
  "you told us" (stated/corrected) / "we've noticed" (observed), and
  the most recent story/observation excerpt behind it.
- **Doors, interests, strengths, barriers, constraints** — as chips
  with the same provenance language. Interest *weights are not shown*
  (a number would read as a score); ordering may reflect them.
- **Never shown, to anyone including the member's own view of others:**
  Layer 3 (affinity edges, crews, tap stats), contributor rating,
  any numeric weight or score. Legibility means seeing what IRL
  believes about *you* in words — not seeing the machinery.

Route: `GET /me/model` (agreement-gated), assembled from the
`irl-user-model` partition, decrypted server-side, translated to the
member-facing shape (raw store items never travel).

### Corrections (POST /me/model/correction)

Per `user-model.md` → Event mapping: "a user correction is `stated` but
with a freshness that temporarily outranks stale observations."
Mechanism:

- One command, one event: `UserModelCorrected` on the `user#` aggregate
  (PII-encrypted), carrying a small typed correction:
  - `envelope`: set a dimension's `position` and/or `growthEdge`
  - `interest-remove` / `interest-add` (add carries tag only; weight
    seeds at default)
  - `barrier-remove` ("this is no longer true" — the one-tap dignity
    path; barriers are never argued with)
- The projector applies it with provenance **`corrected`** and the
  event's `simulatedTime`.
- **Precedence rule (proposal — the D7 "temporarily outranks" made
  concrete):** a `corrected` value beats every piece of evidence *older
  than it*, of any provenance; evidence that arrives *after* the
  correction resumes normal D7 precedence (observed can again refine
  it). No counters, no expiry clocks — the correction is simply the
  newest word until life says otherwise. A member who corrects
  repeatedly is always honoured repeatedly.
- Corrections are visible in the surface as "you told us" with their
  date — the member sees their own correction took.

### What is deliberately not correctable

- Layer 3 (affinity, crews) — not shown, so not correctable; the
  capture surface (debrief taps) is where that signal is owned.
- Other people's anything.
- Contributor rating (Group 4; legibility there = own history, not
  scores).

## 3. Preferences & optional attributes (scoped out, named)

The old "optional user attributes" item resolves into three paths:

- **Structured constraints** (travel radius, time windows) — real and
  useful; a small follow-up slice extending `constraints` with
  comparable forms + the correction surface. Not in this slice.
- **"Prefer these people"** — already exists as the debrief tap; a
  standalone mark-friends surface would be a new capture channel with
  signal-hygiene questions (D21) — deferred, tracked in the backlog.
- **Demographics** — stay out entirely (D8/D9/D28); the firmly-closed
  door is not reopened by this design.

## Slice plan (after sign-off)

1. **Backend**: extraction schema extension (+ prompt doc update),
   projector `position`/`positionShift` handling, `GET /me/model`,
   `UserModelCorrected` command + projection, spec v5 fit components
   (structure/size/known-face), tunables, tests.
2. **Frontend (minimal, pre-redesign)**: profile screen section
   rendering the model + correction affordances (position pickers,
   chip remove/add).
3. **Registers**: D58 (envelope form + vocabulary), D59 (legibility
   surface + correction precedence), backlog, spec version history,
   functional coverage for the two new routes.

## Open questions (beyond the sign-off points)

- Envelope statement copy (the friendly sentences) — wording pass with
  the D15/D17 voice rules when the frontend redesign lands.
- Whether `energy` capacity deserves a structured form (pacing is a
  feed-level concern; likely its own small design).
- When real members exist: the re-extraction batch job (costed,
  designed in `projection-store.md`) to backfill positions from stored
  narratives.
