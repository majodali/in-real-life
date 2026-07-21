# The Event-Type Register — Design (proposal)

The Group 3 construct several built pieces have been explicitly waiting
on: **shape describes one listing (D56); the register describes
kinds.** Reserved consumers already in the codebase and notes:
`outcome#{eventType}` rows in the user-model store (reserved since
D36), the debrief's parked `eventTypeOutcome` / `forecastError`
extractions, the novelty envelope dimension (D58 — captured, no
comparand), R8's demand vocabulary ("more like this" needs a *this*),
the curated illustration set (Group 7), and external-event
source/operator vetting (D31).

## 0. The primary purpose, user-first: repetition

Asked at review — *from the downstream list, could we explain to a
member why event types exist?* — and the honest answer to the first
draft was no: every consumer was system-serving. The purpose that
survives that test:

**Types exist so "worth another go?" can keep its promise.** Every
debrief asks it; today a "yes" goes nowhere the member can feel —
nothing in ranking consumes again-intent, and the repetition engine
the mission leans on has no mechanism for bringing a member the next
one of the thing they said yes to. A kind is the key that makes
repetition findable. The one-sentence explanation, owed at every
level:

- **To the member**: *"When you tell us something was worth doing
  again, kinds are how we find you the next one."*
- **To the organizer**: *"Filing your gathering right is how the right
  people's 'again' finds it."*
- **To us**: a filing key. Nothing more.

Everything else this note unlocks — outcome substrate, novelty fit,
demand vocabulary, coaching — is secondary to that, and the v1 scope
below reflects it: **again-intent re-surfacing is the flagship
consumer, and member-facing type display is deferred until a surface
genuinely serves the member** (no formality presented before it has
user meaning).

**Status: proposal.** Three sign-off points: how a type is born
(recurrence-earned, never taxonomy-first), the scope order (types now;
venues and operators designed here, built later), and the privacy line
(registers describe kinds, never members).

## 1. Three registers, one discipline

| Register | Describes | First consumers | v1? |
|---|---|---|---|
| **Event types** | kinds of gathering ("board-game night", "morning walk") | member outcome rows, novelty fit, R8 vocabulary, illustrations | **yes** |
| **Venues** | standing places events recur at | accessibility/suitability attributes, safety flags, meeting-spot reuse | designed, deferred |
| **Operators** | external sources whose events IRL surfaces | D31 source vetting, not-as-described patterns | designed, deferred |

One discipline across all three, inherited from the locality register
(D62): **curated entries, legible judgments, strawman first** — a
small file a human can read and argue with, promoted to a data store +
management tool alongside the localities register when the admin
surface lands (both are the same follow-up).

## 2. Types vs tags: tags describe, types identify

The five governance questions, asked at review and answered here:

**What's the difference between a type and a tag?** A tag
(`shape.activityTags`, D56) is a free word about *one listing* — open
vocabulary, LLM-extracted from the organizer's own words, uncurated,
disposable. A type is a durable **key** for a *kind* — the thing
history accumulates against (outcome rows), demand names ("more like
this"), and an illustration attaches to. Tags can't do the type job
because accumulation against an open vocabulary fragments: "board
games" / "boardgames" / "game night" / "tabletop" would each accrue
separate outcome rows, splitting one member's history four ways. Same
dual-capture pattern as comfort-stories ↔ envelope positions and
location-strings ↔ locality register: open words for richness, curated
keys for accumulation. The bridge runs both ways — recurring tags are
how a type is born; tags are how a listing finds its type.

**Can event creators mint types?** Tags, yes — freely and forever
(their words drive extraction; they correct shape at will). Types, no,
by design: a type is a claim that a kind *recurs in the community* — a
community-level fact, not a per-listing one; per-organizer minting
rebuilds the exact fragmentation types exist to solve. No wall, though
(D30): **their free tags ARE the proposal mechanism** — recurring tags
with no type is precisely the backstage signal that prompts curation.
An organizer proposes a type by running that kind of gathering more
than once.

**Who curates, and how does it stay accurate?** The founder, strawman
posture (same as localities), graduating to the register store +
management tool and R1's register-governance process. Three legible
accuracy checks, all house patterns: assignment is deterministic from
`matchTags`, so accuracy is auditable by sampling recent assignments
per type; **organizer corrections away from a type are the
miscalibration signal** (the same aggregate-correction read as D58
dimensions and D62 reach); untyped-rate over recurring tag clusters
flags missing entries. Outcome rows later add a semantic check: one
type with wildly bimodal outcomes across members is probably two kinds
wearing one key — a split candidate.

**Can meaning evolve?** Yes, at two speeds. What a type *catches*
evolves freely — `matchTags` are editable curation (no migration) and
`name` is display-only (renames free). What a type *is* evolves through
evidence — outcome rows keep accruing from the newest debriefs, so
gradual community drift is absorbed while identity continuity holds.
When drift is really a different kind, the answer is a **split**: new
type, old one retired; histories never merged or rewritten. The key
discipline underneath: **an id is never reused.**

**Are unused types retired?** Retirement, never deletion: a `retired`
flag (the `served` pattern). Retired types stop matching new events and
leave the organizer picker; existing events and every member's
`outcome#` rows keep their meaning — history with a retired kind still
informs the novelty read. Consistent with the decay philosophy (D60):
quiet usage alone never auto-retires — retirement is a curatorial
judgment prompted by evidence, not a timer.

## 2b. The dataflow, explicit: everything upstream and downstream

Types are **graduated tags** (the founder's frame, adopted): tags that
earned formality through recurrence so preferences and feedback have a
stable anchor. Formality has consequences, so the full dataflow is
enumerated here — nothing reaches or leaves a type assignment silently.

### Upstream — what informs an assignment

1. **The organizer's own words**: title + description → the extracted
   `activityTags` (D56) → matched against register `matchTags`; title
   tokens as fallback. Content only.
2. **The register's curation**: which entries exist, their matchTags —
   human judgments, editable without migration.
3. **The organizer's correction**: authoritative, replaces the match,
   never re-derived over (the D56 pattern).

**Deliberately NOT upstream**: attendance patterns, debrief outcomes,
who's coming, the venue, the time, member feedback of any kind.
**Evidence flows into curation, never directly into assignment** —
outcomes and corrections inform the human judgment to add/split/retire
entries; they never re-type an event automatically. Automatic
behavioral reassignment would make types self-confirming and hand the
community silent recategorization — exactly the dynamic §7 exists to
prevent.

### Downstream — every consumer of `eventTypeId`

In v1 (this slice):

1. **Again-intent re-surfacing — the flagship (§0)**: the member's
   outcome row keeps their latest "worth another go?" answer per kind;
   future events of that kind earn `fitAgainWeight` on a `yes` (half
   on `maybe`, **nothing on `no`** — never a penalty: a no may have
   been about that night, not the kind, and the texture/envelope
   channels already carry the why). The strongest-provenance fit input
   in the system — the member's own *stated* word, D7's top shelf —
   and the one that makes the debrief's question consequential.
2. **Member outcome rows** (`outcome#{eventTypeId}`) — again-intent +
   tallies + energized-texture + forecast error, in the member's own
   encrypted partition. Scope: that member's model, nothing else.
3. **Novelty fit** (spec v9) — a small, capped, per-member fit
   component from their own history with the type/family. Scope: the
   member's own suggestion ordering, inside `fitCap`, under noise.
4. **Organizer correction surface** — the edit picker (organizers have
   a real reason to care: §0's second sentence). **Member-facing type
   display is deferred** — no chip, no label — until a surface
   genuinely serves the member ("more like this", illustrations, the
   "you said you'd do this again" explanation line). §7 governs the
   language whenever display arrives.

Named future consumers (each is its own activation, none silent):

5. The "you said again" legibility line on suggested events — the
   rare chance to explain a ranking input honestly, in the member's
   own words back to them (copy design with the voice pass).
6. Coaching/reflection grounding ("workshops leave you energized" —
   voice pass, D27 modesty).
7. "How we understand you" outcome sentences (D59 follow-up — never
   tallies).
8. R8 demand vocabulary (wishes, "more like this", invitation-to-
   propose seeds).
9. D51 fit-gap / supply reads per type (min-cohort, de-identified).
10. The curated illustration set (Group 7).
11. Venue/operator suitability cross-reads (deferred registers).

**Deliberately NEVER downstream**: gating or visibility of any kind
(untyped ranks identically); people-matching (the D58 events-not-people
line holds — types order events per member, never members); contributor
rating; pricing/policy treatment; any public popularity or quality read
of a type. **A type is a key, never a judgment.**

## 3. How a type is born: earned by recurrence, never taxonomy-first

The wrong way to build this is inventing a taxonomy of gatherings and
forcing every listing into it — creeping categorization applied to
events, and a dead vocabulary within a season. Instead:

- **Types are earned.** A register entry exists because that kind of
  gathering *recurs in this community* (or is obviously about to). The
  strawman launch register is seeded from what the workshop calendar
  actually contains; new entries are curation prompted by evidence —
  recurring activityTags with no type is the signal (a cheap backstage
  read).
- **Assignment is deterministic and free.** At propose time the event's
  extracted shape already carries `activityTags`; the register matches
  tags (and title tokens as fallback) against each entry's `matchTags` —
  **no extra LLM call**, no new latency, replayable. The result stamps
  the event row as `eventTypeId`.
- **Organizer-correctable, same as shape (D56).** The edit surface
  offers the register's types; the organizer's word replaces the
  match and is stamped as theirs. Nothing re-derives over a correction.
- **Untyped is a first-class state.** A one-off gathering that matches
  nothing stays untyped — restraint over coverage; forcing a kind onto
  a singular thing is exactly the false precision this design keeps
  refusing. Untyped events rank normally (every existing fit input is
  type-free); they simply generate no outcome rows.

### Register entry shape (`lib/event-types.mjs`, strawman)

```jsonc
{
  "id": "board-game-night",
  "name": "Board-game night",
  "matchTags": ["board games", "game night", "tabletop"],
  "family": "games"   // coarse grouping for novelty ("new kind vs new family")
}
```

`family` is the one deliberate extra: the novelty read (below) wants
"is this *kind of thing* new to them", and "chess club after years of
board-game nights" is not the same novelty as "first pottery class."
Families are few and obvious (games, making, food, outdoors, learning,
conversation, service); a type belongs to exactly one.

### Not a taxonomy — flat, plus one coarse grouping

Types deliberately do **not** form a taxonomy, strict or otherwise:
a flat list, plus the single-level `family` grouping — no hierarchy
among types, no inheritance, no cross-links, no sub-types. Taxonomies
invite completeness pressure (everything must fit somewhere), boundary
disputes, and classification politics — the categorization dynamics
this design keeps refusing. Flat-plus-family is the least structure
the named consumers need; `family` leans backstage (novelty math), not
a browsing hierarchy. If browse-by-kind ever becomes a UX want, that's
a new decision taken with §7 open on the table.

### When multiple types match

Resolution is deterministic and restrained: the type matching the
**most** matchTags wins; a **tie is treated as ambiguity and assigns
nothing** — a visible wrong guess is worse than no guess (the locality
default-to-home reasoning), and the organizer can always pick from the
register at edit. Two health signals fall out: a high tie-rate between
two entries is a curation smell (overlapping matchTags — tighten or
merge), and a genuinely recurring hybrid ("games potluck") earns its
own entry rather than multi-typing — one event carries **one type or
none**, because the key exists for clean accumulation, and splitting
one gathering's outcome across two keys halves the signal and doubles
the ambiguity.

## 4. What the register unlocks in v1

### Member outcome rows — `outcome#{eventType}` finally lands

`DebriefSubmitted` gains the event's `eventTypeId` (frozen at command
time, like everything else); the projector maintains one encrypted
`outcome#{eventTypeId}` row per member per type: **`lastAgain`** (the
member's latest repetition intent — the flagship's input, D7 newest
word), attended/again tallies (`yes`/`maybe`/`no`), the debrief's
parked **`eventTypeOutcome`** extraction (energized/drained texture,
with its condition) and **`forecastError`** storage (predicted vs
actual — the calibration read) finally have their home. All of it is
the member's own encrypted model — the register itself never holds
member data (§6).

### Again-intent fit — the flagship consumer (spec v9)

`fitAgainWeight` (proposed 0.3 — the member's own stated word deserves
more than any inference) when the candidate's type carries
`lastAgain: 'yes'`, half on `'maybe'`, nothing on `'no'` or no
history. Inside `fitCap` like every component; the member's word can
be superseded only by their own next word (the next debrief of that
kind — D7, no clocks, per D60).

Consumption is deliberately thin at first — the rows are the
**substrate** for coaching ("workshops leave you energized; big
unstructured rooms don't — want more of the first?"), for D51 fit-gap
reads, and for the one ranking use below. Capture ≠ use holds:
tallies accrue from day one; each consumer is named work.

### Novelty fit — D58's last unconsumed dimension gets its comparand

`novelty.position` (`prefers-ritual` / `mix` / `seeks-new`) has been
captured-not-used since the envelope slice because "is this new to
this member" wasn't answerable. Now it is: the member's outcome rows
say whether this type (and family) is familiar ground.

- `seeks-new`: a type they have **no history with** earns
  `fitNoveltyWeight` (family-new earns it fully; type-new within a
  familiar family, half).
- `prefers-ritual`: a type they **keep returning to** (attended ≥ a
  small pivot) earns the same weight — ritual is real fit, not a rut;
  the exploration floor keeps stretching them regardless.
- `mix` (or no position, or an untyped event): the component simply
  doesn't apply. Never a penalty in any direction — this is spec
  discipline by now: components add, caps bound, nothing gates.

Ranking spec **v9**: `fitNoveltyWeight` (small — proposed 0.1) inside
`fitCap`, computed from the member's own outcome rows already loaded
with their model. No new reads.

## 5. Venues and operators — designed, deliberately deferred

- **Venues** become real when the same `location` string keeps
  recurring — the registry entry gives it identity (name, locality,
  accessibility attributes, suitability notes, safety flags routed
  from debrief conduct/policy channels — never preference signal,
  D22). Deferred because standing-venue recurrence barely exists
  pre-launch; the trigger is the same admin-surface slice that gives
  registers a store and a manager.
- **Operators** become real with external-event volume (D53 stewards
  post them; the operator is who *runs* them). Entry: identity, their
  events' track record (not-as-described flags, attendance outcomes,
  cost-disclosure patterns per D34) feeding D31's vetting posture.
  Deferred until external events are more than a trickle; the
  not-as-described debrief flag already accrues on the log, so nothing
  is lost by waiting.

Both inherit the types discipline wholesale: earned by recurrence,
curated with legible judgments, never member data.

## 6. The privacy line, stated once

**Registers describe kinds, places, and operators — never members.**
Everything member × type lives as `outcome#` rows in that member's own
encrypted partition, shredded with their key, invisible to everyone
including other members' ranking. Anything aggregate built later
(R8 demand reads, "what works here" quality-loop claims under D27
modesty) obeys D51's minimum-cohort de-identification. The register
entries themselves are public curated data, like localities.

Legibility note (D59): outcome rows are the member's own Layer 2 and
belong in "How we understand you" eventually — as sentences
("board-game nights seem to leave you energized"), never tallies. The
GET /me/model surface skips unknown row kinds today, so nothing leaks
before that copy is designed; surfacing them is a named follow-up, not
scope here.

## 7. Types as communication — the formality risk, named

Raised at review, and the deepest question here: a type is not just a
key — the moment it's shown, it's an **element of communication**, and
because types are constructed and evolved through event creation and
tag use, we're adding a formality that can produce dynamics nobody
designed. The concern to hold: **misunderstandings of what we're
presenting, and behavior forming around those misunderstandings.**

What a type means, to each party — and the misreadings to prevent:

- **To us**: a filing key for accumulation. Nothing more.
- **To the organizer**: a shorthand their listing gets filed under —
  correctable, optional. The misreading: type-as-SEO (wording listings
  to hit or dodge types on a folk theory of ranking). Structural
  answer: assignment has no observable ranking consequence to build a
  theory on (novelty fit is small, capped, per-member, under noise),
  and the honest answer to "does the type matter?" is "barely, and
  only to filing" — copy should say so wherever organizers meet it.
- **To a member**: "this is one of those." The misreadings: type-as-
  promise (a mismatch reads as not-as-described even when the listing
  was honest — expectation-setting is the SHAPE's job, "What it's
  like"; policy flags reference the listing text, never the type);
  type-as-endorsement (an IRL badge or quality tier — so types render
  as plain descriptive words, never badges, and **untyped shows
  nothing at all**: absence, not a lesser-status label); and
  type-as-identity ("I'm a board-games person") — the event-side twin
  of the D58 segmentation risk the founder named at the envelope
  sign-off, mitigated by the same forces (exploration floor, novelty
  fit actively paying seeks-new members to cross kinds) and watched,
  not modeled away.

**v1 sidesteps most of this by deferring member-facing display
entirely (§0)**: no chip, no label — a member meets a type only
through what it does for them, and the first display arrives WITH its
purpose (the "you said again" line, "more like this", illustrations).
The rules below bind whenever that day comes.

**Presentation rules, stated once**: types speak the community's own
language (register names are curated from how this community actually
talks, not our labels — that's what keeps our meaning and theirs
aligned); descriptive chip, never badge; no "official"; no typed-vs-
untyped visual status; no public per-type popularity reads, ever.

**Watch signals** (all cheap, all from data we already keep):

1. Organizer corrections clustering on one type — its name or
   matchTags mislead (curation input).
2. Debrief mismatch texture (`not-as-described`-adjacent chips) higher
   on typed events than untyped — type-as-promise is happening;
   revisit the display copy before the register.
3. Listing wording converging on matchTag phrasing over time —
   typing-as-SEO folk theories forming.
4. Untyped share trending toward zero — completeness pressure creeping
   into curation; untyped is healthy, keep it so.
5. Member attendance narrowing to fewer types/families post-typing
   (against the pre-typing baseline) — the segmentation twin, same
   watch as D58's cross-position co-attendance.

This section extends the **creeping categorization** watch-item
(`decisions.md`) to events: categorization stays a tool, not a verdict
— and here, not a vocabulary the community starts performing.

## 8. Slice plan (after sign-off)

1. `lib/event-types.mjs` — strawman register (seeded from the workshop
   calendar's actual kinds), deterministic `classifyEventType(shape,
   title)`, family table; same strawman posture as localities (held
   until evidence or advisors move it; same future store + manager).
2. Events: `eventTypeId` derived at propose (no LLM call), stamped on
   the row, organizer-correctable at edit; `GET /event-types` serving
   the register for the **organizer picker only** — no member-facing
   display in v1 (§0/§7).
3. Debrief: `eventTypeId` frozen into `DebriefSubmitted`;
   `eventTypeOutcome` + `forecastError` join the extraction schema
   (prompt doc first, mirror second); projector writes `outcome#` rows
   including `lastAgain` (from the debrief's existing `again` answer —
   no new member-facing question).
4. Ranking spec v9: `fitAgainWeight` (the flagship) +
   `fitNoveltyWeight`, both from own outcome rows.
5. Registers: decision row, backlog, spec history, functional coverage.

## Open questions (beyond the sign-off points)

- The strawman's seed list — drafted from the workshop calendar at
  implementation, corrected the same way the locality register is.
- Whether `family` should be visible to organizers in the type picker
  or stay backstage grouping only.
- When outcome sentences reach "How we understand you" — copy design
  with the D15/D17 voice pass, alongside the frontend redesign.
