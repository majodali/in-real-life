# in·real·life — Mobile Web App

## What This Project Is

A mobile-first web app for a local community meetup platform. Users go through an AI-guided onboarding interview, discover nearby events and people, and coordinate real-world meetups. Privacy-focused: only first names shared, no messaging — just show up.

## Architecture

- **Multi-file static app** — HTML + separate CSS/JS modules in `src/`
- **Static hosting** — S3 + CloudFront (provisioned via CDK), domain `https://in-real.life`
- **Backend (in progress)** — API Gateway + Lambda + DynamoDB + Cognito at `https://api.in-real.life`. Until the backend is wired up, the app runs offline against `localStorage`.
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
  lib/irl-stack.ts            Main CDK stack
  lambda/
    api/index.mjs             API Lambda (router, currently health check only)
    feedback/index.mjs        Feedback Lambda (S3 writer)
```

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
- [x] Backend infrastructure scaffolded (DynamoDB, Cognito, API Lambda, HTTP API at api.in-real.life — declared, not yet deployed)

### Group 0 — Foundations

Architectural decisions that affect everything downstream. Each warrants a short design note before implementation begins.

- [ ] Event sourcing, CQRS, end-to-end tracing — every interaction recorded as an event; downstream views built from the event stream
- [ ] Workshop-mode runtime design — single env runs both production and workshop modes; mode flag gates time manipulation, automated user/event activity, and bypassing production gates (locality, billing). Define seams up front so workshop scaffolding doesn't leak into production paths.

### Group 1 — Identity, profile, first contact

Everything needed for a real adult to land on the site, learn what IRL is, agree to terms, sign up, and build a meaningful profile.

- [ ] Website / homepage — explains what IRL is, links to sign-up
- [ ] User agreement — adults-only for now, terms of use, privacy
- [ ] Public user sign-up flow (replaces invite-only Cognito plan)
- [ ] Locality verification — manual admin approval first, automated later (postcard, third-party). Bypassable in workshop mode.
- [ ] Profile data model — richer than today's name/avatar/vibe; includes interview responses, attributes, preferences
- [ ] Profile view + edit (extend current screen)
- [ ] Optional user attributes — entered if user considers them valuable for matching
- [ ] Real Claude API for onboarding interview (replaces scripted flow)
- [ ] Account deletion / data export

### Group 2 — Core event experience

Extends the prototype's RSVP→confirm→attend→debrief flow into a full proposed → planned → in-progress → over → cancelled lifecycle, with users able to propose events.

- [ ] Full event lifecycle states: proposed, planned, in-progress, over, cancelled
- [ ] Event cancellation flow — what happens to RSVPs when organizer cancels
- [ ] Minimum attendance threshold ("happens if 3+ confirm")
- [ ] User proposes event — pre-existing reference, or ad-hoc
- [ ] Three event types: external/third-party, user-organized, this-user-organized
- [ ] Track interest before commitment — see who's interested before an event becomes confirmed
- [ ] Time/date suggestion handling for proposed events
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
- [ ] User support — support info, request for support, assistant chat, support staff chat

### Group 5 — Production economics

- [ ] Billing & plans — paid tiers, payment integration (Stripe?), entitlements, plan-based feature gates. Workshop mode bypasses entirely.

### Group 6 — Deferred

- [ ] Minor user support — under-18 sign-up, parental consent, age-appropriate event filtering, stricter data handling. Deferred until after billing; until then, agreement makes adults-only explicit.

### Group 7 — Polish & enhancements (cross-cutting)

Items that can land alongside any group above once prerequisites exist.

- [ ] Recurring events (weekly coffee walk, monthly book swap)
- [ ] Weather/seasonality awareness for outdoor events
- [ ] Multiple locations beyond Bainbridge Island
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
