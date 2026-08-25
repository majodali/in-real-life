# UI directions — July 2026

Companion notes to `ui-directions-2026-07.html` (the visual exploration:
four directions applied to the feed and one interview card, with
comparison and recommendation). This file records the tokens and moves
per direction so the chosen one can be turned into a spec without
re-deriving them from the mockups.

**Brief:** more sophisticated than the current UI, still welcoming /
low-stress / comforting. Mobile-first, no build step, restyle should land
behind existing class names in `src/css/styles.css` so it doesn't collide
with functionality work.

## Diagnosis of the current UI

Keep: the earthy temperament, Playfair + DM Sans pairing, calm status
pills. Limits: timid type scale (body 11–13px), identical card chrome
everywhere (white box, 14px radius, meaningless accent stripe), a single
elevation level, four accent colors competing per screen, a heavy dark
header holding little information.

## Direction A — Morning Linen (refined evolution)

Same identity, recrafted. Light header; greeting is the hero.

- Ground `#f8f3e9` · surface `#fffdf6` · ink `#26332a` · earth `#2a3a2f`
  · moss `#4c6849` · amber `#c08a45` (one warm note per card)
- Playfair Display for greetings/titles (26–29px, italic turns),
  DM Sans body 14–15px, titles 19px
- Cards: 20px radius, 1px border `rgba(42,58,47,.07)`, shadow
  `0 1px 2px rgba(42,58,47,.04), 0 10px 30px rgba(42,58,47,.06)`
- Time in an amber-tinted pill; avatar clusters + "N going" instead of
  counter pills; "You're in ✓" as a moss-tinted pill
- Section labels: 11px small caps, letter-spacing .16em, trailing
  hairline rule
- Buttons: pill radius, filled earth, soft earth-tinted shadow

## Direction B — Field Notes (botanical editorial)

A naturalist's journal. No cards, no shadows — hierarchy from type and
hairline rules only.

- Paper `#f3edde` · ink `#2f2b1f` · fern `#55663f` · ochre `#8b6f2a`
  (recommendation marker only) · rule `#d9d1b8`
- Fraunces (roman + italic) for titles and one-line editorial
  descriptions; DM Sans small-caps for metadata
- Feed = week list: date column (small-caps day + Fraunces numeral),
  entries divided by 1px rules, sections by a 2px ink rule
- Inputs are underlines, not boxes; interview reads like writing in a
  journal
- Watch: tap targets / state changes need care without boxes; editorial
  one-liners want authored copy (AI spine could write them)

## Direction C — Lantern (warm dark)

A porch light at dusk. Strongest as the evening/dark companion theme to
A or B rather than the sole default.

- Ground `#171d17` (subtle warm radial glow at top) · surface `#212822`
  · cream text `#ede4d0` · amber `#d99a4e` · sage `#8fa986`
- Amber rationed to one job: your commitments ("lit" card = amber border
  + faint glow; filled amber "You're in ✓")
- Elevation via border/glow, never grey shadow
- Playfair in cream, italics in amber; DM Sans body

## Direction D — Pebble (coastal soft-modern; a rebrand)

Fog, sea glass, kelp, clay. The furthest move — palette and display face
both change; landing page and docs would follow.

- Fog `#eceee8` · stone `#fbfcfa` · kelp `#24413a` · sea glass `#7fa99b`
  · clay `#c77b58` · sand chip `#efe7d6`
- Fraunces SemiBold headings; DM Sans body
- 26px card radius, one feather shadow `0 6px 22px rgba(36,65,58,.07)`;
  facts as chips, actions as pills; "I'm curious" as the open-pill
  low-commitment action
- Cheapest to do now (pre-launch) or not at all

## Shared moves (any direction)

1. Raise the type floor: body 14–15px, titles 18–19px, metadata ≥ 11px.
2. One accent per screen with one job (your commitments or the
   recommendation).
3. One elevation recipe; delete per-card accent stripes.
4. People over counters: avatar clusters wherever roster data exists.
5. Lighten the header; the greeting is the hero (except Lantern).
6. Calm motion: 150–200ms ease-out fades/translates,
   `prefers-reduced-motion` respected.

## Recommendation

Build **A** as the system; fold in **B**'s date-anchored list grammar for
scannable sections; keep **C** as the future `prefers-color-scheme: dark`
companion (its palette is a clean inversion of A's). **D** is the honest
alternative if the cream-serif identity feels too familiar long-term — a
brand decision, best made pre-launch.

Next step once a direction is picked: full spec (design tokens, component
inventory) + a working restyle of `styles.css` behind existing class
names.
