# Hosted register views

Status: closed → Backlog entry (2026-08-25). All three chunks
delivered and merged (PR #62; CRLF deploy fix PR #65); chunk-1 gate
passed 2026-08-21 (pages + "How we decide" copy approved; the
entry-terseness observation became the backlog's register-readability
item); chunk-2 live-verified by the founder on the workshop stack
2026-08-25 (links + content confirmed); chunk-3 sample pack reviewed
in the PR. The Backlog's checked K-009 entry is now the record.

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

### Chunk 1 — renderer + pages, local — DELIVERED (at gate)

Shipped: `infrastructure/scripts/render-registers.mjs` (zero-dep;
`--out <dir>`; exported pure functions) + co-located unit tests (the
`npm test` glob now includes `scripts/`); all three pages render from
the real registers — every D-row asserted (the register's
blank-lines-between-rows form handled), risks verbatim, entry-card
tables, generation date + revision stamped; design note
`docs/hosted-register-views.md`; D69 recorded.
Gate: founder reviews the rendered pages and the design note.

### Chunk 2 — publish wiring — DELIVERED (gate: live verification)

Shipped: `inject-config.mjs` imports `renderRegisters` and generates
`dist/registers/` right after the dist assembly, so every site deploy
republishes the snapshot (`--dry-run` unchanged — it still prints the
substituted app.html and exits before any dist build); "How we
decide" links added to the homepage footer and the terms page (plain
`registers/index.html` hrefs — no CloudFront rewrite needed).
Gate: founder runs the next workshop deploy (`irl-ops deploy
workshop` — agent sessions carry no AWS credentials) and sees the
live pages; sign-off makes the prod publish part of the next
ordinary deploy.

### Chunk 3 — advisor-pack mode — DELIVERED (at gate)

Shipped: `--pack <manifest.json>` mode — JSON manifest (title, intro,
excerpts: file / optional section `heading` prefix / title /
questions) → pack index (excerpts + questions + the D66 intake
promise) and one page per excerpt (questions box, rendered content,
GitHub link), pack-specific footer, never deploy-synced; section
extraction + pack build unit-tested (11 tests total); worked example
`docs/advisor-packs/round-1.sample.json` from `registers-and-feedback.md`
§3's round-one list, built against the real docs by test.
Gate: founder reviews the sample pack against what round one actually
needs; with the chunk-2 live check, the PR review closes the plan out
to the Backlog entry.
