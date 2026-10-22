# Design spec and landing redesign

Status: active (**all four chunks delivered; gates 1–3 passed, the
chunk-4 gate is open** — chunk 4 on 2026-10-21: Direction D is the live
`src/index.html`, terms on the same components, both measured clean in
all four themes; awaiting founder sign-off on workshop, then the next
ordinary prod deploy, then close-out. Earlier: chunk 3 on 2026-09-17: three directions
drawn and judged against the goals in writing
(`design/landing-directions-2026-09.md`). 2026-10-19: a founder-led
small-group review (desktop only, FB3–FB9) asked for a merge, drawn
as **Direction D** and judged in §6 of the same note — D holds every
goal. **Chunk-3 gate passed 2026-10-21: the founder picked D (U12)**,
CTA "Accept the invitation". Chunk 4 go-ahead given the same day. chunk 2
on 2026-09-17: workshop deploy clean, responsive rendering good,
Android install with icon, all pages loading; iOS install unverified.
**chunk-1 gate passed 2026-09-16** — founder reviewed
`docs/design-spec.md`, no changes asked; U10 and D70 stand as written.
One question from the review is still open and does not block chunk 2:
digest vs push as G7's first channel. Founder's answers recorded
2026-09-03:
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

### Chunk 1 — the spec, the process, and the platform analysis — DELIVERED (at gate)

Shipped: `docs/design-spec.md` (goals G1–G10, non-goals, the five-site
comparative review with borrow/avoid and a stated method, platform
constraints verified against MDN and Apple's documentation, the
accessibility bar, a performance budget grounded in today's measured
weights, and the design process); **U10** — design under the technical
discipline — with the UX register upgraded (status column, supersession
rule, and U9's out-of-order row moved back into sequence); **D70** —
web-first and installable, no native app for launch #1, revisit
triggers named. Notifications, accessibility and native-app Backlog
items now point at the spec.

Three things from the review that the gate should weigh: the **digest**
became a first-class candidate for G7 rather than a lesser push
(Front Porch Forum); **honest operational notices** joined the landing
page's job (Seattle Public Library); and G1/G2 got their teeth from
Nextdoor's sign-up wall.

Gate: **passed 2026-09-16** — reviewed with no changes asked. D70
stands; the digest-vs-push question rides with the Notifications item.

#### Original scope

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

### Chunk 2 — responsive + installable foundations — DELIVERED (at gate)

Shipped: the responsive layer (phone-first, breakpoints at 720/1024
chosen from where the current layouts actually break; landing two- and
three-up with a 68ch prose measure; app shell on one 1100px container
with the feed as a card grid), `manifest.json` + placeholder icons
(192 / 512 / 512-maskable / apple-touch, `i·r·l` in the Morning Linen
palette), iOS meta, `sw.js` (app shell only — never API responses,
T11), `js/pwa.js` registration that never prompts, and
`user-scalable=no` removed from all four pages. Guarded by
`src/js/pwa.test.mjs` (5 tests); 284 frontend tests pass.

Verified on localhost (the one place a service worker runs without
HTTPS): worker registers and activates, manifest resolves, no page
errors. Desktop layout checked at 820 and 1440 against the real
stylesheet.

Also fixed: the propose button, styled for Grove's dark header, was
invisible on Morning Linen's light header — a live defect on the
default theme, found by looking at the feed at desktop width.

Gate: **passed 2026-09-17** — deployed to workshop; mobile and desktop
rendering good; **Android** home-screen install worked and picked up
the icon; all pages loaded. **iOS install is still unverified**, and it
is the path that matters most later: Safari installs only from the
Share menu (no `beforeinstallprompt`), and iOS web push exists only
inside an installed web app (§6). Worth one pass on an iPhone before
push work starts — not a blocker for chunk 3.

#### Original scope

The technical goals that don't depend on the visual direction:
breakpoints and a desktop layout posture applied across existing
pages, viewport meta fixed (`user-scalable=no` removed), web app
manifest + icons + launch colors, a minimal service worker for
install and first-paint (no offline data caching — the API is the
source of truth), and an install-readiness check. Push stays out.
Gate: founder installs the workshop site to a phone home screen and
opens every page on a desktop browser.

### Chunk 3 — landing directions, drawn and judged — DELIVERED (at gate)

Shipped: a written brief (`design/landing-brief-2026-09.md`), three
directions drawn against it by Fable subagents — **A the calendar**,
**B the invitation**, **C the notice board**
(`design/landing-directions-2026-09/{a-calendar,b-invitation,c-notice-board}.html`) — a
review index at `design/landing-directions-2026-09/index.html` reachable on any workshop
stack, and the judgment: `design/landing-directions-2026-09.md`,
holds/partly/fails per goal per direction, **written before any
preference was voiced** (U10 step 5). Copy was in scope and all three
rewrote it. `inject-config.mjs` drops `design/landing-directions-2026-09/` from a prod
bundle, so the previews cannot reach production.

The scoring was measured, not eyeballed: computed-style contrast on
every text node at both widths, landmark and heading counts, target
sizes classified against SC 2.5.8, prose measure via a per-element
`100ch` probe, and a pattern scan for engagement mechanics with every
hit read in context. Method in §5 of the judgment.

Result: **C is the only direction that holds every goal.** A fails G2
— its primary CTA sits 3681px down a 390px phone — and the failure is
positional, so A can be fixed and re-judged if preferred rather than
overridden. B's desktop layout is the weakest against G5.
Recommendation: C as the base, with A's example week and B's "Why
we're writing" paragraph borrowed by name.

Found while measuring: **the shipped pages fail G8 today** — 16 of 39
text elements on `index.html`, 8 of 65 on `terms.html`, mostly
`--soft` at 3.72:1 under 14px text. Recorded as open risk #24 and a
Backlog item; the directions themselves avoid it.

Gate: founder (and any invited reviewers) compare live on workshop —
`/landing/` — read the judgment, and make the pick. The pick becomes
a U-row at the top of chunk 4.

**Review round, 2026-10-19.** A founder-led small group reviewed A,
B and C on desktop and reported seven points (feedback-log FB3–FB9):
A's look, B's opening, C's notice bar, C's at-a-glance card in A
without "Stage", "community-driven" over "small, not-for-profit", US
spelling, and — the largest — no cold sign-ups onto a blank calendar.
The merge is **Direction D** (`design/landing-directions-2026-09/d-merged.html`), built by
editing a copy of A so A's visual system carries over exactly, and
scored in §6 of the judgment: **D holds every goal**, as C does.

What the merge had to fix because the review was desktop-only: A's
phone layout moved the CTA below the week (y=3681), which D undoes
(y=553) — and that reordering was also a focus-order defect §2 missed,
now corrected in place. What building D found: three of A's
principles were false about the product as built (it does show
headcounts; it ranks suggestions by fit; it has no one-week window).
D's copy was checked line by line against the code, and the method in
§5 gains that step. D's pinned introduction is gated on screen height
(≥880px) because the glance card makes it 846px tall.

Routed, not done here: carrying workshop-proposed events into
production; US spelling in two shipped files (U11).

**Gate passed 2026-10-21.** The founder picked **D** (U12) and kept
"Accept the invitation". Two related calls the same day: a stocked
calendar is judged **first, before community open** (D71, refining
D65) — named inputs with guideline values, not thresholds; and "owned by the community" is not used —
"community-driven" stands, the governance intent behind it belongs to
the private org register (R11).

### Chunk 4 — land the landing page — DELIVERED (at gate)

Shipped:

- **`src/index.html` is Direction D** (U12), generated from the
  judged file so nothing drifted: every class prefixed `lp-`, links
  pointed at the real app paths. It keeps the old page's behavior:
  workshop flag, theme and PWA init, and every sign-up/sign-in link
  clears any stored persona first — now as a progressive enhancement,
  so the links also work without JavaScript.
- **`src/terms.html`** on the same header, footer and type, the legal
  text carried over word for word (checked by diff).
- **Stylesheet**: a Public pages section in `css/styles.css`, scoped to
  `<html class="lp">` so the app's rules (`.card`, `.wordmark`, the
  `overflow: hidden` shell) and these cannot reach each other.
  Colors come from the theme tokens plus a small `--lp-*` set (surface,
  border, line, shadow, button, wordmark dot, heading face) defined
  once per theme. These pages scroll the document again, which the pinned
  introduction needs. The old landing and terms CSS is gone except the
  four rules the tagline review page still uses. `styles.css` is
  84.5 KB raw / 15.9 KB gzipped against the ~90 KB ceiling (§9) —
  close; the next large addition should pay for itself.
- **Wordmark dots**: a per-theme deepened amber on these two pages,
  passing 3:1 as large text (Morning Linen `#b07d3c` 3.25:1, Grove
  `#b47a35` 3.21:1, Pebble `#c16d47` 3.24:1; Lantern's amber already
  passes at 7.09:1). *Confirmed 2026-10-22 and extended to the app —
  see the gate review below.*

Measured, served over HTTP so the scripts ran, in all four themes at
390 and 1440:

| | live page before | after |
|---|---|---|
| landing contrast failures | 16 of 39 | **0** in every theme |
| terms contrast failures | 8 of 65 | **0** in every theme |
| controls under 44px | — | 0 |
| lines past 68ch | — | 0 |
| sign-up button | — | y=527 on a phone; 7.1–10.2:1 across themes |

Also verified: the skip link takes the first Tab and reads 7.09–10.21:1
in every theme (the first pass found it at 1.00:1 in Lantern — fixed);
the introduction pins at 1440×900 and scrolls normally at 1280×800;
all six sign-up/sign-in links clear `irl_active_user` before
navigating. 284 frontend and 853 backend tests pass.

Departures from this chunk's wording, both deliberate:

- **The previews were archived, not deleted** — to
  `design/landing-directions-2026-09/`, beside the judgment that cites
  them, as the July exploration was kept. Nothing in `design/`
  ships, which was the point of deleting them. The deploy-time code
  that dropped `src/landing/` from prod bundles went with them.
- ~~**The rotating tagline retired from the landing.**~~ *Reversed at
  the gate (2026-10-22):* it replaces B's eyebrow — see below.

Not done here: the register views still carry their own CSS
(Backlog); `--soft` still carries small text in the app screens (open
risk #24).

**Gate review, 2026-10-22.** The founder reviewed it live on workshop:
"looks good", with three changes, all made the same day:

- **Wordmark dots: option (a), extended to the app** — a global
  `--wordmark-dot` per theme (U9 note). Measured as rendered on the
  app's sign-in, sign-up and welcome screens: 3.21–7.09:1 at 32px in
  every theme.
- **The early-days notice sits at the bottom of the screen on phones**,
  back at the top from 640px. Written phone-first (the bottom bar is
  the base layout, `min-width: 640px` restores it), as the chunk-2
  guard requires. The page reserves the bar's measured height, so
  the footer is never behind it; focused controls scroll clear of it
  (SC 2.4.11 — checked by tabbing through all 12); the workshop theme
  chip sits above it.
- **The rotating tagline replaces B's eyebrow**, as an italic epigraph
  at 21–24px against the 12px caps it replaced. All 44 taglines are
  active, from "Tea's on." to a 95-character quotation, so the layout
  was checked at both extremes: the CTA stays above the phone's
  bottom bar in the first screen (y=481 short, 536 longest).

One trade-off, measured rather than guessed: the desktop
introduction's height now varies with the tagline (834–896px), so
whether it pins is decided by measuring it in the page (`.lp-pin`)
instead of a fixed screen-height threshold. On a 900px-tall laptop it
pins for the 29 one-line taglines and scrolls normally for the other
15; at 1000px it pins for all 44; at 864px it did not pin before this
change either. Nothing is ever pinned and cut.

Verified again in all four themes at 390 and 1440: 0 contrast failures
on either page, 0 controls under 44px, no line past 68ch. 284 frontend
and 853 backend tests pass. `styles.css` is 86.2 KB raw / 16.5 KB
gzipped against the ~90 KB ceiling.

Gate: founder sign-off on workshop → next ordinary prod deploy →
close-out.

### Not in this plan

**Push notifications delivery** — the spec (goal 7) sets the asking
and the promise; the build (service-worker push handler, VAPID keys,
subscription storage, send path, per-member preferences, and the
decision about *what* IRL is willing to notify about under D12) stays
the Group 7 Notifications item, which this plan makes concrete rather
than absorbs.
