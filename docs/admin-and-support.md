# Admin Console & Support — Design (decided: D64)

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

**Status: decided** (2026-07-22, D64) after two founder-review rounds
(seed selectivity → personas-load-whole/events-select with symbolic
locality slots; persona control; declines and dashboards deferred).
**Implementation landed in two slices** (both shipped): the console
shell — health, members, registers, policy panels + per-tab identity
isolation — first; then the workshop **seed catalog + "open as"**
(`workshop/seed-fixture.mjs` + `workshop/seed.mjs`). The catalog's
CONTENTS remain a strawman for facilitation-driven correction — the
same posture as the locality and event-type registers. One
implementation decision worth recording: **seed idempotency is
generation-salted** — `WorkshopSeedConfigured` pins the slot bindings
plus a generation id, and every seed commandId carries that generation,
so a torn-down stack re-seeds cleanly past still-cached command
records while overlapping calls within a generation still converge at
the idempotency table.

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
- **Seed** (new, the biggest build in the slice): load canned
  community members and events — personas (register + profile +
  onboarding via the D37 stub seam), events (real propose commands),
  interactions/debriefs — so a workshop room starts *populated* and a
  facilitator can demonstrate feed ranking, debriefs, and "how we
  understand you" with real machinery.

  **Personas load whole; events are the selection unit** (decided at
  review, second pass — and it works because the privacy design
  already paid for it): workshop members see no evidence of other
  users except through events they interact with (no directory, no
  member browsing — rosters are the only exposure surface). So all
  ~50 catalog personas seed **once at workshop setup**, invisible
  until used, and the facilitator's live control is **which events to
  add** — each catalog event carrying its **pre-set roster** (which
  personas are interested/confirmed, and for past events, canned
  debriefs so affinities and outcome rows exist). All-personas-upfront
  also makes canned rosters structurally valid: an event can never
  reference an unseeded persona. `POST /admin/seed` is two-phase —
  `{personas: true, localityBindings}` once, then `{events: [ids]}`
  additively — idempotent per entity, mode-gated per the workshop-mode
  template, everything through real commands.

  **Localities are symbolic in the fixture** (decided at review):
  catalog entries reference **slots** — `A` (the workshop's home),
  `B` (a neighbor), `C` (a crossing/far) — and persona-seeding binds
  slots to real register localities in one hit
  (`localityBindings: { A: 'bainbridge-island', B: 'poulsbo', C:
  'seattle' }`, defaulting to the community home + its nearest
  edges). Running the same workshop in a different community is a
  different binding, never a fixture edit.

  Named scenarios, restated in the new shape: **initial adopters** =
  personas loaded, zero events added (the room IS the community —
  nothing on the calendar betrays the catalog's existence);
  **neighboring community** = bind `A` to the neighbor and add its
  events; targeted scenario adds = pick the one canned event whose
  roster tells the story.
- **Persona control** (decided at review — facilitators must drive
  seeded personas, not just watch them): two pieces. (a) **Per-tab
  identity isolation on workshop stacks**: auth tokens live in
  sessionStorage rather than localStorage in workshop mode, so each
  browser tab holds its own signed-in persona — a facilitator runs
  Priya, Tom, and themselves side-by-side without juggling private
  windows (which remain the zero-code fallback). (b) The Workshop
  panel lists seeded personas with an **"open as"** affordance — new
  tab onto sign-in with the persona's fixture credentials
  (workshop-only accounts; the fixture is public test data by
  construction, never real member credentials).
- **Robots — deferred, named**: autonomous scripted members acting on
  a schedule are a bigger design (pacing, believability, workshop
  choreography); selectively-seeded, facilitator-driven personas cover
  the near-term need. Robots activate with the R5 launch-playbook
  design, where the workshop *process* gets written.

### Members — the verification queue

- **Locality verification queue**: pending requests (requested, not
  yet verified) with the production **verify** action — closing the
  loop that workshop mode auto-verifies today. Queue rows show the
  minimum the job needs (name, email, city/postal, requested-at) —
  see §3.
- **Decline: deliberately NOT in v1** (decided at review). The
  verification *method and policies themselves* are undesigned (radar
  R3), and a decline is a staff→member communication (R4) — so v1
  ships verify-only; unverifiable requests simply stay pending. The
  principle for when the flow is designed, recorded now: **a decline
  must be helpful** (D30) — offer an alternative verification path, or
  suggest the locality that actually fits, never a bare no.
- **Member lookup** (thin): by email → state row basics (registered /
  verified / activated / agreement version) for support conversations.
  Deliberately NOT a model viewer (§3).

### Registers — view now, edit on the strawman trigger

Localities and event types render read-only from their served routes
(`GET /localities`, `GET /event-types`). **Editing stays
curation-in-code** per the founder's recorded posture: the register
data store + editor activates when the strawman "causes real issues or
advisor/workshop feedback moves it" — this console is where that
editor will live, and the panel is its slot. **Curation-loop and
analytics reads (untyped-rate, correction clustering, demand views)
wait too** (decided at review): they want real data, or at least
post-workshop data — building dashboards over an empty community is
decoration.

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

### Safety — the conduct-concern queue (added 2026-07-24, post-D64)

The July ops review's activity register surfaced the gap this panel
closes: a member's `conductConcern` landed on the log and **nothing
read it**. Now: `GET /admin/conduct-concerns` lists open concerns
(oldest first — reporter basics, event, and the conduct note), and
acknowledgment is a real command (`ConductConcernAcknowledged`, the
admin as audited actor) — the queue empties through the log, never
through an untracked click. The health probe carries the open count
so it can alarm (ops alarms stack).

**The one named exception to §3's "debrief content is never shown":
the conduct note, here and only here.** The conduct quarantine
(open-risks #11) was designed exactly for this read — the flag stays
cleartext for safety ops; the note stays PII-encrypted under the
reporter's key and is decrypted server-side for the reviewing admin.
A concern without its content is not actionable, and safety review
is the job this panel exists to do. Acknowledging means "a human has
taken this up" — follow-up happens between people; the fuller
due-process machinery (blocks, reporting, adjudication, D35/D50)
remains Group 4's design work.

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
  D35 due-process rules), debrief/reflection content — **with one
  named exception** (2026-07-24): the conduct note, in the Safety
  panel and only there (see §2 Safety — the read the quarantine was
  designed to enable).
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

## Open questions — resolved at review

- ~~Seed contents~~ → one catalog fixture (~50 personas / ~50 events),
  **selective seeding** with scenario-shaped selections (§2 Workshop).
- ~~Curation-loop reads in v1?~~ → no; wait for real or post-workshop
  data (§2 Registers).
- ~~Verification decline~~ → out of v1 entirely; parks with R3 (the
  verification method/policy design) + R4 (the communication), with
  the helpful-decline principle recorded (§2 Members).

Remaining: the catalog's actual contents (persona spread across
envelopes/localities/kinds) — drafted at implementation, iterated with
facilitation experience; it's a fixture, cheap to change.
