# Page copy — bundles, keys and how words reach a page

**Decided: T12** (the mechanism), **U13** (how copy is governed).
Plan: `plans/page-copy-bundles.md`. Relates to **R10** (languages &
localization), of which this is the opening move, and **U11** (US
spelling — the base bundle is `en-US`).

Every member-facing word lives in a bundle under `src/copy/<locale>/`,
not in markup or screen code. A reviewer's trial wording is then an
edit to one file deployed to a workshop instance, and a translation is
a new bundle rather than a rewrite. This note records how that works
and why each choice was made, so the parts that are expensive to
change later are changed now or not at all.

## 1. Bundles

**Plain ES modules, one per surface per locale.** No build step (T2),
so a bundle is a module exporting keyed strings:

```
src/copy/en-US/index.js     the surfaces, merged into one base bundle
src/copy/en-US/locale.js    the locale and its named date formats
src/copy/en-US/site.js      'site.footer.line': 'in·real·life is community-driven…'
src/copy/en-US/landing.js   'landing.hero.headline': "You're invited…"
src/copy/en-US/terms.js     'terms.who.p1': 'in·real·life is for adults…'
src/copy/en-US/taglines.js  'taglines.onlyConnect': 'Only connect.'
src/copy/en-US/common.js    'common.back': '← Back' — words several screens share
src/copy/en-US/errors.js    'errors.network': "Can't reach in·real·life right now…"
src/copy/en-US/auth.js      'auth.signin.title': 'Welcome back'
…                           interview, onboarding, feed, event, propose,
                            edit, profile, menu — one per screen family
```

- **Keys are flat and prefixed with their surface** (`landing.*`,
  `auth.*`): a key says where it is used, files never collide, and a
  variant or a lock (§5) can name a whole surface by prefix. Tests
  enforce the prefix and that no key is defined twice.
- **Shared words have one key.** The public pages' skip link, header
  and footer are the `site` surface, so the footer line is written
  once. Within a page, the same words in two places share a key when
  they are the same thing (the two calls to action); words that merely
  match in English do not ("Example week" is both a menu link and the
  calendar's label — two keys, because a translation may need two
  words).
- **The bundle owns the locale.** `locale.js` declares `locale` and
  named date formats (`eventStart`, `eventTime`, `editedAt`,
  `agreementDate`). The visitor's browser does not decide how a US
  community's dates read: before chunk 3 it did (`toLocaleString(undefined,
  …)`), so a UK browser showed "Mon, 26 Oct, 9:00"; it now shows "Mon,
  Oct 26, 9:00 AM" like everyone else.
- **No dead copy.** A test fails if any bundle key is unused, so a
  reviewer is never editing words no page shows.
- **Keys are written out, never assembled.** Code names a key as a
  whole literal — `t('event.fact.when')`, or a map such as `{ idea:
  'common.state.idea' }` — never as `` `common.state.${id}` ``. That is
  what lets the tests find every key in use and every key that is
  missing, and lets a reviewer search for a key and find where it shows.
  Where code holds an id (a lifecycle state, a debrief chip), a small
  map from id to key sits beside it.

The **wordmark** (`in·real·life` with its interpuncts) is a mark, not
copy: it stays in markup and is not translated.

## 2. One engine: `src/js/copy-engine.js`

Screens never write text inline; they call one of three functions
from `src/js/copy.js`, the app's instance of the engine:

| | returns | for |
|---|---|---|
| `t(key, params)` | HTML-safe text | element content in a template |
| `attr(key, params)` | text safe inside `"…"` | `placeholder`, `aria-label`, `title` |
| `text(key, params)` | plain text | `textContent`, toasts — never `innerHTML` |

plus `date(value, formatName)` for dates and times in the bundle's
locale.

**Escaping is the default, for copy and params alike.** Screens build
HTML strings, and params carry member data — first names, event
titles. Once text moves out of the template, an unescaped
interpolation is an injection hole, so the engine escapes every value
and every piece of copy text. Markup can only enter through a marked
span (below), whose wrapper is code, never copy.

### Message syntax — deliberately small

| | | |
|---|---|---|
| `{name}` | a value | escaped; numbers formatted for the locale (`1,200` / `1.200`) |
| `{name:inner}` | a marked span — a link, emphasis | the caller supplies a function that wraps the (escaped) inner text; `b`, `em` and `strong` have defaults |
| `{name}` given a function | a value with markup around it | for a value shown in bold or similar (`We sent a 6-digit code to {email}`); the function is code and escapes the value itself |
| `{{` `}}` | literal braces | |
| `{ '=0': …, one: …, other: … }` | a plural | the form is chosen by `Intl.PluralRules` for the bundle's locale from `params.count`; exact `=n` forms win |

**Whole sentences, never fragments.** This is the decision most
expensive to retrofit. "New to in·real·life? Create an account" is one
string with the link marked inside it —

```js
'auth.signin.newHere': 'New to in·real·life? {link:Create an account}'
t('auth.signin.newHere', { link: (inner) => `<a href="#signup" class="auth-link">${inner}</a>` })
```

— not two strings glued around an `<a>`. Word order differs between
languages; a translator has to be able to move the link, and can only
move what is inside the sentence. The landing headline's *in real
life.* is handled the same way (`{em:in real life.}`).

**Plurals are the locale's, not English's.** The two hand-rolled
plurals in the app (`=== 1 ? '' : 's'`) work only in English; Polish,
for one, has three forms. The engine's tests prove the Polish case.

### When a key is missing

A missing key is a bug, and the response depends on who would see it:

- **in tests and on workshop stacks** it throws — fail loudly, at once;
- **on production** it shows the key itself and logs it — a member is
  better served by an odd label than by a blank or a crashed screen.

A test checks that every key named in code (`t('…')`, `attr('…')`,
`text('…')`) or markup (`data-copy="…"`) exists, so the production
fallback should never be seen.

## 3. Static pages: filled at deploy

The landing and terms pages must read **without JavaScript**
(design-spec §9), so their words are put into the HTML before it
ships, not by script in the browser. In the source an element names
its key and is empty:

```html
<h1 id="h1" data-copy="landing.hero.headline"></h1>
```

An attribute's words are named by prefixing the attribute —
`<meta name="description" data-copy-content="landing.meta.description">`,
`<nav data-copy-aria-label="landing.nav.label">`. The page title is an
element like any other (`<title data-copy="landing.meta.title">`).

`infrastructure/scripts/render-copy.mjs` fills both through the same
engine and removes the markers. `inject-config.mjs` runs it on every
deploy, so the shipped page is plain HTML with no trace of the
mechanism. The renderer refuses an element that still has words in
the source — two copies of the same words, one of which would drift —
and stops the deploy on an unknown key. A test reads both pages and
fails on any word or label left in the markup outside the wordmark.

**Values the code owns are page params.** The terms page shows the
version a member accepts; the renderer takes it from `agreement.js`
(`{termsVersion}`, `{termsUpdated}`), so the page and the version sent
at sign-up cannot disagree, and the page no longer fills it with
script. The params also carry the wrappers static copy needs beyond
the defaults: `{mail:hello@in-real.life}` becomes a `mailto:` link.

**Attribute values keep their apostrophes.** The renderer writes the
quotes itself, always double, so it escapes `"` but not `'`; the
engine's `attr()` escapes both, because a screen's template might quote
either way.

**`cdk deploy` no longer uploads these pages.** CDK's site upload
(`irl-stack.ts` → `DeploySite`) already excluded `app.html` because
`inject-config.mjs` owns it; `index.html` and `terms.html` now join
it. Otherwise a deploy that stopped after `cdk deploy` — as one did on
2026-10-25 — would leave a landing page with an empty headline live.

**Local preview** renders a gitignored copy:
`node infrastructure/scripts/render-copy.mjs src/index.html --out src/index.local.html`
(or `src/terms.html`).

**Not yet:** `<html lang="en">` stays as written. It should follow the
bundle's locale once a second one exists (R10). The terms page's date,
`14 May 2026`, is day-first — a string in `agreement.js`, also shown in
the app; chunk 3 moves it to a date formatted by the bundle (U11).

## 4. App screens: at runtime

The app is JavaScript already, so screens import `t`, `attr`, `text`
and `date` from `src/js/copy.js`, whose instance reads the whole base
bundle. The engine itself is `src/js/copy-engine.js`, with no bundle
attached, so a page that needs one surface loads only that: the
landing page picks its tagline from `taglines.js` alone (+12 KB raw on
that page, not the whole app's copy — design-spec §9). The bundles
ship with the site (CDK uploads `src/copy/`).

**Server text is never shown.** Before chunk 3, 33 places
passed `err.message` to a toast or a status line: Cognito's English,
the browser's ("Failed to fetch"), and the API's, which is written for
developers ("internal server error", "event is over; can no longer
change interest"). None of it can be translated or reviewed.
`src/js/errors.js` now decides what a member reads:

1. no response at all → `errors.network`;
2. a Cognito error code it knows → that code's key;
3. an API error a member can actually meet — a stale screen, a full
   event, a closed poll — matched on status and wording → its key;
4. anything else → the screen's own line ("Could not cancel.").

The plan said the raw text would stay "as a last resort"; it does not.
The screen's own line is the last resort, because it says what failed
in words we can review. Matching on wording is brittle, so a test
reads the backend's source and fails if a pattern stops matching a
message the backend sends with that status. Where Cognito's own words
were fine ("Incorrect username or password."), the bundle keeps them.

**Plurals and counts.** Every count a member reads goes through a
plural form — poll votes, "and 2 more", the event's interested and
confirmed counts — so a translation can supply its own forms. The one
hand-rolled plural left is in the operator console (out of scope).

## 5. Review variants and locked keys

**A variant is an overlay**: `src/copy/variants/<name>.js` holds only
the keys it rewords, plus an `about` (title, who, date, what it tries).
It is registered in `src/copy/variants/index.js`. The engine's lookup
chain is `variant → base`, so every key the variant leaves alone reads
as the base.

```js
export const about = { title: 'A plainer invitation', by: 'Ana', date: '2026-11-02', note: 'Tries…' };
export default {
  'landing.hero.headline': 'Meet the people who live near you, {em:in real life.}',
  'landing.cta.accept': 'Join in',
};
```

**A workshop deploy names its variant**, in one command from the ops
repo:

```bash
./bin/irl-ops deploy workshop --copy-variant <name>
```

which runs `cdk deploy` and then this repo's
`node infrastructure/scripts/inject-config.mjs <stack> --copy-variant <name>`
(also usable on its own after a plain deploy). `irl-ops` refuses a
variant on production, on an env without a site, and for a name that
is not a variant file, before anything deploys. The static pages are filled with the variant over the base, and the
deploy ships its own `copy/active.js` re-exporting the variant, which
the app's screens and the landing page's taglines layer over the base.
Without the flag the stack serves the base. A production stack refuses
the flag: variants are for review rounds. A workshop instance per
variant, side by side, is the concurrent-instances use case (OPS11);
one workshop stack works by redeploying with another name.

**The review page**, `copy-review.html` on a workshop stack, lists the
registered variants and, for the one chosen (the deployed one first),
every key it rewords: the base wording, the variant's, and the words
that changed. Production never carries it.

**A variant that would break a page never ships.** The same checks run
in the tests and again at deploy
(`infrastructure/scripts/copy-variants.mjs`):

- every key it rewords exists in the base — no typos, no words a page
  never shows;
- it keeps each message's form (plain or plural, with an "other"
  form), and uses only the values and marked spans its base uses: the
  screen supplies those, so a new one would have nothing to fill it.
  Dropping one is allowed — "Join in" needs no `{name}`;
- every message parses;
- **no key is locked.** The Terms of Use are versioned
  (`agreement.js`): a variant that rewords them would change what
  members agreed to without a new version. `terms.*` is locked, and
  translating it needs a governing-language decision first (R10, R11).

Check a variant before deploying it:
`node infrastructure/scripts/copy-variants.mjs <name>`.

Switching variants takes effect on the next page load: code is always
fetched fresh (T11), so a new variant never mixes with the old one.

## 6. Scope of the first pass

In: the landing and terms pages; every member-facing app screen and
component; taglines, the scripted interview fallback (`data.js`) and
cancellation notices; toasts and errors.

Out, each for a reason: the operator console (operator-only, English;
revisit when staff exist); the workshop review tools — the design
switcher's labels (`theme.js`) and the tagline review page
(`taglines.html`) — which no member sees; AI prompts and model-written
text (R10's load-bearing language design, not page copy); the
generated register views (their source is the registers); Cognito's
verification emails (they need a custom-message trigger — recorded
for R10); and community data — the place names the server sends, the
event-type names, and the locality screen's starting values
("Bainbridge Island", "US"), which belong to the community, not the
locale (R5).

## 7. What this does not decide

A second locale, how a locale is chosen (browser, member, community),
and how translations are sourced and reviewed are all R10's. This note
only makes sure that when R10 decides, the copy is already in a shape
a translation can fill.

Two things it leaves visibly open:

- **Time zone.** Dates read the bundle's way but in the reader's own
  time zone. A member on the island never notices; a visitor
  elsewhere sees a 9 am walk at their local hour. The community's time
  zone is community data (R5), so it is not set here.
- **Which locale a page loads.** `copy.js` and `taglines.js` import
  `en-US` by path; a deploy chooses only the variant layered over it.
  Choosing among locales is R10's.
