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

## 2. How a type is born: earned by recurrence, never taxonomy-first

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

## 3. What the register unlocks in v1

### Member outcome rows — `outcome#{eventType}` finally lands

`DebriefSubmitted` gains the event's `eventTypeId` (frozen at command
time, like everything else); the projector maintains one encrypted
`outcome#{eventTypeId}` row per member per type: attended/again tallies
(`yes`/`maybe`/`no`), the debrief's parked **`eventTypeOutcome`**
extraction (energized/drained texture, with its condition) and
**`forecastError`** storage (predicted vs actual — the calibration
read) finally have their home. All of it is the member's own encrypted
model — the register itself never holds member data (§5).

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

## 4. Venues and operators — designed, deliberately deferred

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

## 5. The privacy line, stated once

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

## 6. Slice plan (after sign-off)

1. `lib/event-types.mjs` — strawman register (seeded from the workshop
   calendar's actual kinds), deterministic `classifyEventType(shape,
   title)`, family table; same strawman posture as localities (held
   until evidence or advisors move it; same future store + manager).
2. Events: `eventTypeId` derived at propose (no LLM call), stamped on
   the row, organizer-correctable at edit; `GET /localities`-style
   serving of the register (probably `GET /event-types`) for the edit
   picker and the client.
3. Debrief: `eventTypeId` frozen into `DebriefSubmitted`;
   `eventTypeOutcome` + `forecastError` join the extraction schema
   (prompt doc first, mirror second); projector writes `outcome#` rows.
4. Ranking spec v9: `fitNoveltyWeight` from own outcome rows.
5. Registers: decision row, backlog, spec history, functional coverage.

## Open questions (beyond the sign-off points)

- The strawman's seed list — drafted from the workshop calendar at
  implementation, corrected the same way the locality register is.
- Whether `family` should be visible to organizers in the type picker
  or stay backstage grouping only.
- When outcome sentences reach "How we understand you" — copy design
  with the D15/D17 voice pass, alongside the frontend redesign.
