# Design spec and landing redesign

Status: active (chunk-1 questions answered by the founder 2026-09-03:
comparative set agreed with Seattle Public Library as the civic
example · desktop becomes a genuinely wide layout, and the
native-app-vs-web question joins the spec as its own analysis ·
Fable 5.1 delegation confirmed for drawing directions. Awaiting the
go-ahead to start chunk 1.)

Outcome under development: a **design spec** for IRL's product
surface — explicit goals, constraints, and a review/improve process —
and the **landing page rebuilt against it**, reviewed live in the
workshop switcher the way the themes were.

## Why now

The theme work (U9) settled the *identity* — palette, type, surfaces.
It did not settle what the pages are *for* or how we judge them, and
the landing page shows it: maximally plain, dominated by the sign-up
button, and carrying no design elements that do the job the page
exists to do. Two gaps, one deliverable: the spec that makes design
judgeable, and the first page rebuilt under it.

The spec also has to absorb three platform goals the founder named
(2026-09-03) that are technical as much as visual — responsive
desktop/mobile, installable-to-home-screen, and push notifications.
They change what "the design" even is, so they belong in the spec
before any direction is drawn.

## Inputs

- `ui-themes.md` (U9) — the identity and the theme mechanics; any
  design must survive all registered themes.
- `design/ui-directions-2026-07.{md,html}` — the exploration, its
  shared moves (type floor, one accent, one elevation recipe, people
  over counters, calm motion) and its diagnosis of the old UI.
- The voice and stance decisions that constrain persuasion: D15/D17
  (warm not familiar, no persona), D23 ("we", never "I"), D12 and
  `success-and-progress.md` (**not an engagement machine** — the
  interaction serves the member, the signal is a byproduct), D30
  (pair every "don't" with a "do").
- `ux-register.md` U1–U9 — the calls already made.

## Goals (draft — the chunk-1 gate settles them)

**Comprehension and invitation**
1. A first-time visitor can say what IRL is, who it's for, and what
   happens next — within about ten seconds of landing.
2. The page invites *reading*, then acting; sign-up is the obvious
   next step without being the loudest thing on the screen.
3. It reads as a neighborhood thing, not a startup product — the
   principles are visible, not buried behind a CTA.
4. Nothing on the page implies engagement mechanics IRL refuses
   (streaks, feeds, counts of people "waiting", scarcity nudges).

**Platform (founder-added, 2026-09-03)**
5. **Every page renders naturally on a phone and in a desktop
   browser.** Founder's call (2026-09-03): desktop is a **genuinely
   wide layout**, not the phone column centered in a 1440px window —
   every site in the comparative set does this. Today there is not
   one media query in `styles.css`, so this is new work on every
   surface, not a landing-page concern.
6. **Installable**: on a phone the site can be saved to the home
   screen and behave app-like from there — manifest, icons, launch
   colors, standalone display, and an honest offline/first-paint
   story. (Also the *prerequisite* for iOS web push, which is only
   available to home-screen-installed web apps — to be verified in
   chunk 1 against current platform docs.)
7. **Push notifications, with consent**, on desktop and mobile. The
   design work here is the *asking*: when we ask, what we promise,
   and how a member turns it off. The build is the existing Group 7
   Notifications backlog item, which this spec constrains rather than
   replaces.

**Quality bar (applies to every surface)**
8. Accessibility: WCAG 2.2 AA as the target — contrast, focus order,
   touch targets, `prefers-reduced-motion`, and **removing
   `user-scalable=no`** from the viewport meta (it blocks pinch-zoom
   on every page today).
9. Performance: no build step stays; fonts and any imagery must not
   cost the first paint. Budget agreed in chunk 1.

**Process**
10. Design work runs under **the same discipline as technical work**
    (founder, 2026-09-03): analysis before decision, decisions in a
    register, traceability from goal → decision → note →
    implementation, and a defined route for revision — including
    major change. The spec is the analysis; §"How design decisions
    are made" below is the process; the U-register is where the calls
    live.

## Non-goals

- Not a rebrand — the identity is decided (U9); this is composition,
  hierarchy, and platform behavior.
- Not conversion optimization. We are not maximizing sign-ups; goal 4
  is a hard constraint on how the page may persuade.
- Not the app screens' redesign. The spec covers them, but this
  deliverable rebuilds the *landing page* first; other surfaces
  follow as their own slices.

## How design decisions are made (the process — goal 10)

Design gets the technical discipline, in the same shapes the project
already uses, so nothing new has to be learned:

**Analysis → decision → traceability**
1. **Analysis first.** A designed area gets a design note holding the
   reasoning (K-006, exactly as `matching.md` or `debrief.md` do) —
   the spec itself is the first one.
2. **Comparative review before drawing.** The agreed set is reviewed
   against the goals: what each does with the first screen, how it
   explains itself, how it asks for install and notification
   permission, and what it does that IRL must *not* do. Findings land
   in the design note with per-site **borrow / avoid** lines.
3. **Directions, not iterations.** Distinct directions are drawn
   against one brief and compared side by side — never one design
   nudged repeatedly, which optimizes without ever choosing.
4. **Live review.** Directions ship behind the workshop switcher, so
   reviewers see them in a real browser on a real phone and can each
   be handed a link.
5. **Judged against the goals, in writing.** Every direction gets a
   line per goal (holds / partly / fails) *before* any preference is
   voiced. Taste decides between directions that all hold; it never
   rescues one that fails a goal.
6. **The call becomes a U-row** with its reasoning and a pointer to
   the note — the design counterpart of a D-row.

**Revision, including major change** (the gap this plan closes)
7. The UX register today says rows are "revised in place with a dated
   note". That is right for a tweak and wrong for a reversal. Design
   decisions adopt the **D-register's supersession discipline**
   (K-004): a row carries a status (`accepted` · `superseded by U<n>,
   because …` · `deprecated`); small revisions stay dated notes in
   place; a decision that *reverses* an earlier one is a **new row
   that supersedes it**, never a silent edit. The register keeps its
   record of what we used to think and why we stopped.
8. **A major change re-enters at step 1** — it is a fresh analysis
   with its own directions and judging, not an edit. What makes a
   change major: it contradicts a stated goal, changes the identity,
   or changes what a surface is *for*.
9. **Feedback re-enters through D66**: reviewer and member feedback
   lands as FB-rows against the U-rows, triaged against the recorded
   decision, with the changed / stands / routed answer-back. Feedback
   is evidence, never a vote (D21 applied to design).
10. **Traceability** runs goal → U-row → design note →
    implementation → verification, the same chain Article 10 asks of
    technical work; the U-row's "Lives in" column is the last link.

**Cadence**
11. The spec is re-read at each launch-playbook phase gate, and
    whenever a goal is contradicted twice by real feedback. Goals
    change only by dated revision — the spec is provisional too
    (W-004).

## Settled at the chunk-1 gate (2026-09-03)

1. **Comparative set**: Meetup (mechanics IRL rejects — what to
   avoid), Nextdoor (neighborhood framing and its failure modes),
   Partiful (invitation warmth), Front Porch Forum (plain, local,
   non-commercial — closest in spirit), **Seattle Public Library**
   (the institution-you-trust register).
2. **Desktop posture**: a genuinely wide desktop layout — see goal 5.
3. **Fable delegation**: confirmed. A Fable 5.1 subagent draws the
   directions against this spec as its brief; Opus writes the spec,
   judges the directions against the goals, and implements the pick.

## Open question raised at the gate — the native-app question

The founder's standing position is to avoid platform-specific,
app-store-hosted apps; the comparative set mostly does the opposite
(native app + a mobile web that is a restyled desktop site). This is
now a **named analysis in chunk 1**, not a decision taken by default:
pros and cons worked honestly — reach and discoverability, push
reliability (especially iOS), offline and background behavior,
notification permission norms, install friction, versus app-store
gatekeeping and review, per-platform build and release cost, two
codebases or a cross-platform framework, the **entity and developer
accounts a store listing needs** (org track), and the ongoing
maintenance a one-person project would carry.

**Nothing is implemented either way in this plan.** The founder's
call: the current approach suffices for the initial workshops, so the
analysis produces a recorded decision (with its trigger for
revisiting), not a build. Whatever it concludes, the responsive and
installable work in chunk 2 is not wasted: it serves the web surface
that keeps existing in every scenario.

## Chunks

<!-- Chunk boundaries proposed; founder adjusts and gates (W-001). -->

### Chunk 1 — the spec, the process, and the platform analysis

Comparative review of the five agreed sites (borrow / avoid per
site); goals and non-goals settled; **the design process written down
and made real** — including the U-register's supersession upgrade
(status field, superseded-by rows) so major design changes have a
route; platform constraints researched and recorded (install
requirements per platform, what iOS actually requires for web push,
notification-permission patterns that don't violate goal 4);
**native-app-vs-web analysis** with a recorded decision and its
revisit trigger; accessibility and performance budgets fixed.

Lands as `docs/design-spec.md`, a U-row for the process adoption, a
D-row for the platform decision (it constrains more than design), the
U-register header updated, and the Backlog items pointed at the spec.
Gate: founder reviews the spec — goals, the process, and the platform
call.

### Chunk 2 — responsive + installable foundations

The technical goals that don't depend on the visual direction:
breakpoints and a desktop layout posture applied across existing
pages, viewport meta fixed (`user-scalable=no` removed), web app
manifest + icons + launch colors, a minimal service worker for
install and first-paint (no offline data caching — the API is the
source of truth), and an install-readiness check. Push stays out.
Gate: founder installs the workshop site to a phone home screen and
opens every page on a desktop browser.

### Chunk 3 — landing directions, drawn and judged

Two or three distinct landing-page directions drawn against the spec
(Fable subagent if confirmed), shipped behind the workshop switcher
as page variants, each scored per goal in writing before preference
is taken. Copy is part of the design — the current text is the
starting point, not a fixture.
Gate: founder (and any invited reviewers) compare live; the pick is
recorded as a U-row.

### Chunk 4 — land the landing page

The chosen direction implemented across all registered themes,
accessibility and performance budgets verified, terms page brought
along for consistency, backlog updated, plan closed out.
Gate: founder sign-off on workshop → next ordinary prod deploy.

### Not in this plan

**Push notifications delivery** — the spec (goal 7) sets the asking
and the promise; the build (service-worker push handler, VAPID keys,
subscription storage, send path, per-member preferences, and the
decision about *what* IRL is willing to notify about under D12) stays
the Group 7 Notifications item, which this plan makes concrete rather
than absorbs.
