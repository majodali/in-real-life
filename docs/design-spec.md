# Design spec — the product surface

What IRL's pages are for, how a design is judged, and the platform
behavior every surface owes. Decided: **U10** (the process), **D70**
(platform strategy). Plan: `plans/design-spec-and-landing.md`.

The identity — palette, type, surfaces — is settled separately in
`ui-themes.md` (U9). This spec is about composition, hierarchy, copy,
and platform behavior. Both bind every surface; where they disagree,
that is a bug in one of them, not a choice.

## 1. Goals

A design is judged against these, in writing, before anyone says what
they prefer (§7).

**Comprehension and invitation**

- **G1** — A first-time visitor can say what IRL is, who it is for,
  and what happens next, within about ten seconds.
- **G2** — The page invites reading, then acting. Sign-up is the
  obvious next step without being the loudest thing on the screen.
- **G3** — It reads as a neighborhood thing, not a startup product.
  The principles are visible on the page, not behind a CTA.
- **G4** — **Nothing implies engagement mechanics IRL refuses**:
  no streaks, no feed-like infinite surface, no counts of people
  "waiting", no scarcity or urgency devices, no popularity signals
  presented as status. Hard constraint from D12 and
  `success-and-progress.md`.

**Platform** (founder, 2026-09-03)

- **G5** — Every page renders naturally on a phone **and** on a
  desktop browser. Desktop is a genuinely wide layout, not the phone
  column centered in a 1440px window.
- **G6** — On a phone the site can be saved to the home screen and
  behave app-like from there: manifest, icons, launch colors,
  standalone display, and a first paint that does not look broken
  offline.
- **G7** — Push notifications on desktop and mobile, with consent.
  The design work is the **asking** — when, what we promise, how to
  turn it off — and it is bound by G4.

**Quality**

- **G8** — Accessibility: WCAG 2.2 AA (§8).
- **G9** — Performance: the budgets in §9. No build step stays.

**Process**

- **G10** — Design runs under the same discipline as technical work:
  analysis before decision, decisions in a register, traceability,
  and a defined route for revision including major change (§7).

## 2. Non-goals

- **Not a rebrand.** The identity is decided (U9).
- **Not conversion optimization.** We are not maximizing sign-ups.
  G4 constrains how a page may persuade; a design that converts
  better by violating it loses.
- **Not the app screens' redesign.** This spec covers them, and the
  landing page is rebuilt first. Other surfaces follow as their own
  slices.
- **Not a component library.** Themes already carry the visual
  system (`ui-themes.md`); inventing a parallel abstraction is scope
  we have not earned.

## 3. The comparative review

Five sites, agreed with the founder 2026-09-03, chosen to cover axes
rather than competitors. Reviewed 2026-09-16.

**Method, stated honestly.** Meetup, Partiful and Seattle Public
Library were read as served. Nextdoor was rendered headless because
its landing page is script-driven. Front Porch Forum blocks
automated fetches (403), so its row rests on published accounts of
how it works, not on my own reading of the page — weaker evidence,
marked as such.

### Meetup — the incumbent whose mechanics we reject

Observed: "The people platform. Where interests become friendships."
Geo-detects and shows events near you without asking. Attendee counts
and face pills on every card; topic tiles; "Since 2002…".

- **Borrow**: showing real local events *before* asking for anything.
  A first-time visitor sees the substance, not a wall.
- **Borrow**: geo-detection to make the page concrete — but IRL's
  locality register is curated and coarse (D62), so "near you" must
  stay honest about bands rather than implying GPS precision.
- **Avoid**: attendee counts and face pills as the dominant card
  signal. It converts popularity into a ranking cue the visitor
  feels — G4, and the same reasoning as U2 (ordering is the only
  ranking signal that reaches the screen).
- **Avoid**: category tiles as the primary browse metaphor. IRL's
  event types exist so "worth another go" keeps its promise (D63),
  not as a directory to shop.

### Nextdoor — neighborhood framing, and the wall

Observed: the landing page is effectively a sign-up form.
"Discover your neighborhood", then immediately OAuth buttons, email,
password. The value propositions (address verification, local alerts,
recommendations) sit *below* the form.

- **Borrow**: address verification framed as what makes the space
  trustworthy. IRL's locality verification (and R3) can say this out
  loud — it is a feature, not friction.
- **Avoid**: asking before explaining. This is the exact failure G1
  and G2 name, and the clearest argument for IRL's landing page
  explaining itself first.
- **Avoid**: the safety claim as a bullet with no mechanism. IRL can
  point at real machinery (first names only, no DMs, conduct
  routing).

### Partiful — invitation warmth

Observed: "Parties are back", one hero CTA ("Create invite"),
playful voice, press quotes and testimonials as proof.

- **Borrow**: the event page as something you *enjoy opening*. IRL's
  event detail is the closest analogue and is currently utilitarian.
- **Borrow**: personality in copy without corporate register.
- **Avoid**: the persona-forward voice. IRL's voice is warm, "we",
  no persona (D15/D17/D23) — Partiful's wink would violate it.
- **Avoid**: press-quote social proof. IRL has none and should not
  manufacture the shape of it.

### Front Porch Forum — closest in spirit *(evidence: published accounts)*

A Vermont neighbor-to-neighbor forum: real names and street, human
moderation, a once-a-day email digest, no comments, no reactions, no
infinite scroll, deliberately non-algorithmic and chronological.

- **Borrow**: **the deliberate slowness as a stated feature.** IRL
  already refuses the engagement machine; FPF shows that saying so
  plainly is itself the product's appeal, not a caveat.
- **Borrow**: the digest as the reach-them-when-away channel. A daily
  or weekly digest may serve IRL better than push for most cases —
  directly relevant to G7 and the Notifications item.
- **Avoid**: plain-text-only as an aesthetic. IRL is a phone-first
  app with events and people; legibility does not require plainness.
- **Note**: FPF is a for-profit public benefit corporation partly
  funded by local advertising. IRL's money frame (O3) rules ads out;
  the resemblance is in posture, not model.

### Seattle Public Library — the institution-you-trust register

Observed: a service-disruption notice above everything else; task
buttons (events, get a card, ask a question); staff picks; hours and
address in the footer; ten languages.

- **Borrow**: **leading with an honest operational notice.** A civic
  surface says what is broken. IRL's equivalent: if the calendar is
  thin or verification is slow, say so on the page.
- **Borrow**: "common tasks" as the organizing device for members —
  IRL's feed sections already do this (U2).
- **Borrow**: hours, address, a human contact in the footer. Presence
  of a real place and real people is trust that no badge buys.
- **Avoid**: breadth. A library serves everyone; IRL does one thing.
- **Defer**: multilingual support is R10, not this spec.

### What the review changed

1. **G1 and G2 got their teeth from Nextdoor's wall** — "explain
   before you ask" is now a judgeable goal, not a preference.
2. **A digest is a first-class candidate for G7**, not a lesser
   version of push. FPF's model suggests the calm channel may be the
   *right* channel; the Notifications item should evaluate both.
3. **Honest operational notices** join the landing page's job (SPL).
4. **The event page deserves warmth** (Partiful) — recorded for the
   surface slices that follow the landing page.

## 4. Responsive: what "natural on both" means

Today there is **not one media query** in `styles.css`. Establishing
this is new work on every surface, not a landing-page concern.

- **Phone is the design origin**, not a fallback. The single column
  stays the phone layout.
- **Desktop is a real layout**, not a centered phone. Content uses
  the width: multi-column where the content is list-like, a readable
  measure (about 65–75 characters) for prose, and no full-width
  stretching of text.
- **Breakpoints follow content**, not devices. Named in chunk 2 from
  where the current layouts actually break.
- **One document, one stylesheet.** No separate mobile site, no
  user-agent switching — the thing that makes the comparative set's
  "mobile web is a restyled desktop" pattern feel second-class.

## 5. Installable, and what it buys

Requirements (verified 2026-09-16 against MDN and Apple's developer
documentation):

- **Manifest** referenced from every page, with `name`/`short_name`,
  `start_url`, `display: standalone`, `theme_color`,
  `background_color`, and icons including **192px and 512px**.
- **HTTPS** — already true.
- **Service worker** is not required for installability on Chromium,
  but is required for push, and is what keeps the first paint honest.
  Ours stays minimal: app shell only. **No offline data caching** —
  the API is the source of truth, and a stale roster is worse than
  no roster.
- **iOS** installs from the Share menu, with or without a manifest,
  and does **not** support `beforeinstallprompt`; a custom install
  prompt is a Chromium-only affordance.

## 6. Push: the constraint that shapes G7

Verified 2026-09-16 (Apple developer documentation; corroborated by
MDN and multiple implementer write-ups):

- **iOS supports web push only for home-screen-installed web apps**,
  since iOS/iPadOS 16.4. In a Safari tab, the Push API is not merely
  denied — it is absent. **G6 is therefore a hard prerequisite for
  G7 on iPhone**, which is most of the founding cohort.
- **The permission prompt must follow a user gesture.** It cannot
  fire on load. This suits G4: the ask is a thing a member chooses to
  open, never an interruption.
- Desktop (Chromium, Firefox, Safari on macOS) allows push without
  install, still gated on permission.

**What this means for the asking.** The permission prompt is a
one-shot resource: a denial is effectively permanent and, on iOS,
uninstalling clears the subscription. So the design rule for G7:
*never ask cold*. Ask in context, immediately after the member does
something that implies wanting to know — confirming attendance,
proposing an event — with plain text about what we will send. A
member who declines still gets the in-app surfaces and the digest.

**Digest or push is an open hypothesis, not a pending decision**
(H8). The founder's read, 2026-09-16: a digest suits a busy,
non-urgent channel, but how much of that any given member wants is
unknown. So G7 stays channel-agnostic — the spec requires consented,
non-cold asking and leaves which channel carries what to H8's
evidence: a calm digest for the non-urgent, push reserved for
commitment-bound, time-sensitive messages, with the kill criterion
that a cancellation reaching someone too late kills digest-first for
that class.

**What IRL is willing to send** is a D12 question, not a technical
one, and belongs with the Notifications item: cancellations and
changes to events the member committed to, and time-sensitive
organizer messages. Not: activity summaries, "people you might
like", re-engagement nudges, or anything whose purpose is a return
visit.

## 7. How design decisions are made (U10)

**Analysis → decision → traceability**

1. **Analysis first.** A designed area gets a design note holding the
   reasoning (K-006). This spec is the first.
2. **Comparative review before drawing** (§3), with borrow/avoid per
   reference.
3. **Directions, not iterations.** Distinct directions against one
   brief, compared side by side — never one design nudged
   repeatedly, which optimizes without ever choosing.
4. **Live review.** Directions ship behind the workshop switcher, so
   reviewers see them in a real browser on a real phone.
5. **Judged against the goals, in writing.** Each direction gets a
   line per goal — **holds / partly / fails** — before any
   preference is voiced. Taste decides among directions that all
   hold; it never rescues one that fails a goal.
6. **The call becomes a U-row**, with its reasoning and a pointer to
   the note.

**Revision, including major change**

7. U-rows carry a **status**: `accepted` · `superseded by U<n>,
   because …` · `deprecated`. A small revision stays a dated note in
   place. A decision that **reverses** an earlier one is a new row
   that supersedes it — never a silent edit. The register keeps the
   record of what we used to think and why we stopped (the
   D-register's discipline, K-004, applied to design).
8. **A major change re-enters at step 1.** It is a fresh analysis
   with its own directions and judging, not an edit. Major means: it
   contradicts a stated goal, changes the identity, or changes what
   a surface is *for*.
9. **Feedback re-enters through D66** — FB-rows against the U-rows,
   triaged against the recorded decision, answered *changed /
   stands / routed*. Feedback is evidence, never a vote (D21 applied
   to design).
10. **Traceability**: goal → U-row → design note → implementation →
    verification. The U-row's "Lives in" column is the last link.

**Cadence.** This spec is re-read at each launch-playbook phase gate,
and whenever a goal is contradicted twice by real feedback. Goals
change only by dated revision — the spec is provisional too (W-004).

## 8. Accessibility bar

WCAG 2.2 AA is the target. Concretely, and checked per direction:

- **Remove `user-scalable=no`** from the viewport meta on every page.
  It blocks pinch-zoom today and is the one outright violation we
  know we ship.
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text) **in every registered
  theme** — Lantern and Pebble included, since a theme can break it.
- Visible focus on every interactive element; keyboard reachable in
  DOM order; no keyboard traps.
- Touch targets ≥ 44×44 CSS px with adequate spacing.
- `prefers-reduced-motion` respected; motion stays 150–200ms
  ease-out and never conveys information alone.
- Real landmarks and headings (`<main>`, `<nav>`, one `<h1>`); every
  control has an accessible name; state is not conveyed by color
  alone.
- Forms: labels tied to inputs, errors in text next to the field.

An audit against this list is its own Backlog item; directions are
checked against it as they are drawn, not after.

## 9. Performance budget

No build step, so the budget is about restraint, not tooling.

- **Landing page**: ≤ 100 KB transferred before fonts; first
  meaningful paint without waiting on JavaScript (the page is
  already server-static — keep it that way).
- **CSS**: `styles.css` is 69 KB raw / ~12 KB gzipped today. Ceiling:
  ~90 KB raw. Theme layers count against it, which is a reason not to
  keep every direction as a shipped theme forever.
- **Fonts**: at most two families in the default theme, `display:
  swap`, and no layout shift from the swap. Extra faces for
  non-default themes load lazily (as Pebble's Fraunces already does).
- **JavaScript on the landing page**: none required for content.
  Theme init and taglines only.
- **Images**: none in the current design. If a direction introduces
  them, each must carry explicit dimensions, lazy loading below the
  fold, and a stated weight inside the page budget.

## 10. Open questions and watch

- **Digest vs push** for G7's first real consumer (cancellations) —
  now **H8** in the hypothesis register, with kill criteria and the
  signals that would settle it. Not a decision waiting to be made;
  a belief waiting for evidence.
- **What a thin calendar looks like on the landing page.** SPL's
  honest notice suggests saying it; we have not designed how.
- **Desktop for the app screens** (feed, event detail) is a bigger
  question than desktop for the landing page. Chunk 2 sets the
  posture; the surface slices will test it.
- **Watch**: theme count versus the CSS ceiling (§9).
- **Watch**: the install ask. G6 makes install valuable to *us*
  (it unlocks iOS push), which is exactly the pressure that produces
  nagging install banners. G4 says the ask stays passive and
  documented until evidence says members want it.
