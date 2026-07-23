# UX Register (U)

UX, copy, and visual-design decisions — one register while volume is
low (`registers-and-feedback.md` §1; split only if it forces us).
**Record on contact**: a row is written the first time a call is
made, revised, or touched by feedback — never by retrospective mining.
Rows are revised in place with a dated note; ids are never reused.

Seed rows below set the shape and bar: one line of *what*, one of
*why*, a pointer to where it lives. If the reasoning needs more than
that, it belongs in a design note and the row points there.

| # | Decision | Why | Lives in |
|---|---|---|---|
| U1 | The debrief people step is positive-first; avoidance sits behind a tucked-away ⋯ affordance with capture-time honesty copy | The main flow stays warm; a deliberate act should take a deliberate reach, and never look like a rating (D49/D61) | `event-detail.js`, `matching.md` → Avoidance |
| U2 | The feed is three plain sections (Your plans / Suggested for you / More on the calendar); ordering is the only ranking signal that reaches the screen | Scores shown become scores gamed — and scores felt (D55; backstage-and-legible) | `feed-sections.js`, `matching-spec.md` |
| U3 | Onboarding is one question per card, conversational, skippable — never a form | The interview is the first impression of the voice; forms extract, conversations welcome (D15/D42) | `onboarding.js`, `onboarding-interview.md` |
| U4 | Locality effort renders as words ("an easy hop away"), never distances, minutes, or maps | Effort is the honest unit (D62); numbers imply a precision the bands don't claim | `localities.js` |
| U5 | The organizer's kind picker is a plain select with untyped as a first-class choice; no suggested-type nudging in the picker | The organizer's word is authoritative (D63); a nudge in the picker would re-derive over it socially even where the code doesn't | `edit.js` |
| U6 | The operator console is panels on one in-app screen, not a separate admin app | One surface to secure while admins number one-or-two; the split trigger is named (D64) | `admin.js`, `admin-and-support.md` |
| U7 | Visual identity: earthy palette (--earth/--moss/--sage/--mist/--cream/--warm/--amber/--rust), Playfair Display headings, DM Sans body, phone-shaped single column | Warm and grounded, not app-slick; the product should feel like the evenings it leads to | `styles.css`, `CLAUDE.md` → Design |
| U8 | "Open as" opens a new tab per persona rather than switching identity in place | A facilitator's mental model is one-tab-one-person; in-place switching invites acting as the wrong member (D64 per-tab isolation) | `admin.js`, `seed-handlers.js` |
