# Classification

The binding declaration (methodology vocabulary: *Classification*) —
this project follows
[majodali/methodology](https://github.com/majodali/methodology).
Adoption decided in D68; the omission defaults and field definitions
live in the methodology vocabulary, the sole authoritative location
for them.

- **C-tier**: C2 (serious project, pre-users). Promotion to C3 is
  bound to soft open — real members are what "production with real
  users" means here; the gate rides the launch playbook (§6).
- **Pinned methodology version**: 1.5.0 (compliance target;
  migrated from 1.4.0 on 2026-09-02 — v1.5.0 carries one migration
  note: a project with an Agent bootstrap copies W-008's prescribed
  block into it verbatim, done in `CLAUDE.md` in the same commit. The
  other five amendments ship migration-note `none`.)
- **S-level**: S2 (member PII: profiles, interview content, debriefs —
  see the crypto-shredding design and PII registry)
- **Type**: web-app
- **Target**: serverless-aws
- **Workflow**: stages `proposed → designed → built → workshop →
  production`; **live = production**. Backlog entries carry stage
  designations under the default rule declared in the Backlog header
  (checked ⇒ `production`; unchecked ⇒ `proposed`; entries deviating
  carry an explicit `stage:` marker — e.g. workshop-only surfaces).
  This format is a project-local choice pending the methodology's own
  Workflow-declaration-format calibration (its Backlog, open item 4).
- **Family**: in-real-life (lead) — members:
  [in-real-life-ops](https://github.com/majodali/in-real-life-ops) and
  [in-real-life-org](https://github.com/majodali/in-real-life-org),
  the D6 split's siblings: one product, three repos. This repo is the
  family's documentation home; the O1/OPS1 seams stay the boundary
  rules, each member's Classification stays its own. Composition is
  mirrored in the methodology
  [Portfolio register's Families section](https://github.com/majodali/methodology/blob/main/docs/registers/portfolio.md#families).

## Deviation register

No deviations recorded.

(Two candidates were resolved by doing the work instead of recording
deviations, 2026-08-19: single-use, outcome-named branches adopted per
W-006 — retiring the reused session branch — and branch protection
enabled on `main` rather than declaring the deploy-on-push posture.)

## Custom definitions

No custom definitions. The project's registers (`ux-register.md`,
`tech-register.md`, `feedback-log.md`, `radar.md`, `hypotheses.md`)
are instances of the standard Register type; design notes, runbook-like
docs (`workshop-crib-sheets.md`), and plans use the standard types.
