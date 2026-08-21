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
- **Pinned methodology version**: 1.1.0 (compliance target; migrated
  from 1.0.0 on 2026-08-21 — the v1.1.0 migration notes impose no
  mandatory duties; the optional audit-log register is adopted as
  `docs/audits.md`)
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
