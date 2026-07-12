# in·real·life — Mobile Web App

## What This Project Is

A mobile-first web app for a local community meetup platform. Users go through an AI-guided onboarding interview, discover nearby events and people, and coordinate real-world meetups. Privacy-focused: only first names shared, no messaging — just show up.

## Design documentation

`docs/README.md` is the index to the design notes; `docs/decisions.md` is the canonical decision register (D1–D52), `docs/open-risks.md` the known-gaps tracker, and `docs/radar.md` the register of tracked-but-undesigned workstreams (R1–R7: decision registers & feedback intake, A/B testing UX, age/locality verification, staff↔member support comms, community launch playbook, broad community feedback, pricing & sponsorship). Read those before extending any designed area — most conceptual decisions (user model, onboarding, debrief, matching, policy, trust) are already made and recorded there.

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
- **Region**: `us-east-1`

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
      projector.mjs           Streams projector Lambda entry point (same asset, own function)
      projector/              Async user-model projector → irl-user-model read store
    feedback/index.mjs        Feedback Lambda (S3 writer)
  test/
    functional/               End-to-end tests against deployed IrlStackTest (incl. replay proof)
    helpers/                  CDK-output config, Cognito auth, cleanup, workshop time
```

Unit tests are co-located `*.test.mjs` files (`npm test`); functional tests hit a live stack (`npm run test:functional`, serial).

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

## Backlog

Organized into dependency-ordered groups. Earlier groups generally need to land before later ones; within a group, items can usually be tackled in any order. Most items still need detailed analysis before implementation.

### Done so far (prototype against localStorage)

- [x] Card-based AI interview engine (scripted, no real Claude yet)
- [x] User profile screen (name, avatar, vibe message, follow-up questions)
- [x] Event feed with tabs (Happening / Possible / Nearby)
- [x] Event detail screen with confirm + suggest-change stub
- [x] Event lifecycle prototype: RSVP → confirm → attend → debrief
- [x] Debrief screen with optional deeper Q&A
- [x] Content-alternative system + ⋯ menu
- [x] App feedback submission (Lambda function URL → S3)
- [x] Static site infrastructure (S3 + CloudFront + ACM + Route53 at in-real.life)
- [x] Backend event-sourcing core: command runner (idempotency, immutable `irl-events-log`, atomic `TransactWriteItems`), synchronous projections, replay verified end-to-end by functional test
- [x] Backend domain surface: users (register / profile / locality / me / export / delete), events (propose / list / lifecycle / interactions / suggestions / polls), notify; ~30 routes, unit + functional tests against deployed `IrlStackTest`
- [x] Crypto-shredding: per-aggregate AES-GCM keys (`irl-user-keys`), PII encrypted on log records, key destroyed on delete (PII registry gaps for event-aggregate PII flagged in code as pre-launch work)
- [x] Workshop mode runtime: mode flag from stage, simulated time (`irl-config` offset, `WorkshopTimeAdvanced`), admin-gated `POST /admin/time`

### Group 0 — Foundations

Architectural decisions that affect everything downstream. Each warrants a short design note before implementation begins.

- [x] Event sourcing + CQRS core — command runner, immutable log, idempotency, transactional synchronous projections, replay-verified (`docs/event-sourcing.md`)
- [x] Workshop-mode runtime — mode flag, simulated time, admin gate (`docs/workshop-mode.md`)
- [x] End-to-end tracing depth — `lib/tracing.mjs` emits X-Ray subsegments (`idempotency-check` / `encrypt-pii` / `transact-write`) over the daemon wire protocol (no X-Ray SDK dependency); the command runner stamps the invocation's `traceId` on every event record and emits one structured JSON log line per command (status ok/cached/error, durationMs, errorType+stack on failure); HTTP API `$default` stage writes structured JSON access logs (HTTP APIs don't support X-Ray stage tracing — REST-only — so the trace root is the Lambda; `event-sourcing.md` corrected)
- [x] **LLM seam (D37)** — `lambda/api/lib/llm.mjs`: injected provider (`llm.complete({task, system, messages, schema})`), real Claude API in production (structured outputs, key from Secrets Manager), deterministic canned stub in workshop/test; first consumer is the onboarding extraction call
- [x] Async Streams projector + `irl-user-model` store (`docs/projection-store.md`, D36) — dedicated projector Lambda (`lambda/api/projector.mjs` + `projector/`) consumes the `irl-events-log` stream (INSERT-only filter, partial-batch failure reporting, bisect-on-error, SQS DLQ): `OnboardingCompleted` seeds `profile#core` + `interest#`/`strength#`/`barrier#` items (payloads encrypted under the per-user key, `asOf` from `simulatedTime`), `UserDeleted`/`UserKeyShredded` purge to an empty tombstone, shredded users (missing key) skip cleanly. Debrief/reflection deltas and D7 precedence/decay start once a second delta source exists (debrief extraction is unbuilt)
- [x] Event-vocabulary reconciliation with D42 — `UserProfileCreated` is basics-only; `OnboardingCompleted` (via `POST /me/onboarding`) is the sole interview carrier (transcript + Layer-2 extraction, crypto-shredded); deletion appends a `UserKeyShredded` audit event after the physical key destruction; every event record now writes the `bucket` attribute for the `events-by-time-bucket` GSI

### Group 1 — Identity, profile, first contact

Everything needed for a real adult to land on the site, learn what IRL is, agree to terms, sign up, and build a meaningful profile.

- [x] Website / homepage — `src/index.html` is the public landing page (what IRL is, how it works, principles, sign-up/sign-in CTAs, terms link); the old dev persona selector is gone
- [x] User agreement — `src/terms.html` (v1, plain-language: adults-only, conduct, privacy/data rights) + acceptance captured at register; agreement versioning per `docs/event-sourcing.md`: `required_user_agreement_version` in `irl-config` bumped via `POST /admin/agreement-version` (`RequiredAgreementVersionUpdated` on `system#config`), `GET /me` flags `requiresAgreementReacceptance`, state-changing member routes gated (deletion/export exempt — data rights), `POST /me/agreement` emits `UserAgreementReaccepted`, frontend re-acceptance screen in the sign-in flow. Terms text still needs counsel review before launch.
- [x] Public user sign-up flow (Cognito sign-up + email verify → `UserRegistered`)
- [x] Locality verification — manual admin approval implemented (request → verify → activate chain); automated verification (postcard, third-party) still open — design alongside age verification (radar R3)
- [ ] Profile data model — richer than today's name/avatar/vibe; includes interview responses, attributes, preferences
- [x] Profile view + edit — profile screen views/edits name, avatar, vibe (`PUT /me/profile` → `UserProfileUpdated`), plus export/delete/sign-out and the "tell us more" follow-up
- [ ] Optional user attributes — entered if user considers them valuable for matching
- [x] Real Claude API for onboarding interview (replaces scripted flow) — backend: `POST /me/interview/turn` (per-turn interviewer, frozen system prompt + card schema from `docs/onboarding-prompt.md`, real-event grounding, branch-validated with retry + templated fallback) and `POST /me/onboarding` (extraction → `OnboardingCompleted`); frontend: onboarding screen drives the live turn loop (name as form field per D42, scripted flow retained as offline fallback) and completes via createProfile → completeOnboarding. Full screen redesign still planned.
- [x] Account deletion / data export (export decrypts the event log; delete shreds the per-user key)

### Group 2 — Core event experience

Extends the prototype's RSVP→confirm→attend→debrief flow into a full proposed → planned → in-progress → over → cancelled lifecycle, with users able to propose events.

- [x] Full event lifecycle states: proposed, planned, in-progress, over, cancelled (stored states command-driven; in-progress/over time-derived; idea time/place-derived)
- [ ] Event cancellation flow — cancel command exists; what happens to RSVPs/attendee notification still open
- [x] Minimum attendance threshold (auto-plan at `minimumAttendance`)
- [x] User proposes event (`POST /events` → `EventProposed`)
- [ ] Three event types: external/third-party, user-organized, this-user-organized
- [x] Track interest before commitment (`InterestExpressed` distinct from `AttendanceConfirmed`)
- [x] Time/date suggestion handling for proposed events (suggestions: make/vote/adopt/reject/respond; polls: create/vote/close)
- [x] Time/place-less proposals — "Anyone into scrabble?" is a first-class **idea** stage: `POST /events` accepts title-only proposals (times stay a pair when given); `idea` is *derived*, not stored (`lifecycleState` stays `proposed`; missing any of startTime/endTime/location ⇒ idea), so no event-vocabulary change. Ideas are maximally open (suggestions, polls, edits, interest) but interest is the idea-stage currency — confirmation and scheduling 409 until the time/place trio is set via edit (auto-plan therefore can't fire on an idea). Feed/detail render TBD + interest-only affordances
- [x] Overlapping RSVPs — double-confirmation is surfaced, never blocked: confirming over another still-live confirmed event returns a `conflicts` heads-up on the response (interest overlaps deliberately not computed — browsing options is fine), and `GET /events` annotates `conflictsWith` among the caller's confirmed live events at read time so post-hoc edits are caught. Half-open intervals (back-to-back events don't conflict — co-located doubles are legitimate); cancelled events aren't commitments; nothing is ever auto-cancelled — the member decides. Frontend: gentle toast on confirm, standing note on detail, feed badge. Spam-scale double-confirming is contributor-rating input later (Group 4)
- [ ] General event management — edit, cancel, notify attendees
- [ ] Richer event data — images, descriptions, organisers
- [ ] User interaction during event — what happens between confirm and debrief while in-progress
- [ ] "Suggest change" modal — real time/place picker (currently stubbed)

### Group 3 — Matching, preferences, recommendations

Once profiles and events are real, decide who sees what.

- [ ] User preferences for kinds of events
- [ ] User preferences for kinds of people / mark friends or preferred companions
- [ ] Soft de-prioritize others (without blocking) — needs careful design
- [ ] Travel willingness — distance, preferred locations, fine-grained per event type / company
- [ ] Matching/prioritization algorithm — recommendations of people, groups, events
- [ ] Register of event types, operators, venues — safety rating, suitability, positive/negative attributes
- [ ] Real Claude API for event matching + suggestions
- [ ] Structured profile model — extracted from interviews (personality, availability, comfort, social energy)
- [ ] AI updates its understanding from debriefs
- [ ] App-suggested activities based on AI understanding
- [ ] Group formation — surface 3-4 people repeatedly attending together as a "crew"
- [ ] Cold-start: how a new user gets included with no history
- [ ] Balancing group sizes — some events better with 3-4, others 12+
- [ ] Events with preferred people rank higher in feed

### Group 4 — Safety, operations, support

Trust & safety surface, internal admin/support tooling.

- [ ] User blocks other users — distinct from "didn't enjoy meeting"
- [ ] Selective visibility blocking (e.g. ex-spouses) — separate from blocks
- [ ] Reporting mechanism for inappropriate behavior at events
- [ ] Mutual blocks UX — event visibility, attendee counts
- [ ] Internal user contributor rating — trustworthy, positive contributor; private, used for group composition
- [ ] Admin & support UI — system metrics, health, logs/traces, support requests, data management, workshop controls (time, seed, automated activity)
- [ ] User support — support info, request for support, assistant chat, support staff chat; communication design first (radar R4)

### Group 5 — Production economics

- [ ] Billing & plans — paid tiers, payment integration (Stripe?), entitlements, plan-based feature gates. Workshop mode bypasses entirely. Pricing model + sponsorship stance come first (radar R7).

### Group 6 — Deferred

- [ ] Minor user support — under-18 sign-up, parental consent, age-appropriate event filtering, stricter data handling. Deferred until after billing; until then, agreement makes adults-only explicit.

### Group 7 — Polish & enhancements (cross-cutting)

Items that can land alongside any group above once prerequisites exist.

- [ ] Recurring events (weekly coffee walk, monthly book swap)
- [ ] Weather/seasonality awareness for outdoor events
- [ ] Multiple locations beyond Bainbridge Island — per the launch playbook (radar R5)
- [ ] Notifications — push, email digest, in-app only?
- [ ] Calendar integration — export confirmed events
- [ ] Reminders for confirmed meetups
- [ ] Illustrated avatar system (replace emoji picker)
- [ ] Spoken/voice input for interview responses
- [ ] Accessibility audit — ARIA, keyboard nav, screen readers
- [ ] About IRL screen — privacy/how-it-works
- [ ] Review "show up" usage across copy
- [ ] Onboarding for ⋯ menu / alternatives system
- [ ] AI interviewer persona — consistent name/voice
- [ ] Referral / invite flow
- [ ] Shareable link to the app
- [ ] Rethink tab categories based on user feedback
- [ ] Decide if app feedback stays as separate Lambda+S3 or moves into main API
- [ ] User-copy mechanism between production and workshop environments (when those split)
