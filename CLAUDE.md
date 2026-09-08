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

## What This Project Is

A mobile-first web app for a local community meetup platform. Users go through an AI-guided onboarding interview, discover nearby events and people, and coordinate real-world meetups. Privacy-focused: only first names shared, no messaging — just show up.

## Design documentation

`docs/design-notes.md` is the index to the design notes; `docs/classification.md` is the binding methodology declaration (D68); `docs/decisions.md` is the canonical decision register (D1–D69), `docs/open-risks.md` the known-gaps tracker, and `docs/radar.md` the register of tracked-but-undesigned workstreams (R1–R11: decision registers & feedback intake — graduated to `registers-and-feedback.md`, A/B testing UX, age/locality verification, staff↔member support comms, community launch playbook — graduated to `launch-playbook.md`, broad community feedback, pricing & sponsorship, demand signals & event suggestions, operating at unstaffed scale — graduated to `operations.md`, languages & localization, organization/entity/governance — worked in the private org register). Read those before extending any designed area — most conceptual decisions (user model, onboarding, debrief, matching, policy, trust) are already made and recorded there.

## Repo family

Three repos, one project (methodology: one Classification each):

- **majodali/in-real-life** (this repo, public) — the app + infra
  constructs + design docs. Product work happens here.
- **majodali/in-real-life-ops** (private) — deployment/operations:
  environment registry, `irl-ops` CLI, runbooks, activity register,
  ops journal. Anything touching AWS accounts, deploys, DNS, or
  recovery happens there (clone as a SIBLING directory — its CDK app
  imports stacks from `../in-real-life/infrastructure`).
- **majodali/in-real-life-org** (private) — organization/governance:
  entity, money frame, board, roles (O-register). The R11 boundary:
  mechanics public, org internals private.

A session attached only to this repo can request the other two by
name through its repository tools when the deliverable needs them.

## Architecture

- **Multi-file static app** — HTML + separate CSS/JS modules in `src/`
- **Static hosting** — S3 + CloudFront (provisioned via CDK), domain `https://in-real.life`
- **Backend (built, pre-launch)** — HTTP API + Lambda + DynamoDB + Cognito at `https://api.in-real.life`. Hybrid event sourcing per `docs/event-sourcing.md`: command runner with idempotency (`irl-commands`), immutable event log (`irl-events-log`, Streams enabled), synchronous per-event projections into state tables via `TransactWriteItems`, an async Streams projector building the derived `irl-user-model` read store, per-aggregate crypto-shredding, workshop mode with simulated time. ~30 routes across users / events / interactions / polls / suggestions / notify / workshop; functional tests run against the deployed `IrlStackTest`. The frontend screens are wired to the API via `services.js` (Cognito auth + command wrappers); `localStorage` remains for the dev persona flow and offline fallbacks.
- **Dev start page** — `src/index.html` is a persona selector for testers (not part of final app)

## Local Development

This project is developed locally with normal tools (`Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep`). There is no remote IDE in the loop.

### Editing the app

The app is plain HTML/CSS/JS with ES modules — no build step. Edit files in `src/` directly.

To preview locally, copy `src/app.html` to `src/app.local.html` (gitignored) and replace the `__IRL_*__` placeholders in the `<script>` block at the top with real values from your stack. Then:

```bash
cd src && python3 -m http.server 8000
# open http://localhost:8000/app.local.html
```

### Deploying

This repo is the public app source. Deployment is owned by the private ops repo (`in-real-life-ops`) which configures CDK context, runs `npx cdk deploy`, and invokes the runtime-config injection + S3 sync for each environment.

For manual operator-driven deploys (until the deploy Lambda is in place):

```bash
# Backend (CDK)
cd infrastructure
npm install        # first time only
npx cdk deploy <stack>     # e.g. IrlStack, IrlStackTest

# Frontend (substitute config, sync to S3, invalidate CloudFront)
node infrastructure/scripts/inject-config.mjs <stack>
```

`inject-config.mjs` reads CDK outputs from the named stack, replaces the `__IRL_*__` placeholders in `src/app.html`, writes to `dist/`, then syncs to the stack's bucket and invalidates the distribution. Use `--dry-run` to preview the substitution without uploading.

### Infrastructure

- **Stack construct**: `infrastructure/lib/irl-stack.ts` (parameterized by stage + optional domain)
- **Default stacks**: `IrlStack` (workshop) and `IrlStackTest` (backend-only); both defined in `infrastructure/bin/app.ts`. Prod and named-workshop stacks are configured from the ops repo.
- **Region**: workloads in `us-west-2` (dedicated accounts, ops account-strategy decision); `us-east-1` holds only the per-env `IrlDnsStack` companions (hosted zone + CloudFront cert — an AWS constraint)

## Design

- Earthy color palette (--earth, --moss, --sage, --mist, --cream, --warm, --amber, --rust)
- Fonts: Playfair Display (headings), DM Sans (body)
- Mobile-first: phone-shaped layout, single column, touch-friendly
- Touch/swipe + keyboard navigation

## File Structure

```
src/
  index.html                  Dev start page (persona selector) — NOT in final app
  app.html                    Main app shell
  css/
    styles.css                All styles
  js/
    app.js                    App init, hash-based routing, screen management
    config.js                 Config constants (feedback URL, etc.)
    store.js                  localStorage wrapper (users, RSVPs, confirmations, debriefs)
    data.js                   Mock data (events, personas, interview/debrief questions)
    alternatives.js           Content-alternative registry for ⋯ menus
    components/
      ellipsis-menu.js        Reusable ⋯ menu (alternatives + feedback access)
      feedback-form.js        Feedback submission form
    screens/
      onboarding.js           AI interviewer Q&A flow (scripted now, Claude API later)
      interview.js            Reusable card-based question engine
      feed.js                 Feed screen (Happening/Possible/Nearby tabs, RSVP)
      detail.js               Meetup detail screen (confirm, suggest change)
      profile.js              User profile screen
      debrief.js              Post-event debrief (rating, who, optional deep dive)

infrastructure/
  bin/app.ts                  CDK entry point
  lib/irl-stack.ts            Main CDK stack (tables, Cognito, HTTP API, Lambdas)
  lambda/
    api/
      index.mjs               API Lambda composition root (wires router, command runner, stores)
      lib/                    Core: router, command runner (idempotency + event log +
                              transactional projections), ULID, workshop time,
                              crypto-shred + key store + PII registry
      users/                  Register, profile, locality, me, export, delete (+ projections)
      events/                 Propose, list, lifecycle, interactions, suggestions, polls (+ projections)
      workshop/               get-time, admin-time (simulated clock)
      notify/  admin/         Location-notify signup + admin list
      stream-projector.mjs    Streams projector Lambda entry point (same asset, own function;
                              named to avoid shadowing by the projector/ directory)
      projector/              Async user-model projector → irl-user-model read store
    feedback/index.mjs        Feedback Lambda (S3 writer)
  test/
    functional/               End-to-end tests against deployed IrlStackTest (incl. replay proof)
    helpers/                  CDK-output config, Cognito auth, cleanup, workshop time
```

Unit tests are co-located `*.test.mjs` files (`npm test`); functional tests hit a live stack (`npm run test:functional`, serial).

The functional suite reads the deployed stack's outputs, so it needs
the **region and credentials of the account you deployed to** —
workloads are in `us-west-2`, and an explicit region on the SDK client
overrides whatever the profile configures:

```bash
export AWS_PROFILE=irl-nonprod   # the SSO profile you logged in with
export AWS_REGION=us-west-2      # or set a region on that profile
npm run test:functional
```

Nothing is guessed: a missing region fails loudly rather than silently
reading the wrong one (`test/helpers/region.mjs`), and a stack read
that fails names the region and profile it used.

## Page Flows

- **Dev start page** (`src/index.html`): Pick a pre-built persona, a previously-created user, or create a new user
- **Onboarding** (`#onboarding`): Card-based AI interview — warm & exploratory tone
- **Feed** (`#feed`): Tabs filter event cards, "I'm in" toggles RSVP, tap card to open detail
- **Detail** (`#detail/:eventId`): See who's going, confirm attendance or suggest changes
- **Profile** (`#profile`): User info, avatar, vibe message
- **Debrief** (`#debrief/:eventId`): Post-event reflection — rating, who you met, optional deeper Q&A

## Data Model (localStorage)

| Key | Shape | Purpose |
|-----|-------|---------|
| `irl_users` | `User[]` | All user profiles (pre-built + created) |
| `irl_active_user` | `string` | ID of current user |
| `irl_rsvps` | `{ [userId]: eventId[] }` | RSVP state per user |
| `irl_confirmations` | `{ [userId]: eventId[] }` | Confirmed meetups per user |
| `irl_debriefs` | `{ [userId]: { [eventId]: Debrief } }` | Post-event reflections |

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
