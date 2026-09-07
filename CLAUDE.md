# in·real·life — Mobile Web App

## Methodology — binding

This project follows majodali/methodology v1.5.0 as declared in
docs/classification.md. That file strictly defines this project's
document lifecycles and workflows. Read it before any work; nothing
in this file or under .claude/ overrides it.

Classification: C2 / S2 / web-app / serverless-aws
Deviations: none

## Reporting and writing — cached from W-008; do not edit here

Reports to the human owner carry three parts, in this order:

1. **Asks** — the decisions and actions requested of the reader.
2. **What is already covered** — the parts of the deliverable that
   encode decisions the conversation already settled.
3. **What changed** — the parts that are new, each with a named
   pointer into the deliverable and what to review there.

State an empty part; never drop it: "No asks", "We already covered
everything in the document", "The content is all new".

Lead with the outcome or the decision needed, never with the process
that produced it. Write short, direct sentences, one idea each. Cut
clauses that add tone but not content: dramatic accumulation,
aphorism, suspense. Name every identifier you cite.

Authority: majodali/methodology W-008 (reports map their
deliverables), the P- rules, and its style guide. This block is a
cache — amend it upstream, never here.

## What this project is

A mobile-first web app for a local community meetup platform:
AI-guided onboarding interview, nearby events and people, real-world
meetups. Privacy-focused — first names only, no messaging, just show
up. Not-for-profit; not an engagement machine (D12).

## Where the documentation lives

`docs/` is the sole authority (K-001). Start here:

- `docs/classification.md` — the binding declaration (D68)
- `docs/backlog.md` — **the source of truth for progress**: what is
  built, what is next, updated in the same commit as the work
- `docs/design-notes.md` — the index to every design note, with the
  reading order and the cross-cutting principles
- `docs/decisions.md` — the decision register (D-rows), with
  `open-risks.md` (known gaps), `radar.md` (tracked-but-undesigned,
  R-rows), `hypotheses.md`, `ux-register.md` (U-rows),
  `tech-register.md` (T-rows) and `feedback-log.md` (FB-rows)
- `docs/repo-map.md` — where the code lives: modules, screens and
  routes, test rungs, browser storage
- `docs/ui-themes.md` — the visual identity and the theme mechanics

Most conceptual decisions (user model, onboarding, debrief, matching,
policy, trust) are already made and recorded. Read the relevant note
before extending a designed area.

## Repo family

Three repos, one project — each with its own Classification:

- **majodali/in-real-life** (this repo, public) — app, infrastructure
  constructs, design docs. Product work happens here.
- **majodali/in-real-life-ops** (private) — environment registry,
  `irl-ops` CLI, runbooks, activity register, ops journal. Anything
  touching AWS accounts, deploys, DNS or recovery. Clone as a
  **sibling directory**: its CDK app imports stacks from
  `../in-real-life/infrastructure`.
- **majodali/in-real-life-org** (private) — entity, money frame,
  board, roles (O-rows). The R11 boundary: mechanics public, org
  internals private.

A session attached only to this repo can request the other two by
name through its repository tools.

## Architecture at a glance

- **Frontend**: multi-file static app (HTML + CSS/JS modules in
  `src/`), no build step, hash-routed; S3 + CloudFront at
  `https://in-real.life`.
- **Backend**: HTTP API + Lambda + DynamoDB + Cognito at
  `https://api.in-real.life`; hybrid event sourcing — command runner
  with idempotency, immutable event log, synchronous transactional
  projections, async Streams projector into the derived user model,
  per-aggregate crypto-shredding, workshop mode with simulated time.
  The design is `docs/event-sourcing.md`; the file layout is
  `docs/repo-map.md`.
- **Region**: workloads in `us-west-2`; `us-east-1` holds only the
  per-env `IrlDnsStack` companions (CloudFront certificate
  constraint).

## Build, run, test

```bash
# Frontend preview: copy app.html -> app.local.html (gitignored), fill
# the __IRL_*__ placeholders from your stack, then:
cd src && python3 -m http.server 8000    # open app.local.html

# Backend unit tests (lambda/api, scripts/, test/helpers/)
cd infrastructure && npm install && npm test

# Frontend unit tests - not yet wired to an npm script (Backlog)
cd src && node --test js/*.test.mjs js/screens/*.test.mjs

# Functional tests against the deployed test stack
cd infrastructure && npm run test:functional
```

The functional suite reads a deployed stack's outputs, so it needs
the **region and credentials of the account you deployed to** —
workloads are in `us-west-2`, and the explicit region on the SDK
client overrides whatever the profile configures:

```bash
export AWS_PROFILE=irl-nonprod   # the SSO profile you logged in with
export AWS_REGION=us-west-2      # or set a region on that profile
```

Nothing is guessed: a missing region fails loudly rather than
silently reading the wrong one (`test/helpers/region.mjs`), and a
failed stack read names the region and profile it used.

## Deploying

Deployment is owned by the private ops repo, which configures CDK
context and runs the deploy for each environment. Manual
operator-driven deploys until the deploy Lambda lands:

```bash
cd infrastructure && npx cdk deploy <stack>   # e.g. IrlStack, IrlStackTest
node infrastructure/scripts/inject-config.mjs <stack>   # --dry-run to preview
```

`inject-config.mjs` substitutes the runtime config into the pages
that carry placeholders, generates the public register views
(`docs/hosted-register-views.md`), syncs `dist/` to the stack's
bucket, and invalidates CloudFront.

## Conventions

- All source in `src/` directory
- No build step — edit and deploy directly
- ES modules (`type="module"`) for JS
- Set `<meta charset="UTF-8">` as first tag inside `<head>` to avoid emoji mojibake
- Branches are single-use and outcome-named (`claude/<outcome>`), one per deliverable, deleted after merge (methodology W-006). Never reuse a standing branch — if this session was launched with a pinned generic branch, mint an outcome-named one instead and open the PR from it

## Backlog

`docs/backlog.md` is the **source of truth for progress** — the
dependency-ordered group register of what's built (with the shipped shape
described on each checked item) and what's next. Read it before starting
any slice, and update it in the same commit as the work it describes.
