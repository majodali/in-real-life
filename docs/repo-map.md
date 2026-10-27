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
| `index.html` | Public landing page — Direction D (U12): notice bar, invitation, at-a-glance card, example week of ideas, principles, sign-up/sign-in. Styles: `css/styles.css` → Public pages (`html.lp`, `lp-` classes) |
| `terms.html` | User agreement, versioned (`event-sourcing.md` → agreement versioning); shares the landing's public-page components |
| `app.html` | The app shell: one `<div class="screen">` per screen, plus the runtime config block |
| `taglines.html` | Tagline review page (workshop tool) |
| `copy-review.html` | Copy review page: each variant's reworded keys beside the base (workshop stacks only; `page-copy.md` §5) |
| `copy/variants/` | Review variants: overlays of only the keys they reword, registered in `index.js` (`page-copy.md` §5) |
| `copy/active.js` | The variant this deploy layers over the base; committed as none, written by `inject-config.mjs --copy-variant` |
| `copy/<locale>/` | Member-facing copy bundles (`page-copy.md`, T12): `locale.js` declares the locale and date formats; `index.js` merges one file per surface into the base bundle — `site.js` (the public pages' shared header and footer), `landing.js`, `terms.js`, `taglines.js`, `common.js` (words several screens share), `errors.js`, then one per screen family (`auth.js`, `interview.js`, `onboarding.js`, `feed.js`, `event.js`, `propose.js`, `edit.js`, `profile.js`, `menu.js`); keys prefixed with the surface |
| `css/styles.css` | All styles: base (phone), the `data-theme` layers (`ui-themes.md`), and the responsive layer at the end (`design-spec.md` §4) |
| `manifest.json` | Web app manifest — installability (`design-spec.md` §5) |
| `sw.js` | Service worker: app shell only, never API responses; pages and code network-first, the cache only offline (T11) |
| `icons/` | App icons: 192, 512, 512-maskable, apple-touch (placeholders) |

`src/js/` — app plumbing:

| Module | Role |
|---|---|
| `app.js` | Init, hash routing, screen management |
| `config.js` | Runtime config from the injected `window.__IRL_CONFIG__` |
| `copy-engine.js` | The copy engine, no bundle attached: message syntax, escaping, plurals, dates (`page-copy.md`) |
| `copy.js` | The app's instance of the engine over the whole base bundle: `t()` / `attr()` / `text()` / `date()` |
| `errors.js` | What a member reads when something fails: Cognito codes and known API errors to keys, else the screen's own line (`page-copy.md` §4) |
| `lifecycle-labels.js` | An event's lifecycle state in members' words, shared by the feed and the event screen |
| `theme.js` | Theme registry + switching (`ui-themes.md`) |
| `pwa.js` | Service-worker registration + `isInstalled()`; never prompts |
| `api.js`, `auth.js`, `commands.js`, `services.js` | HTTP client, Cognito auth, command wrappers |
| `store.js` | Browser storage wrapper (dev persona flow + offline fallbacks) |
| `data.js` | The scripted interview questions (the welcome fallback and "Tell us more") and the avatar palette; the question text is in the bundle |
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
| `scripts/` | `inject-config.mjs` (copy + substitution → dist → S3 sync → register views), `render-copy.mjs` (fills the static pages' copy; also the local preview), `copy-variants.mjs` (checks review variants; `--copy-variant` deploys one), `deploy-step.mjs` (runs the upload and invalidation; a failure stops the deploy, naming where), `render-registers.mjs` (K-009 views + advisor packs), `seed-events.mjs`, `purge-pii-aggregates.mjs` |
| `test/functional/` | End-to-end tests against the deployed `IrlStackTest`, incl. the replay proof |
| `test/helpers/` | CDK-output config, Cognito auth, cleanup, workshop time, region resolution (T10) |

## Tests, and where each rung runs

| Rung | Command | Covers |
|---|---|---|
| Backend + script units | `npm test` in `infrastructure/` | `lambda/api`, `scripts/`, `test/helpers/` — co-located `*.test.mjs` |
| Frontend units | `npm test` in `src/` (CI runs the same) | Every `src/js/**/*.test.mjs`: the screen handlers, the client modules, the copy engine and bundles, the error mapping, the service worker |
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
