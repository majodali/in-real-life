# Landing directions — September 2026, judged

Three directions drawn against `landing-brief-2026-09.md` and judged
against the design-spec goals. Written under U10 step 5: **every
direction gets a line per goal — holds / partly / fails — before any
preference is voiced.** The scorecard in §2 was written before §4.

Live: `src/landing/index.html` on any workshop stack (review-only; the
deploy drops `src/landing/` from a prod bundle). Files:
`src/landing/a-calendar.html`, `b-invitation.html`,
`c-notice-board.html`.

## 1. The three directions

**A — The calendar.** The page *is* a week. A labelled `EXAMPLE WEEK`
runs day by day down the right of the desktop layout, with a sticky
intro and CTA on the left; on a phone the intro stacks above the week.
Each card carries time, title, place, a sentence of description, and
the host's first name — and no attendance count. A standing notice,
"Where things stand, September 2026", says in plain words that the
real calendar is empty and why. Principles get their own section,
"What the cards leave out, on purpose", six items, each "no X" paired
with what happens instead.

**B — The invitation.** The page is a letter. Eyebrow "TO OUR
NEIGHBORS ON BAINBRIDGE", then "You're invited to meet your
neighbors, *in real life*", a one-paragraph statement of the whole
thing, and "Accept the invitation". Below: "Why we're writing", "How
it goes", "What we leave out, and what we do instead", "Where we
are", "We hope to see you there." No example events. The warmest copy
of the three, and the shortest — 703 words.

**C — The notice board.** A civic page. A notice bar dated
"SEPTEMBER 2026" runs above the masthead saying where the project
actually is; wordmark and nav below; then a two-column hero with an
`AT A GLANCE` card answering what it is, who it's for, who runs it,
where, and what stage it is at. Then "Four steps, in this order", the
principles section, the locality section, who runs it, three example
notices explicitly labelled "made up to show the shape", and a
closing sign-up.

## 2. Scorecard

Judged at 390 × 844 and 1440 × 900, rendered headless. Contrast,
landmarks, target sizes, prose measure and page length were measured,
not eyeballed; method in §5.

### G1 — what it is, who it's for, what happens next, in ten seconds

| | verdict | evidence |
|---|---|---|
| A | **partly** | "What" and "who" land: the eyebrow reads BAINBRIDGE ISLAND, WASHINGTON and the lede defines IRL in one sentence. "What happens next" does not. The headline — "A week near you, the way we picture it" — describes the page, not the offer, and on a phone the only control above the fold is `Sign in`. |
| B | **holds** | Eyebrow names the audience, the `h1` names the act, the lede names the whole mechanism in one sentence, and "Accept the invitation" sits at y=551 on a phone — inside the first screen. |
| C | **holds** | Strongest. The `AT A GLANCE` card answers all three questions literally and separately, including "Stage: just opening". `Sign up` at y=715 on a phone, with the gating ("18 and over, who live on Bainbridge Island") stated under it rather than discovered later. |

### G2 — invites reading, then acting; sign-up obvious, not loudest

| | verdict | evidence |
|---|---|---|
| A | **fails** | The primary CTA sits at **y=3681 on a 390px phone** — about 4.4 screens of scrolling past example events before the visitor can act. The desktop layout solves this with a sticky left pane (CTA at y=497); the phone layout has no equivalent. Reading is invited better than in either other direction; acting is not available. The failure is positional and fixable, not inherent to the idea — see §4. |
| B | **holds** | CTA in the first screen, reading invited by the letter beneath it. At the edge of "not the loudest thing": on a phone the dark pill runs nearly full width and is the heaviest element on screen. |
| C | **holds** | The `Sign up` pill is compact and paired with a plain-text "Already signed up? Sign in"; the heaviest thing on the screen is the headline. |

### G3 — reads as a neighbourhood thing; principles on the page

| | verdict | evidence |
|---|---|---|
| A | **holds** | Strongest. The example week *is* a neighbourhood noticeboard, and the principles section is the most complete of the three: six paired items, D30 satisfied item by item. |
| B | **holds** | The letter register cannot be mistaken for a product page. Principles are present as prose under one heading rather than itemised — the least scannable of the three, but visible on the page and not behind the CTA. |
| C | **holds** | Principles present and paired ("What we don't do, and what we do instead"). Register is the most institutional of the three — closer to the library reference than to a neighbour's note. That is a judgement about warmth, not a goal failure, and it is held out of the scoring deliberately. |

### G4 — no engagement mechanics (hard constraint, D12)

| | verdict | evidence |
|---|---|---|
| A | **holds** | Scanned for counts, popularity, scarcity, urgency, streaks, badges, ranks, scores and social proof. Every hit is inside a negation ("No streaks, no badges, no feed that never ends"). Event cards carry a host first name and no headcount. "No headcounts" is itself a stated principle. |
| B | **holds** | Clean on every pattern. No example events at all, so no surface that could imply popularity. |
| C | **holds** | Clean. The three example notices carry no counts and are labelled "Not live listings — the calendar is still filling." |

All three also keep the honesty rule: no invented members, no
testimonials, no press, and each says outright that the calendar is
not yet full.

### G5 — natural on phone and desktop; desktop structural; ~68ch prose

| | verdict | evidence |
|---|---|---|
| A | **partly** | Best desktop composition of the three: a genuine two-pane layout that uses the width for structure, not padding. Two defects — one paragraph runs **133ch (1184px)** at 1440px, nearly double the brief's measure; and the phone page is **7092px** tall, which is what strands the CTA under G2. |
| B | **partly** | Weakest desktop. Content occupies roughly 528–1245px of 1440, with a near-empty left rail (wordmark, "AN INVITATION", location, Sign in) and ~200px of dead right gutter. The measure is also inconsistent: the lede runs 740px while the sections below narrow to ~470px for no stated reason. This is close to the shape G5 explicitly rejects. |
| C | **holds** | Two-column hero with the glance card, then full-width bands; widest paragraph exactly **68ch**. Phone: nav wraps to two rows and the notice bar consumes the top of the first screen, but nothing breaks and the `h1` and CTA still land in the fold. |

No horizontal overflow at 390px in any direction.

### G8 — accessibility (WCAG 2.2 AA, §8 of the spec)

| | verdict | evidence |
|---|---|---|
| A | **holds** | One `h1`, `main`/`nav`/`header`/`footer`, skip link, `:focus-visible`, `prefers-reduced-motion`, no `user-scalable=no`, 0 controls under 44×44. Contrast: 134 text elements measured, all pass except the amber interpuncts in the wordmark (2.73:1) — see §3. |
| B | **holds** | Same structural set. Same wordmark defect, at four sites rather than two (the `h1` repeats the dotted wordmark at 22px, where the requirement is 4.5:1 rather than 3:1). |
| C | **holds** | Same structural set. Three controls under 44px — two `hello@in-real.life` links and "How we decide" — all inline links inside sentences, which WCAG 2.2 SC 2.5.8 exempts. Same wordmark defect. |

### G9 — performance budget (§9)

All three hold: no images, no JavaScript, no external assets but the
Google Fonts already in use. Raw 25.2 / 18.8 / 21.3 KB, gzipped 7.4 /
5.9 / 6.7 KB, against a 100 KB budget. One caveat: the directions are
self-contained review files with inlined CSS, so these are not the
landed numbers — folding a direction into `styles.css` moves the cost
into the shared stylesheet, which has its own ~90 KB ceiling. B adds
a Playfair italic face beyond the three weights the site loads today.

### Summary

| goal | A calendar | B invitation | C notice board |
|---|---|---|---|
| G1 ten seconds | partly | holds | holds |
| G2 read then act | **fails** | holds | holds |
| G3 neighbourhood | holds | holds | holds |
| G4 no mechanics | holds | holds | holds |
| G5 phone + desktop | partly | partly | holds |
| G8 accessibility | holds | holds | holds |
| G9 performance | holds | holds | holds |

**C is the only direction that holds every goal.** Under U10 step 5
that settles what taste is allowed to choose between: taste decides
among directions that all hold, and never rescues one that fails.

## 3. Defects found, in all three

- **The wordmark's amber interpuncts are 2.73:1** on cream
  (`#c08a45` on `#f8f3e9`) and carry text-sized glyphs. Inherited
  from the shipped identity, not introduced by any direction.
  Whichever direction lands, the dots need either a darker amber or
  `aria-hidden` separators that are decorative in the accessibility
  tree as well as in intent.
- **A uses British spelling** — "neighbourhood", "neighbour", 8
  occurrences — where the rest of the site (`terms.html`,
  `index.html`) uses American. A copy defect to fix on landing, not a
  scored failure.
- **A's 133ch paragraph** and **B's inconsistent measure** are both
  single-rule fixes.

### Found while measuring: the live pages fail G8 today

Running the same contrast audit against the **shipped** pages at
390px, on the default Morning Linen theme:

- `src/index.html` — **16 failures of 39 text elements**. The
  recurring one is `--soft #77806f` at **3.72:1** carrying 13–14px
  text: every step description, every principle description, and the
  "Terms of Use" / "How we decide" footer links.
- `src/terms.html` — **8 failures of 65**, same token, plus the
  `terms-subhead` headings at 13px.

That is a live WCAG 2.2 AA violation in production, not a property of
these directions — they avoid it. It is now `R…` in `open-risks.md`
and a Backlog item; landing chunk 4 fixes it for the pages it
touches, and the accessibility audit item covers the rest.

## 4. Recommendation (written after §2, not before)

**Land C as the base.** It is the only direction that holds every
goal, its desktop layout is the one that needs no structural rework,
and the `AT A GLANCE` card does more work for a first-time visitor in
ten seconds than anything else drawn.

Two named borrowings, because C's weakness is warmth and the other
two hold what it lacks:

1. **A's example week**, as one band inside C rather than as the
   page. C already has three example notices; replacing them with A's
   day-anchored list — same labelling, same honesty notice, same
   absence of counts — gives the visitor the shape of a real week
   without making them scroll a week to reach the CTA.
2. **B's "Why we're writing"** paragraph, near-verbatim. It is the
   best copy produced in this round: "Making friends as an adult
   shouldn't require an algorithm. It used to take a street, a porch,
   and a reason to be in the same place at the same time. Bainbridge
   still has the street and the porch. We are trying to supply the
   reason." It answers G3 in a way a glance card cannot.

**If the founder prefers A**, the route is to fix and re-judge, not
to override the scorecard: move the CTA into the phone's first screen
(a sticky action bar or an intro-then-week stack), cap the measure,
and correct the spelling — then A's line for G2 and G5 is rewritten
and the pick is made among directions that all hold. That is U10 step
5 working as designed, and it is a day of work, not a redraw.

## 5. How this was measured

- Rendered headless (Chromium) at 390×844 and 1440×900.
- **Contrast**: every text node's computed colour composited against
  its nearest opaque ancestor background, ratio computed against the
  WCAG relative-luminance formula, threshold 4.5:1 or 3:1 by computed
  size and weight. Not a reading of the token list — a reading of
  what the browser actually painted.
- **Structure**: counted `h1`/landmarks/skip links, and asserted the
  absence of `user-scalable=no`.
- **Targets**: every `a`, `button`, `input`, `select` and
  `role="button"` measured; anything under 44px in either axis
  listed, then classified against SC 2.5.8's inline exemption.
- **Measure**: each paragraph's rendered width divided by a `100ch`
  probe inserted into that paragraph, so the number is that element's
  own font, not an assumed one.
- **G4**: full visible text extracted and scanned for count,
  scarcity, urgency, gamification and social-proof patterns; every
  hit read in context to separate a mechanic from its negation.

Screenshots at both widths were reviewed for each direction; the
layout findings above (B's empty rail, C's wrapping nav, A's sticky
pane) come from those.
