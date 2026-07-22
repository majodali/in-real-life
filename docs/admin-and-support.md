# Admin Console & Support — Design (proposal)

The Group 4 backlog item ("system metrics, health, logs/traces, support
requests, data management, workshop controls"), untangled. It bundles
two different users with two different needs:

- **The operator** (founder, later staff): running workshops, curating
  registers, verifying members, watching system health. Everything
  here is operating leverage with almost no new product decisions —
  buildable now.
- **The member seeking support**: staff↔member communication — which
  radar R4 says needs its *communication design* first (channels,
  voice, the no-messaging boundary, support-seeking-as-signal). Not
  buildable honestly yet.

**Status: proposal.** Sign-off points: the console's home (in-app,
role-gated), the v1 panel set, seed-now/robots-later, register editing
deferred to the strawman trigger, the support boundary (R4 first), and
the admin data discipline.

## 1. Where the console lives: in-app, role-gated

The existing pattern, kept: an admin area inside the member SPA,
visible only to `custom:role=admin`, with the backend re-verifying the
claim on every route (already true of all `/admin/*`). One API, one
auth system, one deploy — a separate console app buys nothing while
admins number one-or-two and costs a second surface to secure.

**Named trigger for revisiting**: when staff who are *not* full admins
exist (support staff who must never see workshop controls, R4's
outcome), role granularity arrives and a split console becomes worth
its cost. Until then: one role, one area.

## 2. The v1 panels

The existing admin screen (time controls + notify list) grows into
five panels. Everything an admin does remains **event-sourced and
audited** (commands with `actorId: user#<admin>`, same pipeline as all
activity — the workshop-mode discipline, applied everywhere).

### Workshop — facilitation controls (the R5 dependency)

- **Time** (exists): view/advance/set the simulated clock.
- **Seed** (new, the biggest build in the slice): load a canned
  community — personas (register + profile + onboarding via the D37
  stub seam), events (via real propose commands), interactions/
  debriefs — so a workshop room starts *populated* and a facilitator
  can demonstrate feed ranking, debriefs, and "how we understand you"
  with real machinery. `POST /admin/seed` follows the designed
  workshop-mode template exactly: mode-gated route registration (not
  present on production route tables), domain commands, replayable.
  Seed sets are named fixtures (`seed: "workshop-standard"`), not
  ad-hoc uploads — a seed is a curated artifact like a register.
- **Robots — deferred, named**: autonomous scripted members acting on
  a schedule are a bigger design (pacing, believability, workshop
  choreography); the seed's canned personas cover the near-term
  facilitation need. Robots activate with the R5 launch-playbook
  design, where the workshop *process* gets written.

### Members — the verification queue

- **Locality verification queue**: pending requests (requested, not
  yet verified) with the production verify/decline actions — closing
  the loop that workshop mode auto-verifies today. Queue rows show the
  minimum the job needs (name, email, city/postal, requested-at) —
  see §3.
- **Member lookup** (thin): by email → state row basics (registered /
  verified / activated / agreement version) for support conversations.
  Deliberately NOT a model viewer (§3).

### Registers — view now, edit on the strawman trigger

Localities and event types render read-only from their served routes
(`GET /localities`, `GET /event-types`), with the health reads the
curation loop needs as they land (untyped-rate, correction clustering —
future). **Editing stays curation-in-code** per the founder's recorded
posture: the register data store + editor activates when the strawman
"causes real issues or advisor/workshop feedback moves it" — this
console is where that editor will live, and the panel is its slot.

### Health — the self-diagnosing deploy, promoted

The functional suite already knows how to diagnose the system
(`test/helpers/diagnose.mjs`: DLQ depth, error logs, store probes).
v1 promotes the cheap, always-true reads to `GET /admin/health`:

- Projector: DLQ depth (the one number that says "the model store is
  falling behind"), stream age when cheaply available.
- Config sanity: required agreement version, workshop time offset,
  stack stage/mode.
- Store pulse: approximate item counts (DescribeTable) for the core
  tables.

Logs/traces stay in CloudWatch/X-Ray (already structured, D— Group 0
tracing) — the console links out rather than rebuilding a log viewer.
IAM additions (SQS GetQueueAttributes, DescribeTable) ride the CDK
change.

### Policy — what exists, gathered

Agreement version bump (exists), notify list (exists). Event/conduct
enforcement tooling (takedowns, conduct review queues) is **not** this
slice — it belongs with the reporting mechanism and contributor-rating
work (Group 4 proper), where due-process design lives.

## 3. Admin data discipline — what the console may show

The console inherits the system's privacy posture; admin convenience
never overrides it:

- **PII minimalism**: each panel shows exactly what its job needs.
  The verification queue needs identity + locality claim; lookup needs
  state-row basics. Nothing more.
- **Never shown to admins in this console**: member model contents
  (envelope, interests, barriers, outcomes — the member's "How we
  understand you" is THEIRS; backstage review of models is its own
  future construct with its own access design), Layer 3 (affinity,
  crews), contributor rating (access-gated for Group 4's own slice,
  D35 due-process rules), debrief/reflection content.
- **Every admin action is an event** with the admin as actor — the
  audit trail is the log itself, replayable like everything.
- Admin reads are queries, not new stores — nothing aggregates member
  data into admin-side copies.

## 4. Support — the boundary, stated

Member-facing support surfaces (get-help, support requests, assistant
chat, staff chat) wait on **R4's communication design**: channels,
voice (does staff speak the "we"?), the no-messaging boundary, and
support-seeking-as-signal all need deciding before a surface exists.
Until then the feedback form remains the member's door, and this note
deliberately builds none of it. When R4 graduates, its design lands as
its own note; the console gets its staff-side panel then.

## 5. Slice plan (after sign-off)

1. **Health**: `GET /admin/health` (DLQ depth, config sanity, table
   pulse) + CDK IAM; console panel.
2. **Members**: pending-verification listing + production
   verify/decline routes (event-sourced, conditioned like everything);
   thin lookup by email; console panel.
3. **Workshop seed**: named fixture (`workshop-standard`: a handful of
   personas with distinct envelopes/interests, a week of typed/located
   events, a few debriefed pasts so affinities/outcomes exist),
   `POST /admin/seed` (mode-gated registration per workshop-mode.md),
   idempotent per fixture+run, functional-tested on IrlStackTest.
4. **Registers panel**: read-only views over the served routes.
5. **Console shell**: the admin screen reorganized into panels;
   existing time/notify/agreement controls slotted in.
6. **Registers**: decision row, backlog updates, R4/R5 cross-links.

## Open questions (beyond the sign-off points)

- The `workshop-standard` seed's contents — how many personas, what
  spread of envelopes/localities/kinds tells the best workshop story
  (facilitation input wanted; easy to iterate, it's a fixture).
- Whether the health panel should surface the curation-loop reads
  (untyped rate, correction clustering) in v1 or wait for real data.
- Verification decline: silent, or with a reason the member sees?
  (Leans R4 — a decline is a staff→member communication.)
