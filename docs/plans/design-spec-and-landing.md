# Design spec and landing redesign

Status: draft

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
   browser** — not a phone-shaped column stranded in the middle of a
   1440px window. Today there is not one media query in `styles.css`,
   so this is new work on every surface, not a landing-page concern.
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

## Non-goals

- Not a rebrand — the identity is decided (U9); this is composition,
  hierarchy, and platform behavior.
- Not conversion optimization. We are not maximizing sign-ups; goal 4
  is a hard constraint on how the page may persuade.
- Not the app screens' redesign. The spec covers them, but this
  deliverable rebuilds the *landing page* first; other surfaces
  follow as their own slices.

## The review/improve process (the founder's ask, drafted)

1. **Comparative review before drawing.** A small set of
   similar-purpose sites is reviewed against the goals above —
   what each does with the first screen, how it explains itself,
   how it asks for the install and the notification permission,
   what it does that IRL must *not* do. Findings land as a section
   in the design note, with per-site "borrow / avoid" lines.
2. **Directions, not iterations.** Distinct directions are drawn
   against the same brief and compared side by side — never one
   design nudged repeatedly, which optimizes without ever choosing.
3. **Live review in the workshop.** Directions ship as themes or
   page variants behind the existing switcher, so reviewers see them
   in a real browser on a real phone, and can be handed a link each.
4. **Judged against the goals, in writing.** Each direction gets a
   line per goal (holds / partly / fails) before any preference is
   voiced. Taste decides between directions that *all* hold; it does
   not rescue one that fails a goal.
5. **The call is recorded** as a U-row with its reasoning, and the
   spec's goals are revised only by a dated note, never silently.
6. **Feedback re-enters through D66** — reviewer and member feedback
   lands as FB-rows against the U-rows, with the changed / stands /
   routed answer-back.
7. **Revisit cadence**: the spec is re-read at each launch-playbook
   phase gate, and whenever a goal is contradicted twice by real
   feedback.

## Open questions (founder input at the chunk-1 gate)

1. **Comparative set** — which sites/apps? My proposal, chosen to
   cover the useful axes rather than the obvious competitors:
   *Meetup* (the incumbent whose mechanics IRL deliberately rejects —
   a study in what to avoid), *Nextdoor* (neighborhood framing and
   its failure modes), *Partiful* (invitation warmth and event
   pages), *Front Porch Forum* (plain, local, non-commercial —
   closest in spirit), and one library/civic site for the
   "institution you trust" register. Swap freely — your local
   knowledge beats my list.
2. **Desktop posture**: does the desktop view stay the phone column
   (centered, framed) or become a genuine wide layout for the feed
   and event pages? This is the biggest structural call in the spec.
3. **Install prompt**: proactive (an "add to home screen" nudge after
   sign-up) or passive (documented, never nudged)? Goal 4 pulls
   toward passive.
4. **Fable delegation** — confirm using a Fable subagent to draw the
   directions (chunk 3), with this spec as the brief and Opus doing
   the evaluation and implementation.

## Chunks

<!-- Chunk boundaries proposed; founder adjusts and gates (W-001). -->

### Chunk 1 — the spec

Comparative review of the agreed set; goals and non-goals settled;
the review/improve process finalized; the platform constraints
researched and written down (install requirements per platform, what
iOS actually requires for web push, notification-permission UX
patterns that don't violate goal 4); accessibility and performance
budgets fixed. Lands as `docs/design-spec.md` + a U-row; the
Notifications and responsive items in the Backlog get pointed at it.
Gate: founder reviews the spec — especially goals, non-goals, and the
open questions above.

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
