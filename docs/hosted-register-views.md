# Hosted register views

The public, hosted, latest-snapshot views of the decision and risk
registers (decided: D69; methodology K-009 — the C3 promotion gate at
soft open, launch playbook §6; K-008's "current, honest window
without reading commits"). Plan: `plans/hosted-register-views.md`.

## Shape

- **The markdown registers stay the source of truth.** The views are
  generated — `infrastructure/scripts/render-registers.mjs`, a
  zero-dependency Node script (same posture as `inject-config.mjs`)
  with unit tests — never hand-maintained. "Kept current" is a
  property of the deploy path, not a process: chunk 2 wires the
  generator into `inject-config.mjs` so every site deploy regenerates
  the pages; with Phase 4 deploy workflows that becomes automatic on
  merge.
- **Three pages, K-009's minimum, deliberately not more**: an index
  ("How we decide") carrying the supporting explanation — what the
  registers are, decisions-are-revisable, and D66's answer-back
  promise (changed / stands / routed) — plus the decision register
  and the open-risks view. Radar, hypotheses, U/T views are a later
  add when something asks for them; the renderer takes any register.
- **Latest snapshots only** (K-009's own bar): each page stamps its
  generation date and source revision and links the GitHub history —
  the repo is the historical record, the page never is.
- **URL shape**: `/registers/` (founder-confirmed), linked "How we
  decide" from the homepage footer and the terms page (chunk 2).
- **Open risks render verbatim** (founder-confirmed) — the frank
  defect language *is* the honesty the public window exists for;
  backstage-and-legible applies to us too.
- **Workshop stacks serve the same pages** (founder-confirmed): same
  build, no gating — the registers are public data by construction.
- **Rendering**: a small markdown subset (headings, paragraphs,
  lists, tables, bold/italic/code/links) — registers are written in
  exactly that subset. Register tables render as stacked entry cards
  (id chip + body + labeled detail lines), mobile-first, site
  palette/fonts, no JS. Relative `.md` links rewrite to GitHub;
  tables survive the blank-lines-between-rows form the real register
  uses. The full-register unit test asserts every D-row renders, so
  structural drift in the registers fails the build rather than
  silently dropping entries.

## Advisor-pack mode (chunk 3, the D66 one-build claim)

The same renderer will take an explicit file list + output directory
to produce a round pack's excerpt pages (excerpts + per-excerpt
questions + the intake-promise paragraph). The pack stays an
operating artifact assembled per round (`registers-and-feedback.md`
§3) — never a standing page.

## Open questions

- Whether the decision register's growing length eventually wants
  per-group anchors or a filter — wait for a reader to ask.
