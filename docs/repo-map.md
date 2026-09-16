# Repo map — where the code lives

The file-by-file orientation that used to sit in `CLAUDE.md`, moved
here at the v1.5.0 migration so the bootstrap stays a pointer rather
than a record (K-001/K-002). Reasoning about *why* the pieces are
shaped this way lives in the design notes (`design-notes.md`); this
note is the map.

## Frontend — `src/`

Plain HTML/CSS/JS, ES modules, no build step. The deploy substitutes
the `__IRL_*__` placeholders into the three pages that carry them.

| Path | What it is |
|---|---|
| `index.html` | Public landing page (what IRL is, principles, sign-up/sign-in) |
| `terms.html` | User agreement, versioned (`event-sourcing.md` → agreement versioning) |
| `app.html` | The app shell: one `<div class="screen">` per screen, plus the runtime config block |
| `taglines.html` | Tagline review page (workshop tool) |
| `css/styles.css` | All styles, including the `data-theme` layers (`ui-themes.md`) |

`src/js/` — app plumbing:

| Module | Role |
|---|---|
| `app.js` | Init, hash routing, screen management |
| `config.js` | Runtime config from the injected `window.__IRL_CONFIG__` |
| `theme.js` | Theme registry + switching (`ui-themes.md`) |
| `api.js`, `auth.js`, `commands.js`, `services.js` | HTTP client, Cognito auth, command wrappers |
| `store.js` | Browser storage wrapper (dev persona flow + offline fallbacks) |
| `data.js` | Mock data for the prototype flows |
| `alternatives.js` | Content-alternative registry behind the ⋯ menus |
| `localities.js`, `taglines.js`, `cancellation-notices.js` | Served-register mirror, tagline picker, cancellation surfacing |
| `components/` | `ellipsis-menu.js`, `feedback-form.js` |

`src/js/screens/` — one module per screen, most with a
`*-handlers.js` sibling holding the logic the screen calls (which is
what the co-located tests exercise): landing/auth (`signup`,
`confirm`, `signin`, `welcome`, `agreement`, `locality`, `location`),
onboarding (`onboarding`, `interview`), events (`feed`,
`feed-sections`, `event-detail`, `event-suggestions`, `event-polls`,
`propose`, `edit`), member (`profile`, `debrief`, `reflection`), and
operator (`admin`, `seed-handlers`).

## Backend — `infrastructure/`

| Path | What it is |
|---|---|
| `bin/app.ts` | CDK entry point; region ambient from credentials |
| `lib/irl-stack.ts` | The stack: tables, Cognito, HTTP API, Lambdas, alarms |
| `lambda/api/index.mjs` | API composition root — wires router, command runner, stores |
| `lambda/api/lib/` | Router, command runner (idempotency, event log, transactional projections), ULID, workshop time, crypto-shred + key store + PII registry, tracing, LLM seam, localities, event types, envelope |
| `lambda/api/{users,events,matching,notify,admin,workshop}/` | Domain handlers and their projections |
| `lambda/api/stream-projector.mjs` + `projector/` | Async user-model projector. **The entry file must not be named `projector.mjs`** — the sibling directory shadows it in the runtime's extensionless resolution (T9) |
| `lambda/feedback/index.mjs` | Feedback Lambda (S3 writer) |
| `scripts/` | `inject-config.mjs` (substitution → dist → S3 sync → register views), `render-registers.mjs` (K-009 views + advisor packs), `seed-events.mjs`, `purge-pii-aggregates.mjs` |
| `test/functional/` | End-to-end tests against the deployed `IrlStackTest`, incl. the replay proof |
| `test/helpers/` | CDK-output config, Cognito auth, cleanup, workshop time, region resolution (T10) |

## Tests, and where each rung runs

| Rung | Command | Covers |
|---|---|---|
| Backend + script units | `npm test` in `infrastructure/` | `lambda/api`, `scripts/`, `test/helpers/` — co-located `*.test.mjs` |
| Frontend units | `node --test js/*.test.mjs js/screens/*.test.mjs` from `src/` | 279 tests over the screen handlers and client modules. **No npm script runs these yet** — Backlog item |
| Functional | `npm run test:functional` in `infrastructure/` | The deployed test stack; needs `AWS_PROFILE` + `AWS_REGION` (see CLAUDE.md) |

## Screens and routes

Hash-routed from `app.html`. Public screens (no active user):
`#location`, `#signup`, `#confirm`, `#signin`, `#welcome`,
`#agreement`, `#onboarding`, `#locality`. Member screens: `#feed`
(Your plans / Suggested for you / More on the calendar — D55),
`#event/:eventId` (detail, confirm, suggestions, polls, debrief entry
point), `#propose`, `#edit/:eventId`, `#profile`, and `#admin` (the
role-gated operator console, D64). The legacy `#detail` and
`#debrief` routes redirect into `#event/:eventId`.

## Browser storage

The API is the source of truth; browser storage holds only the dev
persona flow, offline fallbacks, and personalization.

| Key | Purpose |
|---|---|
| `irl_users`, `irl_active_user` | Dev/prototype persona flow |
| `irl_rsvps`, `irl_confirmations`, `irl_attended`, `irl_debriefs` | Prototype event-lifecycle state (superseded by the API-backed screens) |
| `irl_theme` | Chosen theme (`ui-themes.md`) |
| Auth tokens | `sessionStorage` on workshop stacks (per-tab identity isolation, D64), `localStorage` otherwise |
