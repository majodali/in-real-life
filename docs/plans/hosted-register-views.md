# Hosted register views

Status: draft

Outcome under development: the decision and risk registers published
as hosted, current, latest-snapshot views on the site (K-009 — the C3
promotion gate at soft open, launch playbook §6), built so the same
rendering serves D66's advisor-pack excerpts (one build, playbook §9
item 6) and K-008's "current, honest window without reading commits".

## Shape (proposed — the design note lands in chunk 1)

- **Source of truth stays the markdown registers.** The views are
  *generated* from `docs/decisions.md` and `docs/open-risks.md` at
  deploy time — nothing is hand-maintained twice, and "kept current"
  falls out of the existing deploy path rather than a new process.
- **Generator**: `infrastructure/scripts/render-registers.mjs` — a
  zero-dependency Node script (same posture as `inject-config.mjs`)
  with a small markdown-subset renderer (headings, paragraphs,
  tables, lists, bold/italic/code, links) and unit tests. Repo links
  inside register rows rewrite to GitHub URLs; the pages carry the
  generation date and source revision.
- **Publish path**: `inject-config.mjs` invokes the generator into
  `dist/registers/` before the S3 sync, so **every site deploy
  refreshes the views** (with Phase 4 deploy workflows, that becomes
  automatic on merge). A `--local` mode renders to a temp dir for
  preview without AWS.
- **Pages** (K-009 minimum, deliberately not more): an index page
  with the supporting explanation (what these registers are, the
  revisable-decisions posture, D66's how-feedback-lands promise),
  `/registers/decisions` (D-rows, latest snapshot only), and
  `/registers/risks` (open-risks, latest snapshot only). Radar /
  hypotheses / U / T views are a later add if something asks for
  them — the renderer won't care.
- **Styling**: the site's existing palette and fonts (earthy tokens,
  Playfair/DM Sans), mobile-first, no JS. Linked from the homepage
  footer ("How we decide") and the terms page.
- **Advisor-pack mode** (the D66 one-build claim made real): the same
  renderer takes an explicit file list + output dir, so a round pack's
  excerpt pages are assembled by the founder from named docs when a
  round is scheduled — the pack itself stays an operating artifact
  (registers-and-feedback.md §3), never a standing page.

## Open questions (founder input wanted at the chunk-1 gate)

1. URL shape: `/registers/…` as above, or hang it off an "about"
   page?
2. Should the risk view render `open-risks.md` verbatim (it contains
   frank defect language) or is that exactly the honesty the public
   window wants? (My read: verbatim — backstage-and-legible applies
   to us too, O5 already commits the board to public summaries.)
3. Workshop stacks get the same pages (same build, no gating) —
   fine?

## Chunks

<!-- Chunk boundaries proposed; founder adjusts and gates (W-001). -->

### Chunk 1 — renderer + pages, local

The markdown-subset renderer + register parser with unit tests; the
three pages generated locally (`--local`) from today's registers;
short design note (`docs/hosted-register-views.md`) recording the
decisions above; new D-row.
Gate: founder reviews the rendered pages (screenshots or local run)
and the design note; answers the open questions.

### Chunk 2 — publish wiring

Generator wired into `inject-config.mjs` (+ `--dry-run` respects it);
homepage footer + terms links; deployed to the workshop stack and
verified live; backlog updated.
Gate: founder sees the live pages on the workshop domain; sign-off
makes the prod publish part of the next ordinary deploy.

### Chunk 3 — advisor-pack mode

File-list + output-dir mode producing pack excerpt pages (excerpts +
per-excerpt questions slot + the intake-promise paragraph, D66);
documented in the design note; a sample pack rendered from the round-
one excerpt list (D62 localities, D63 event types, event-policy
summary, protective-blocks) as the worked example.
Gate: founder reviews the sample pack against what round one actually
needs; plan closes out to the Backlog entry.
