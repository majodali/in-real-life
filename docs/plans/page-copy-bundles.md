# Page copy in resource bundles

Status: active (**chunk 1 delivered, at its gate** — 2026-10-25: the
design note, T12 and U13, the engine and its tests, and the proof on
the sign-in screen and the landing page's opening block. Plan approved
by the founder the same day.)

Outcome under development: every member-facing string on the site and
in the app lives in a JavaScript resource bundle, not in markup or
screen code — so a reviewer's trial wording is an edit to one file
deployed to a workshop instance, and a later translation is a new
bundle rather than a rewrite.

## Why now

Asked for by the founder (2026-09-18, made next 2026-10-25). Two
reasons, one now and one later:

- **Now — copy review.** The landing page's structure is settled and
  its copy is open for further review (U12, 2026-10-24). Trial wording
  should not mean editing HTML and screen templates; it should mean
  changing values in a bundle, and comparing variants on separate
  workshop instances (OPS11's concurrent instances exist for this).
- **Later — R10 (languages & localization).** The founder's #2
  concern. The bundle shape decides what a translation has to fit
  into, so this is designed as R10's opening move, not as a refactor.

## What exists today (measured 2026-10-25)

- **Static pages.** `src/index.html` (~915 visible words) and
  `src/terms.html` (~865) carry their copy in markup. They must render
  without JavaScript (design-spec §9, G9).
- **App screens.** About 370 interface strings across 30 modules in
  `src/js/screens/` and `src/js/components/` (a heuristic that
  undercounts — strings inside ternaries and interpolations are
  missed), built as HTML template strings. `event-detail.js` alone
  holds ~70.
- **Copy already in modules.** `taglines.js` (44 taglines),
  `data.js` (the scripted interview the app falls back to when the
  live interviewer is unreachable — members see it),
  `cancellation-notices.js`, `agreement.js` (the terms version).
- **Dates** are formatted with the *browser's* locale
  (`toLocaleString(undefined, …)` in `feed.js`, `event-detail.js`), so
  a visitor with a UK browser sees day-first dates on a US product.
- **Plurals** are hand-rolled in two places (`=== 1 ? '' : 's'`),
  which no translation survives.
- **Server text shown raw.** 15 places pass `err.message` straight to
  a toast — Cognito's ("Incorrect username or password.") and the
  API's own English. That text is not ours to bundle without mapping
  error codes to keys.
- **Not ours at all yet.** Sign-up verification emails are Cognito's
  defaults (the stack configures no message), so they are English
  and unbranded whatever the bundles say.
- **Tests that pin wording.** 9 assertions across
  `interaction-handlers.test.mjs` and `debrief-handlers.test.mjs` —
  little churn.

## The shape proposed (written into `docs/page-copy.md`, T12, U13 in chunk 1; confirmed at its gate)

**One bundle per locale and surface, as ES modules.** No build step,
so bundles are plain modules: `src/copy/en-US/landing.js`,
`src/copy/en-US/app.js`, … each exporting keyed strings
(`landing.hero.headline`). `en-US` is the only locale for launch #1
(U11).

**One function, `t(key, params)`** (`src/js/copy.js`), that every
screen calls instead of writing text inline:

- looks the key up in the active chain — *variant → locale* — and
  fails loudly in tests and in workshop if a key is missing, rather
  than shipping a blank;
- fills `{placeholders}` and **escapes them for HTML by default**.
  Screens build HTML strings, and placeholders carry member data
  (first names, event titles), so unescaped interpolation would be an
  injection hole the moment copy moves out of the template;
- handles plurals through `Intl.PluralRules` for the bundle's locale
  (`{ one: '1 confirmed', other: '{n} confirmed' }`), and dates and
  times through `Intl.DateTimeFormat` with the **bundle's** locale,
  not the browser's.

**Whole sentences, never fragments.** "Already signed up? Sign in"
is one string with a marked link (`Already signed up? {link:Sign in}`),
not two pieces glued around an `<a>` — a translator has to be able to
move the link within the sentence. Inline emphasis (the headline's
*in real life*) is handled the same way. This is the decision most
expensive to retrofit, which is why it is made first.

**Static pages are rendered at deploy time.** The landing and terms
pages must not need JavaScript for content, so their copy is applied
by the deploy step that already rewrites them (`inject-config.mjs`),
from the bundle the environment selects. The markup carries keys; a
local preview runs the same renderer. The page a visitor downloads is
plain HTML, as now.

**Variants for review are overlays.** A variant
(`src/copy/variants/<name>.js`) holds only the keys it changes, over
a base locale. Each environment names its variant at deploy — a
workshop instance per variant is the concurrent-instances use case.

**Some keys are locked.** The Terms of Use are versioned
(`agreement.js`); a variant that rewords them without a version bump
would change what members agreed to. Terms keys can't be overridden
by a variant, and translating them needs a governing-language
decision first (R10, R11). Bundled for structure, locked for review.

## Scope of the first pass

| in | out, and why |
|---|---|
| Landing and terms pages | Operator console (`admin.js`) — operator-only, English; revisit when staff exist |
| Every member-facing app screen and component | AI prompts and model-written text (interview, debrief, reflection) — R10's load-bearing language design, not page copy |
| Taglines, the scripted interview fallback (`data.js`), cancellation notices | Generated register views — their source is the registers themselves |
| Toasts and errors, with server error codes mapped to keys (raw server text kept only as a last resort) | Cognito's verification emails — need a custom-message trigger; recorded for R10 |

## Chunks

### Chunk 1 — the design and a proof — DELIVERED (at gate)

Shipped:

- **`docs/page-copy.md`** — the design note; **T12** (the mechanism)
  and **U13** (how copy is governed: whole sentences, every word keyed,
  no dead copy, variants as overlays, Terms locked).
- **`src/js/copy.js`** — the engine: `t()` for HTML, `attr()` for
  attribute values, `text()` for plain text (the third was added while
  building: toasts and `textContent` need plain text, and decoding
  escaped HTML back out is the wrong way round), and `date()`.
  Escaping by default; `{name:inner}` marked spans; plurals and numbers
  by `Intl` in the bundle's locale. 19 tests, including Polish plurals
  and `en-US` vs `en-GB` dates.
- **`src/copy/en-US/`** — the base bundle: `index.js` (locale, the
  `eventStart` date format), `landing.js`, `auth.js`.
- **Bundle integrity tests** (6): surface prefixes, no duplicate keys,
  every message parses, every key the code or markup names exists, no
  unused key.
- **`infrastructure/scripts/render-copy.mjs`** — fills the static
  pages at deploy and serves as the local preview; refuses an element
  that still holds words and stops on an unknown key. 6 tests.
  `inject-config.mjs` runs it on every page it owns.
- **CDK's site upload now excludes `index.html` and `terms.html`**, as
  it already excluded `app.html`. Found while building: once the
  landing page's words are filled at deploy, a deploy that stopped
  after `cdk deploy` — as one did on 2026-10-25 — would otherwise have
  left a landing page with an empty headline live.
- The proof: the sign-in screen's eight strings (one a sentence with
  its link inside it) and the landing page's headline and opening
  paragraph now come from the bundle.

Proven, not assumed:

- **The landing page renders byte-identical** to `main`'s
  `index.html` — same SHA-256, 16,237 bytes — through the deploy-time
  renderer.
- **The sign-in screen's DOM is identical** to `main`'s, rendered in
  Chromium from both. *Correction to this plan's wording:* "byte for
  byte" holds for files; for a screen it is the whitespace-normalized
  DOM, because a template's indentation is whitespace inside a
  JavaScript string, not content (raw 969 vs 939 characters, normalized
  identical). The "Signing in…" state during submit matches too, and
  neither page threw an error.
- **The synthesized site upload** contains no `index.html`,
  `terms.html` or `app.html`, and does contain `copy/en-US/`.

309 frontend tests (284 existing + 19 engine + 6 bundle integrity)
and 859 backend tests (853 + 6 renderer) pass.

Gate: founder reviews the note, T12, U13 and the proof.

### Chunk 2 — the static pages

All landing and terms copy into bundles, the deploy-time renderer in
`inject-config.mjs`, a local preview command, and a test that every
key the markup names exists. Proven by rendering both pages before and
after and comparing them byte for byte, in all four themes.
Gate: founder deploys to workshop; nothing visible changes.

### Chunk 3 — the app screens

Screen by screen into bundles via `t()`, with dates moved to the
bundle's locale, the two hand-rolled plurals replaced, taglines,
`data.js` and cancellation notices brought in, and the 15 raw
`err.message` toasts mapped to keys by error code. Proven by
snapshotting every screen's rendered HTML before and after; any
difference is either a bug or a deliberate fix named in the commit
(the date locale is one).
Gate: founder clicks through the app on workshop.

### Chunk 4 — variants for review

Variant overlays, per-environment selection at deploy, locked keys
enforced by a test, and a workshop-only copy review page (like
`taglines.html`) showing base and variant side by side per key. The
first real review round runs on it. Per-variant instances depend on
the ops plan's concurrent instances (its chunk 1 is at its gate); a
single workshop stack works until then.
Gate: founder runs a review with a variant deployed.

## Not in this plan

- **A second locale.** The structure supports it; choosing, sourcing
  and reviewing a translation is R10's work.
- **Locale selection** (by browser, by member, by community) — R10.
- **Cognito email copy** — recorded for R10, needs its own trigger.
