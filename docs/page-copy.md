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
src/copy/en-US/index.js     the locale, its date formats, the surfaces
src/copy/en-US/site.js      'site.footer.line': 'in·real·life is community-driven…'
src/copy/en-US/landing.js   'landing.hero.headline': "You're invited…"
src/copy/en-US/terms.js     'terms.who.p1': 'in·real·life is for adults…'
src/copy/en-US/auth.js      'auth.signin.title': 'Welcome back'
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
- **The bundle owns the locale.** `index.js` declares `locale` and
  named date formats. The visitor's browser does not decide how a US
  community's dates read — today it does (`toLocaleString(undefined,
  …)`), which chunk 3 corrects.
- **No dead copy.** A test fails if any bundle key is unused, so a
  reviewer is never editing words no page shows.

The **wordmark** (`in·real·life` with its interpuncts) is a mark, not
copy: it stays in markup and is not translated.

## 2. One engine: `src/js/copy.js`

Screens never write text inline; they call one of three functions:

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
and `date` from `src/js/copy.js`, whose default instance reads the
base bundle. The bundles ship with the site (CDK uploads `src/copy/`).

**Server text is not page copy until it has a key.** Fifteen screens
pass `err.message` straight to a toast — Cognito's English ("Incorrect
username or password.") and the API's. Those move to keys by error
code in chunk 3, with the raw text kept only as a last resort.

## 5. Review variants and locked keys (built in chunk 4)

- **A variant is an overlay**: `src/copy/variants/<name>.js` holds only
  the keys it changes, layered over a base locale — the engine's
  lookup chain is already `variant → base`. Each environment names its
  variant at deploy; a workshop instance per variant is the
  concurrent-instances use case (OPS11).
- **Some keys are locked.** The Terms of Use are versioned
  (`agreement.js`): a variant that rewords them without a version bump
  would change what members agreed to. Terms keys cannot be overridden
  by a variant — enforced by test — and translating them needs a
  governing-language decision first (R10, R11).

## 6. Scope of the first pass

In: the landing and terms pages; every member-facing app screen and
component; taglines, the scripted interview fallback (`data.js`) and
cancellation notices; toasts and errors.

Out, each for a reason: the operator console (operator-only, English;
revisit when staff exist); the workshop review tools — the design
switcher's labels (`theme.js`) and the tagline review page
(`taglines.html`) — which no member sees; AI prompts and model-written text (R10's
load-bearing language design, not page copy); the generated register
views (their source is the registers); Cognito's verification emails
(they need a custom-message trigger — recorded for R10).

## 7. What this does not decide

A second locale, how a locale is chosen (browser, member, community),
and how translations are sourced and reviewed are all R10's. This note
only makes sure that when R10 decides, the copy is already in a shape
a translation can fill.
