# Landing page — direction brief, September 2026

The brief handed to the direction drawings (design-spec chunk 3). It
is derived from `docs/design-spec.md`; where the two disagree, the
spec wins. Judgment against the goals happens in
`landing-directions-2026-09.md`, and only after all three exist.

## The job of the page

A first-time visitor — an adult on Bainbridge Island, probably on a
phone, probably arriving from a neighbour's word of mouth — should
understand what IRL is, that it is for them, and what happens next.
Then they should be able to sign up without the page having shouted.

## What the page must do (judged per direction)

- **G1** — what IRL is, who it's for, what happens next, inside about
  ten seconds.
- **G2** — invites reading, then acting. Sign-up is the obvious next
  step without being the loudest thing on screen.
- **G3** — reads as a neighbourhood thing, not a startup product.
  Principles visible on the page, not behind a CTA.
- **G4** (hard constraint) — nothing implying engagement mechanics IRL
  refuses: no streaks, no feed-like surface, no "N people waiting", no
  scarcity, no urgency, no popularity presented as status.
- **G5** — natural on a phone *and* on a desktop; desktop uses the
  width structurally, prose stays near a 68ch measure.
- **G8** — accessible: contrast ≥ 4.5:1, real landmarks and headings,
  one `<h1>`, visible focus, 44px targets, `prefers-reduced-motion`.

## Voice (non-negotiable, from the decision register)

- Warm, not familiar. Warmth is in manner, never manufactured rapport
  (D15/D17).
- "We", never "I". No persona, no name, no mascot (D15/D23).
- Every "we don't do X" is paired with what we do instead (D30).
- No unprovable claims, no invented testimonials, no press quotes, no
  member counts. IRL has no members yet; the page must not imply it.

## Identity (fixed — U9, `docs/ui-themes.md`)

Morning Linen. Use these tokens; do not invent a palette.

```
--earth #2a3a2f   --moss #4c6849   --sage #7a9e6e   --mist #f0ead9
--cream #f8f3e9   --warm #efe7d4   --amber #c08a45   --text #26332a
--soft #77806f    surface #fffdf6  border rgba(42,58,47,.07)
shadow 0 1px 2px rgba(42,58,47,.04), 0 10px 30px rgba(42,58,47,.06)
```

Playfair Display for display type, DM Sans for body. Cards 20px
radius, one elevation recipe, pill buttons, amber as the single warm
note, moss for commitment.

## Copy is in scope

The current text is the starting point, not a fixture. Rewrite
headlines, section copy and the CTA label where the direction calls
for it. Keep the facts true: Bainbridge Island first, adults only,
locality verified, first names only, no messaging, no ads, not for
profit.

## Constraints

- One self-contained HTML file. No build step, no framework, no
  external assets except the Google Fonts already used.
- Real content, not lorem. Example events may be invented but must be
  plausible for Bainbridge and must never be presented as live data.
- Works at 390px and 1440px.
