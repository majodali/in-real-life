# Page copy in resource bundles

Status: active (**chunk 3 delivered, at its gate** — 2026-10-25: every
member-facing app screen reads its words from the bundle; server text
is no longer shown; dates read the bundle's way. Chunk 2's gate passed
the same day: the founder deployed to workshop and found the landing
and terms pages identical to before. Chunk 1's gate passed the same
day. Plan approved 2026-10-25.)

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

### Chunk 1 — the design and a proof — DELIVERED (gate passed 2026-10-25)

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

### Chunk 2 — the static pages — DELIVERED (gate passed 2026-10-25)

As planned: all landing and terms copy into bundles. The renderer, the
preview command and the key-exists test, which this chunk listed,
already shipped in chunk 1.

Shipped:

- **`src/copy/en-US/site.js`** (8 keys) — the skip link, header and
  footer both public pages share, so each is written once.
- **`landing.js`** grows to 92 keys and **`terms.js`** holds 58, in
  page order. Every word of both pages is in the bundle, including the
  `<title>`, the meta description, the `aria-label`s and the no-script
  tagline. The only words left in the markup are the wordmark's
  (a mark, U13).
- **The renderer fills attributes** (`data-copy-content`,
  `data-copy-aria-label`) and takes **page params**: the terms
  version and date come from `agreement.js` at deploy, so the page's
  script that filled them is gone; `{mail:…}` makes the contact link.
  The engine gains a default `{b:…}` wrapper (the "Instead:" lines and
  hosts' names).
- **`terms.js` carries the lock in its header**: change a word, bump
  `agreement.js`. The test that enforces it is chunk 4's.
- **Tests:** 6 more renderer tests (attributes, apostrophes, params,
  the real terms page, and a test that fails on any word or label left
  in either page's markup). 309 frontend and 865 backend tests pass.

Proven, not assumed — main's pages against the branch's rendered ones,
served over HTTP in Chromium, in all four themes at 390px and 1440px
(16 pairs):

- **The landing page renders byte-identical** to `main`'s, apart from
  the four comment lines added to say where its words live. The DOM,
  the visible text, the title, the meta description, every
  `aria-label` and every pixel match in all 8 views.
- **The terms page is not byte-identical, and should not be.** Its
  hand-wrapped paragraphs become single lines, `&mdash;` becomes the
  character, and the version line is plain text instead of two
  `<span>`s filled by script. Visible text, title and labels match in
  all 8 views. The DOM matches once `main`'s two spans are unwrapped.
  Pixels match everywhere except the version line itself, where
  shaping the text as one run instead of three moves it by 0.016px
  (250.375 → 250.359px wide; indistinguishable at 3× zoom).
- No page errors on either side.

Not done here, and why: `<html lang="en">` stays until a second locale
(R10); the terms date `14 May 2026` is day-first and moves to a
bundle-formatted date with the app's dates in chunk 3 (U11).

Gate: founder deploys to workshop; nothing visible changes.

### Chunk 3 — the app screens — DELIVERED (at gate)

As planned, with two corrections to this plan's wording: there were
33 raw `err.message` sites, not 15; and the second hand-rolled plural
is in the operator console, which is out of scope.

Shipped:

- **Every member-facing screen and component** reads its words from
  the bundle: sign-up and sign-in, the postal-code gate, locality,
  welcome, terms re-acceptance, onboarding and the interview, the
  feed, the event screen with its suggestions, polls, debrief and
  reflection, propose, edit, the profile with "How we understand you",
  and the ⋯ menu with its feedback form. The bundle now has 15
  surfaces and 795 keys.
- **Module copy** moved too: the taglines (44, each attribution its
  own key), the scripted interview questions (`data.js`), the
  cancellation notices, the locality distance words, and the design
  alternatives' labels. Code names keys as whole literals; where it
  holds an id (a state, a chip, a door) a small map gives the key.
- **Server text is never shown** (`src/js/errors.js`, note §4). This
  departs from the plan's "raw text as a last resort": the last resort
  is the screen's own line. A test holds the API patterns to the
  backend's source.
- **Dates** use the bundle's locale and named formats. The terms date
  is ISO in `agreement.js` and reads "May 14, 2026" in-app and on the
  terms page (it read "14 May 2026", day-first, against U11).
- **Plurals**: poll votes, "and N more" in two notices, and the event
  counts go through plural forms.
- **US spelling** in `data.js`: "neighborhood", "organize" (U11).
- **The landing page** loads only the taglines surface through the
  bundle-free engine (`copy-engine.js`): 127 KB raw before fonts
  against 115 KB on `main`, not the 184 KB that loading the whole app
  bundle cost on the first attempt.
- **Service worker cache bumped** to `irl-shell-v2` (`src/sw.js`). It
  serves JavaScript from cache first, so after this deploy a cached old
  bundle could meet new screen code and show missing-key text. The new
  worker deletes the old cache. That shortens the window to one load
  but does not close it; the general gap is a new backlog item.
- **Tests**: `errors.test.mjs` (7), the key scan now finds every
  key-shaped literal, five handler tests updated from "shows the
  server's text" to "shows the screen's line". 316 frontend and 865
  backend tests pass.

Proven, not assumed — a snapshot harness (129 screen states, 199
captures: every route, every load/empty/error state, every toast and
dialog, the debrief and reflection flows step by step) driven against
fixtures, on `main`-equivalent code and on this branch, en-US, Pacific
time, fixed clock:

- **163 captures are identical**: rendered text, structure and
  attributes.
- **36 differ, every one deliberate**: 29 error states now read a
  keyed line instead of the server's or the browser's text ("internal
  server error" → "Could not cancel.", "Failed to fetch" → "Can't reach
  in·real·life right now…"); 2 show the agreement date as "May 14,
  2026"; 4 carry `data-chip="interests"` instead of the English title
  in an attribute (invisible — the remove buttons no longer find their
  list by its label); 1 shows the US spelling in "Tell us more".
- **With an en-GB browser**, an event's time read "Mon, 26 Oct, 9:00 —
  11:00" before and reads "Mon, Oct 26, 9:00 AM — 11:00 AM" now.

Open, for the founder: the bundle spells "cancelled" (and the
lifecycle state is `cancelled` in code). US usage accepts both; AP and
Merriam-Webster prefer "canceled". Not changed without a decision.

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
