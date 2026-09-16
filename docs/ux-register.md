# UX Register (U)

UX, copy, and visual-design decisions — one register while volume is
low (`registers-and-feedback.md` §1; split only if it forces us).
**Record on contact**: a row is written the first time a call is
made, revised, or touched by feedback — never by retrospective mining.
Ids are never reused.

**Status and supersession** (U10, `design-spec.md` §7 — the
D-register's K-004 discipline applied to design). Every row carries a
status: `accepted` · `superseded by U<n>, because …` · `deprecated`.
A small revision stays a dated note in the row. A decision that
**reverses** an earlier one is a **new row that supersedes it**,
never a silent edit — the register keeps what we used to think and
why we stopped. A major change (contradicts a stated goal, changes
the identity, or changes what a surface is for) re-enters at analysis
rather than being edited in.

Seed rows below set the shape and bar: one line of *what*, one of
*why*, a pointer to where it lives. If the reasoning needs more than
that, it belongs in a design note and the row points there.

| # | Decision | Why | Status | Lives in |
|---|---|---|---|---|
| U1 | The debrief people step is positive-first; avoidance sits behind a tucked-away ⋯ affordance with capture-time honesty copy | The main flow stays warm; a deliberate act should take a deliberate reach, and never look like a rating (D49/D61) | accepted | `event-detail.js`, `matching.md` → Avoidance |
| U2 | The feed is three plain sections (Your plans / Suggested for you / More on the calendar); ordering is the only ranking signal that reaches the screen | Scores shown become scores gamed — and scores felt (D55; backstage-and-legible) | accepted | `feed-sections.js`, `matching-spec.md` |
| U3 | Onboarding is one question per card, conversational, skippable — never a form | The interview is the first impression of the voice; forms extract, conversations welcome (D15/D42) | accepted | `onboarding.js`, `onboarding-interview.md` |
| U4 | Locality effort renders as words ("an easy hop away"), never distances, minutes, or maps | Effort is the honest unit (D62); numbers imply a precision the bands don't claim | accepted | `localities.js` |
| U5 | The organizer's kind picker is a plain select with untyped as a first-class choice; no suggested-type nudging in the picker | The organizer's word is authoritative (D63); a nudge in the picker would re-derive over it socially even where the code doesn't | accepted | `edit.js` |
| U6 | The operator console is panels on one in-app screen, not a separate admin app | One surface to secure while admins number one-or-two; the split trigger is named (D64) | accepted | `admin.js`, `admin-and-support.md` |
| U7 | Visual identity: earthy palette (--earth/--moss/--sage/--mist/--cream/--warm/--amber/--rust), Playfair Display headings, DM Sans body, phone-shaped single column *(2026-08-25: tokens evolved by U9 — Morning Linen refines the same identity; the original token values live on as the Grove theme)* | Warm and grounded, not app-slick; the product should feel like the evenings it leads to | accepted | `styles.css`, `CLAUDE.md` → Design |
| U8 | "Open as" opens a new tab per persona rather than switching identity in place | A facilitator's mental model is one-tab-one-person; in-place switching invites acting as the wrong member (D64 per-tab isolation) | accepted | `admin.js`, `seed-handlers.js` |
| U9 | **Morning Linen is the app's identity** — chosen from the July 2026 exploration's four directions, reviewed as runtime themes: light hero header, linen surfaces, one elevation recipe, amber as the single warm note, moss for commitment, pill actions. The original identity is named **Grove** and retained in the workshop switcher; **Lantern** is reserved as the future member-selectable dark theme (backlog); Pebble stays a review theme (the rebrand question is closed for now). Workshop stacks keep the theme switcher (`?theme=` links) as the standing design-review vehicle; production always renders the default | The exploration's own recommendation held up in live comparison: A keeps everything the community already recognizes while fixing the craft gap; a rebrand (D) wasn't warranted | accepted | `docs/ui-themes.md`, `theme.js`, `styles.css` → Themes |
| U10 | **Design runs under the technical discipline** — analysis before decision (a design note per designed area), comparative review before drawing, **directions not iterations**, each judged per goal in writing *before* preference is voiced, calls recorded as U-rows, traceability goal → row → note → implementation. Rows now carry a status and reverse by **supersession**, never silent edit; a major change re-enters at analysis. Feedback lands via D66 (changed / stands / routed) | Design was decided as carefully as the code but recorded more loosely: rows revised in place erase what we used to think, which is exactly what a register exists to keep. Founder's call, 2026-09-03 | accepted | `design-spec.md` §7, this register's header |
