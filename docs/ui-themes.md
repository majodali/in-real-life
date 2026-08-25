# UI themes — the visual identity and the review seam

The app's visual identity and the runtime theme system it rides on
(decided: U9; inputs: `design/ui-directions-2026-07.{md,html}` — the
July 2026 exploration, four directions on the feed + an interview
card with per-direction tokens and a recommendation).

## The decision (U9, 2026-08-25)

- **Morning Linen is the default identity, all stages** — direction
  A, the refined evolution: same earthy temperament and type pairing,
  recrafted. Light header with the Playfair greeting as hero, linen
  surfaces (20px radius, one elevation recipe), accent stripes gone,
  amber as the card's single warm note (counts/time), moss for
  commitment, hairline-ruled section labels, pill actions, raised
  type floor, serif interview questions.
- **Grove** is the name given to the original identity (the
  un-attributed baseline styles — dark green header, white cards,
  accent stripes). Retained in the workshop switcher for comparison;
  no longer served as a default anywhere.
- **Lantern** (direction C, warm dark) is reserved as the future
  **member-selectable dark theme** — a backlog item, not built as a
  member surface yet. Its theme layer ships now for workshop review.
- **Pebble** (direction D) stays a review theme; the rebrand question
  is closed for now.
- Field Notes (direction B) was dropped as a standalone theme; its
  date-anchored list grammar remains the named future refinement of
  Morning Linen's feed sections (the exploration's recommendation).

## Mechanics

- **Themes over forks**: each theme is a CSS layer in `styles.css`
  keyed off `data-theme` on the root element, behind existing class
  names — no markup forks. Grove is the absence of the attribute.
- **The default is static**: `app.html` sets
  `data-theme="morning-linen"` on `<html>`, so production renders the
  identity with no JS and no flash. `js/theme.js` only acts on
  workshop stacks.
- **Workshop switcher**: a floating chip (bottom-left) cycles the
  registered themes; selection resolves `?theme=` → per-tab
  sessionStorage → default, and `history.replaceState` keeps the URL
  shareable as seen. This is the standing vehicle for design reviews
  with other people: hand each reviewer a `?theme=` link. Production
  ignores `?theme=` entirely.
- **Fonts**: Pebble's Fraunces loads lazily (theme.js injects the
  Google Fonts link on first application), so the base app never pays
  for faces it doesn't use.
- **State-driven accents without markup**: Lantern's "lit" committed
  card uses `:has(.mylevel-confirmed)` — the effect follows real RSVP
  state.

## Deliberately not done yet (each named in the Backlog)

- **Member-selectable dark theme** (Lantern) — needs a member-facing
  setting surface and cross-device persistence thinking; until then
  themes are a workshop review tool only.
- **Landing page, terms, and register views** still render the Grove
  identity — the app shell moved first; those surfaces follow as
  their own slice.
- **Field Notes' list grammar** folded into Morning Linen's feed —
  a markup change (date column, entry rules), not a theme layer.
- Shared moves needing markup/data: avatar clusters over counters,
  authored editorial one-liners.

## Watch

- Two identities coexist until the landing/terms/registers slice
  lands — acceptable short-term, but the seam is visible (app linen,
  landing grove); prioritize that slice before soft open.
- The switcher's theme registry is append-only in spirit: removing a
  theme invalidates shared `?theme=` links reviewers may hold.
