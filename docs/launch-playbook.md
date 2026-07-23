# Community Launch Playbook — Design (proposed)

Radar R5, graduated — with its trigger corrected on the way in. The
radar said "second locality," on the theory that a *repeatable* process
is only needed when you repeat. Backwards: the first launch is the one
run with **no muscle memory**, by people who are also building the
product, in the community whose trust matters most. Launch #1 deserves
the written process *more*, and repeatability falls out of writing it
down, running it once, and correcting it — the same strawman posture as
every register: **a playbook is only validated by a launch.**

Scope: the operating process for launching IRL in its first community
(Bainbridge Island), phased so each phase names what happens, what it
uses, what it must teach us, and what says "go" to the next. Almost
everything here is process, not code — the tooling this note consumes
(workshop mode, the seed catalog, "open as," the verification queue,
the notify list, the served-locality gate) already exists. The few
build items it surfaces are named in §9, all deliberately small or
deliberately deferred.

## 0. Posture

- **Judgment with named inputs, never thresholds.** No phase advances
  because a number crossed a line. Numbers below are strawman *reading
  aids* for a human go decision — the success frame
  (`success-and-progress.md`) applies to launching too: indicators,
  not targets. A launch gated on hitting counts is a launch that will
  manufacture them.
- **The community is the customer of the launch, not the audience of
  it.** Every phase has a "what they get" alongside "what we learn."
  A phase that only extracts (feedback, signups, validation) without
  giving (working software, real events, visible responses to input)
  is drift.
- **Small-N honesty.** For weeks, "the community" is a dozen people.
  Privacy machinery designed for a town must be *re-read* at N=12:
  attendee counts near-identify people, demand aggregation can't hide
  a cohort of three (D51's minimum-cohort rule binds hardest here),
  and "only first names" barely anonymizes neighbors. The playbook
  names the small-N re-reads phase by phase rather than pretending the
  regimes work identically at every scale.

## 1. The launch arc

```
0 pre-interest   → notify list live (built; running today)
1 interest read  → the go decision for a founding cohort
2 founding cohort→ recruited, agreed, not yet in-app
3 advisor round  → registers reviewed by local knowledge (opens R1)
4 workshops      → facilitated sessions on workshop stacks (D64 tooling)
5 soft open      → founding cohort live on production; first real events
6 community open → the served locality opens publicly
7 steady + retro → indicators watched; the playbook itself corrected
```

Phases overlap deliberately (advisors attend workshops; workshops keep
running after soft open as the demo/pitch instrument). The arc is a
dependency order, not a calendar.

## 2. Interest read — the go decision (phase 1)

The notify list (`POST /notify`, admin list panel) captures pre-launch
interest by postal code. What it feeds is a **decision, not a
trigger**. Named inputs, with strawman shapes:

- **Enough people for events to happen.** The event minimum is 3
  (D-register: smallest gathering that isn't a duo). A calendar needs
  several events a month each clearing 3 — strawman: a founding cohort
  of **8–15 committed people**, drawn from notify signups plus direct
  recruiting. Signup count alone says little: strawman **25–40 served-
  postal signups** is the level at which recruiting 8–15 usually works,
  not a green light by itself.
- **At least one organizer-shaped person** besides the founder. A
  community whose every event the founder proposes isn't launched;
  it's hosted.
- **Interest spread.** Two or three distinct interest clusters among
  the committed (the event-type register's families are the reading
  frame) — one shared hobby is a club, not a community.
- **Operating capacity.** The verification queue is manual (D64);
  someone must actually work it, and the feedback channel (R1) must be
  ready to receive what the cohort sends.

No-go is a real outcome: the notify list simply keeps accruing, and
the read repeats when it moves.

## 3. The founding cohort (phase 2)

The first members, recruited person-by-person. What they get and what
we ask — stated up front, honestly:

- **They get**: first access; events seeded from *their* actual
  interests (the first real calendar is built around the cohort, not
  the fixture); a named feedback channel with the R1 obligation that
  they **see what their input changed**; and the founder's direct
  attention.
- **We ask**: patience with rough edges, debriefs actually filled in
  (the model is starving until they do), and honesty about what feels
  wrong.
- **Voice, never knobs.** Founding members get no in-app privileges —
  no matching weight, no policy authority, no badge. Their leverage is
  that we listen hardest to them, not that the system treats them
  differently. (The deferred "known circle" tier-2 construct is
  adjacent — early adopters are exactly the visibility-opted cohort —
  but it stays deferred; launching is not the moment to add a
  visibility regime.)
- **Gratitude lives outside the product** (decided at review): no
  "founding member" label, no in-app status, ever — labels calcify.
  A thank-you letter, a gift, a reminder of the good they did: all
  in scope, all as people thanking people, none as product surface.
- **Small-N re-read**: with a dozen members, "who's going" on an event
  identifies people to their neighbors. Acceptable — these are people
  who joined *to meet each other* — but it must be said to them
  plainly at recruitment, not discovered.

## 4. Local advisors (phase 3)

Three-to-five people who know the community, recruited before
workshops so they can attend them. What we actually ask of them is
specific, because two registers are *explicitly written to be
corrected by local knowledge and are still waiting*:

- **The locality register** (D62 — draft bands, "Bremerton gets an
  undeserved bad rap" class of corrections).
- **The event-type register** (D63 — which kinds this community
  actually recurs on).
- **Policy reading**: terms, event policy, the safety design — and the
  **protective-blocks advocate validation** (D52's named open
  question) is scheduled into this round, with the right advisors
  (people with domestic-violence / harassment-support experience, not
  just civic boosters).

Dependency, named: **R1 (feedback intake) activates now** — its radar
trigger is "before the first advisor round," and this is that round.
Advisor feedback lands on registers or it evaporates. R1 remains its
own design; this playbook just fixes its due date.

## 5. Workshops — the facilitation process (phase 4)

The D64 tooling's purpose. Three session shapes, written as strawman
scripts (run, then correct):

**Session A — the member's arc** (~60 min; founding cohort, advisors,
curious locals). Seed personas; add a curated week of events; then:
**attendees do the interview themselves** — sign up on the workshop
stack (locality auto-verifies) and jump straight in, because that IS a
new member's experience and the session should model it, not narrate
it. The facilitator fields comments and questions as they go; the
interview's warmth either lands first-hand or we learn it doesn't.
Then their own feed over the seeded calendar, read aloud and
*explained* ("prioritization, never filtering" is the trust beat);
RSVP as themselves. For the lived-history beats the facilitator
switches to a seeded persona ("open as"): advance the clock past an
event; debrief (the care-not-survey beat); show "How we understand
you" and correct something live (the legibility beat — beliefs are the
member's to fix). Close on the privacy frame: first names, no
messaging, just show up.

**Session B — the organizer's arc** (~45 min; organizer-shaped people,
advisors). Propose live (watch the shape extraction get it right or
wrong — honesty beat), rosters and the auto-plan threshold,
suggestions/polls as the correction channel, cancel-with-reason, the
organizer's side of debriefs.

**Session C — the empty room** (~30 min; founding cohort, near soft
open). The initial-adopters scenario: personas seeded, **zero events
added** — the calendar is empty because the community hasn't happened
yet. The facilitator turns to the room: "what should the first real
one be?" and proposes it live from the room's answer. This is the
session that converts demo into launch.

**Mechanics checklist** (per session): dedicated workshop stack;
bindings set for the locality being demoed; personas seeded the day
before (not live — seeding is minutes, not theater); "open as" tabs
prepared for the personas the script drives; the fixture password on a
card; simulated-time jumps rehearsed (the advance-past-the-event beat
fails awkwardly if the wrong event goes "over"); a note-taker who is
not the facilitator.

**What each session must capture**: register corrections (bands,
kinds, copy), the confusions (verbatim, not summarized), and one
structured pass of "would you sign up — and if not, what's missing?"
— all landing through R1's channel.

**Robots — scoped here, still not built for launch #1.** D64 deferred
autonomous scripted members "to R5, where the workshop process gets
written." Written, the process doesn't need them: every session shape
above is facilitator-paced, and canned debriefs already make the world
look lived-in. And the scope is now decided (founder review): **robots
v1 is simple automation of pre-defined action sets** — e.g. "wind
forward past this event and submit the personas' debriefs" as one
action instead of a tab-juggling sequence. Batch persona actions, a
natural extension of the seed machinery; no ambition toward
believable stochastic automata, which would be decoration we'd have
to choreograph anyway.

**Self-serve demo stacks (SSDS) — named, future.** A workshop stack we
hand someone *without a facilitator* — controlled personas, canned
events, the existing machinery. The audience that makes this matter is
**serious advisors, especially safety-focused ones**, thoroughly
working scenarios at their own pace (a protective-blocks advocate
stepping through stalking-adjacent scenarios deserves privacy and
time, not a facilitator watching). SSDS is where robots v1's batch
actions earn their keep (no facilitator to drive the clock), and it
carries the strongest robot use case yet named, recorded now for the
safety roadmap: **an adversarial agent on an SSDS trying to break our
safeguards** — red-teaming as a workshop artifact. Trigger: the first
advisor who needs one, likely the D52 validation round.

The "session scale we can't staff" framing from the first draft is an
instance of something bigger the founder has named as concern #1 —
**production usage at a scale we can't staff** — which is now its own
radar workstream (R9) rather than a clause hidden in a robots
paragraph.

## 6. Soft open → community open (phases 5–6)

**Soft open**: the founding cohort registers on the production stack —
through the real front door (sign-up, agreement, locality request),
verified by hand in the console queue (D64 closed this loop; the queue
is now the launch instrument it was built to be). First real events go
up: the cohort's own, plus founder-stewarded external events (D53) to
thicken the first calendar honestly. The soft-open weeks are the
first read of the success indicators on real people: RSVP→attend,
debrief completion, **newcomer second-event rate**.

**Community open**: the served locality opens publicly. Mechanically
this is nothing — sign-up is already gated only by the `served` flag —
which is exactly why the *decision* needs inputs: the verification
queue is keeping up; the calendar shows a real next-two-weeks; the
cohort's debriefs read warm, not dutiful; advisors have seen their
corrections land. Announcement channel: the homepage plus the notify
list — contacted **manually** at this scale (export the admin list,
write a real email as a person; a notify-email build is premature
until a launch where the list outgrows a hand-written send — named in
§9).

**Widening the served area** (the next locality, e.g. Poulsbo) is a
register edit — one `served: true` — and therefore a decision
discipline, not a code change: inputs are verification capacity, event
geography already reaching there (people traveling in), and wish/
demand captures (R8's travel-evidence half). The second locality is
also the first *re-run of this playbook*, with phase 1 already warm.

## 7. Languages — decided by deferral, tracked as its own workstream

English-only for launch #1, decided rather than assumed: the interview
prompts, extraction schemas, debrief copy, and the one-voice rule all
carry language in load-bearing ways — a translation pass would produce
a worse product in the second language and quietly break D15/D17/D23.
The playbook's language question re-enters per community at phase 1:
if a community's interest read shows a non-English-first population,
that is a *scope input to its go decision*, not a post-launch patch.

The founder has named this concern #2 — so it is now a radar
workstream in its own right (**R10 — languages & localization**)
rather than a paragraph here: the design must exist *before* the first
interest read that needs it, because "activate on the read" leaves the
go decision waiting on an undesigned area.

## 8. What launch #1 must teach us (phase 7)

The retro is part of the playbook, and the playbook is part of the
retro. Standing questions, scheduled (strawman: 6 weeks after
community open):

- Which strawman registers were corrected, how fast, and did anything
  we shipped resist a correction it should have taken gracefully?
- Verification: queue latency, decline pressure (unverifiable requests
  parking — is R3 becoming urgent?), any friction the cohort named.
- The indicator read: second-event rate, debrief completion and
  warmth, first crew formation — read as indicators, resisting the
  urge to target them.
- Support pressure: what did members need a human for? (This is R4's
  activation evidence — "first real members" is its trigger, and soft
  open starts that clock.)
- **The playbook diff**: every place reality deviated from this note,
  corrected in this note. Community #2 runs the corrected version.

## 9. Build items — few, and mostly deferred

1. **Facilitation scripts as materials** (this note's §5 is the
   source; a one-page-per-session crib sheet ships with the note —
   docs, not code).
2. **Notify-list email path** — deliberately manual for launch #1
   (export + hand-written send); build when a launch's list outgrows
   that. Named, not scheduled.
3. **Workshop stack reset** (purge seeded generation in one action) —
   nice-to-have; today's answer is a fresh stack or the functional
   suite's teardown pattern by hand. Trigger: the first time a
   facilitator needs a mid-day reset.
4. **Robots v1** — batch persona actions (§5); not for launch #1;
   builds with the first SSDS.
5. **Self-serve demo stacks** — the workshop machinery, handed over
   without a facilitator (§5); trigger: the first advisor who needs
   one, likely the D52 validation round. The adversarial-agent
   red-team use case is recorded there for the safety roadmap.

## Open questions

- Advisor compensation/recognition: civic goodwill carries the first
  round; whether it scales to community #2+ belongs in the retro.
- Where the go/no-go reads live operationally (a checklist in the
  console? a document?) — for launch #1, a document the founder owns;
  console affordances wait for evidence they're needed.
