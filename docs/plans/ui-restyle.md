# UI restyle

Status: draft

Outcome under development: the app restyled per a chosen direction
from the July 2026 UI exploration — reviewed **live in the workshop
environment via runtime theme switching** (founder requirement,
2026-08-25: switch between the candidate designs in the running app;
also the standing vehicle for design reviews with other people), the
pick recorded as a U-row, the exploration branch deleted (the one
standing W-006 exception).

## Inputs

`claude/site-ui-design-exploration-zb14wl` →
`design/ui-directions-2026-07.{md,html}`: four directions on the feed
+ an interview card — **A Morning Linen** (refined evolution of the
current identity), **B Field Notes** (no-card botanical editorial),
**C Lantern** (warm dark; strongest as a dark companion), **D Pebble**
(coastal soft-modern rebrand) — plus shared moves (raise the type
floor, one accent per screen, one elevation recipe, people over
counters, lighter header, calm motion) and the exploration's
recommendation (A as the system + B's date-anchored list grammar;
C as the future `prefers-color-scheme: dark` companion; D only as a
deliberate pre-launch brand decision).

## Shape (proposed)

- **Themes over forks.** Each direction becomes a *theme* in
  `styles.css` keyed off `data-theme` on the root element, behind the
  existing class names (the exploration brief's own constraint). The
  current UI stays as the `current` baseline theme and remains the
  default everywhere.
- **Workshop-only switcher.** A small floating theme chip in the app
  shell, rendered only when `workshopMode` is on (prod never sees
  it). Selection persists per tab (sessionStorage — consistent with
  the per-tab identity isolation) and is shareable/bookmarkable via a
  `?theme=<id>` URL parameter, so a design-review session can be
  handed a link per direction.
- **CSS-only fidelity, honestly bounded.** v1 themes restyle the
  existing markup: palettes, type (Fraunces loaded for B/D),
  radii/elevation, chrome. Shared moves that need *markup or data*
  (avatar clusters over counters, B's authored editorial one-liners)
  are named as follow-ups with the chosen direction, not smuggled
  into the review build.
- **App shell only for the review.** The landing page, terms, and
  register views keep the current identity until a direction is
  chosen; restyling those surfaces lands with the pick (D's "landing
  page and docs would follow" is itself a reason D is a bigger
  decision).
- **After the pick**: the chosen theme becomes the default (all
  stages); the switcher stays as a workshop-only review tool with the
  non-chosen themes retired or kept per the founder's call; U-row in
  `ux-register.md` records the decision; `design/` exploration files
  land in-repo as the design record; the exploration branch is
  deleted.

## Open questions (founder input at the chunk-1 gate)

1. Switcher form: floating chip (bottom corner, tucked away) vs. an
   entry in the profile screen / ⋯ menu?
2. Build all four directions as themes, or trim to the
   recommendation's shortlist (A, B, C-as-dark; D only if the rebrand
   question is genuinely open)?
3. Is `?theme=` + per-tab persistence the right sharing mechanism for
   reviews with others, or do you want a persisted per-stack default
   too (an admin-set workshop theme)?

## Chunks

<!-- Chunk boundaries proposed; founder adjusts and gates (W-001). -->

### Chunk 1 — theme infrastructure + switcher

Recover `design/ui-directions-2026-07.{md,html}` onto this branch
(preserving the exploration before its branch is deleted); tokenize
the hardcoded values in `styles.css` that themes must override;
`data-theme` plumbing + the workshop-only switcher (sessionStorage +
`?theme=`), with `current` as baseline and **A Morning Linen** as the
first real theme to prove the seam.
Gate: founder answers the open questions and flips between `current`
and A locally or on workshop.

### Chunk 2 — the remaining directions as themes

B Field Notes, C Lantern, D Pebble (or the trimmed set from the
gate) at mockup fidelity within the CSS-only bound; Fraunces loaded;
each theme checked across feed / detail / interview / debrief /
profile, not just the mocked screens.
Gate: founder (and any invited reviewers) compare live on the
workshop stack.

### Chunk 3 — the pick, landed

U-row records the decision + reasoning; chosen theme becomes the
default; non-chosen themes retired or kept per the gate; landing
page / terms / register views follow the chosen direction (scope
confirmed at gate — may split into its own slice if D); design note
finalized from `design/ui-directions-2026-07.md`; backlog updated
(including the waiting "suggest change" modal unblock);
`claude/site-ui-design-exploration-zb14wl` deleted; plan closes out.
Gate: founder sign-off on the landed default in workshop → next
ordinary prod deploy ships it.
