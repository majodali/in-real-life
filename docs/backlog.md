# Backlog — the source of truth for progress

The single register of what's built and what's next, moved out of
`CLAUDE.md` (which now just points here). Update it in the same commit as
the work it describes: a completed item becomes `[x]` and its text is
rewritten to describe what actually shipped (decisions, doc pointers,
deliberate omissions) — the checked entries double as the implementation
map. New scope discovered mid-slice is added here rather than done
silently.

Organized into dependency-ordered groups. Earlier groups generally need to
land before later ones; within a group, items can usually be tackled in
any order. Most unchecked items still need detailed analysis before
implementation — the conceptual registers (`decisions.md`, `radar.md`,
`open-risks.md`, `hypotheses.md`) hold that analysis when it exists.

### Done so far (prototype against localStorage)

- [x] Card-based AI interview engine (scripted, no real Claude yet)
- [x] User profile screen (name, avatar, vibe message, follow-up questions)
- [x] Event feed with tabs (Happening / Possible / Nearby)
- [x] Event detail screen with confirm + suggest-change stub
- [x] Event lifecycle prototype: RSVP → confirm → attend → debrief
- [x] Debrief screen with optional deeper Q&A
- [x] Content-alternative system + ⋯ menu
- [x] App feedback submission (Lambda function URL → S3)
- [x] Static site infrastructure (S3 + CloudFront + ACM + Route53 at in-real.life)
- [x] Backend event-sourcing core: command runner (idempotency, immutable `irl-events-log`, atomic `TransactWriteItems`), synchronous projections, replay verified end-to-end by functional test
- [x] Backend domain surface: users (register / profile / locality / me / export / delete), events (propose / list / lifecycle / interactions / suggestions / polls), notify; ~30 routes, unit + functional tests against deployed `IrlStackTest`
- [x] Functional coverage backfill for everything shipped after the original suite: attendees roster (opaque 16-hex refs, `me` flag, no userIds in responses, refs stable per event / uncorrelated across events, roster-ref → debrief people-step round trip), onboarding (interview turn loop → completion → **async Streams projector seeding `irl-user-model`, polled + decrypted** → pottery interest → recommendations membership), reflection (409 without debrief, stub turns, close with process/organizer feedback, idempotent retry, vocabulary validation), agreement versioning (admin bump → 403 gate with `agreement_reacceptance_required` → re-accept shown version → rollback re-prompts no one; restores shared required-version state), external events (trio required, threshold fields refused, born planned, confirmations counted, steward-only edits), event shape (stub extraction on the row, organizer correction normalized + stamped, null clears), recommendations (committed/conflicting/over excluded, ids ⊆ event list, no score fields ever). Debrief suite rewritten to the tiered API (was the stale one failing deploys). Helpers: `irl-user-model` purge in `purgeUserAggregate`, `purgeEventAggregate` (event rows + logs + roster key), `waitFor` poll for eventual consistency
- [x] Crypto-shredding: per-aggregate AES-GCM keys (`irl-user-keys`), PII encrypted on log records, key destroyed on delete (PII registry gaps for event-aggregate PII flagged in code as pre-launch work)
- [x] Workshop mode runtime: mode flag from stage, simulated time (`irl-config` offset, `WorkshopTimeAdvanced`), admin-gated `POST /admin/time`

### Group 0 — Foundations

Architectural decisions that affect everything downstream. Each warrants a short design note before implementation begins.

- [x] Event sourcing + CQRS core — command runner, immutable log, idempotency, transactional synchronous projections, replay-verified (`docs/event-sourcing.md`)
- [x] Workshop-mode runtime — mode flag, simulated time, admin gate (`docs/workshop-mode.md`)
- [x] End-to-end tracing depth — `lib/tracing.mjs` emits X-Ray subsegments (`idempotency-check` / `encrypt-pii` / `transact-write`) over the daemon wire protocol (no X-Ray SDK dependency); the command runner stamps the invocation's `traceId` on every event record and emits one structured JSON log line per command (status ok/cached/error, durationMs, errorType+stack on failure); HTTP API `$default` stage writes structured JSON access logs (HTTP APIs don't support X-Ray stage tracing — REST-only — so the trace root is the Lambda; `event-sourcing.md` corrected)
- [x] **LLM seam (D37)** — `lambda/api/lib/llm.mjs`: injected provider (`llm.complete({task, system, messages, schema})`), real Claude API in production (structured outputs, key from Secrets Manager), deterministic canned stub in workshop/test; first consumer is the onboarding extraction call
- [x] Async Streams projector + `irl-user-model` store (`docs/projection-store.md`, D36) — dedicated projector Lambda (`lambda/api/stream-projector.mjs` + `projector/` — the entry file must not be named `projector.mjs`: the sibling directory shadows it in the runtime's extensionless handler resolution) consumes the `irl-events-log` stream (INSERT-only filter, partial-batch failure reporting, bisect-on-error, SQS DLQ): `OnboardingCompleted` seeds `profile#core` + `interest#`/`strength#`/`barrier#` items (payloads encrypted under the per-user key, `asOf` from `simulatedTime`), `UserDeleted`/`UserKeyShredded` purge to an empty tombstone, shredded users (missing key) skip cleanly. Debrief deltas are live as the second source: DebriefSubmitted applies people-step affinity edges, no-show barriers, and extracted envelope/interest/barrier deltas via read → apply → conditional-write-on-version (D7 v1); conduct-quarantined debriefs are non-model-bearing
- [x] Event-vocabulary reconciliation with D42 — `UserProfileCreated` is basics-only; `OnboardingCompleted` (via `POST /me/onboarding`) is the sole interview carrier (transcript + Layer-2 extraction, crypto-shredded); deletion appends a `UserKeyShredded` audit event after the physical key destruction; every event record now writes the `bucket` attribute for the `events-by-time-bucket` GSI

### Group 1 — Identity, profile, first contact

Everything needed for a real adult to land on the site, learn what IRL is, agree to terms, sign up, and build a meaningful profile.

- [x] Website / homepage — `src/index.html` is the public landing page (what IRL is, how it works, principles, sign-up/sign-in CTAs, terms link); the old dev persona selector is gone
- [x] User agreement — `src/terms.html` (v1, plain-language: adults-only, conduct, privacy/data rights) + acceptance captured at register; agreement versioning per `docs/event-sourcing.md`: `required_user_agreement_version` in `irl-config` bumped via `POST /admin/agreement-version` (`RequiredAgreementVersionUpdated` on `system#config`), `GET /me` flags `requiresAgreementReacceptance`, state-changing member routes gated (deletion/export exempt — data rights), `POST /me/agreement` emits `UserAgreementReaccepted`, frontend re-acceptance screen in the sign-in flow. Terms text still needs counsel review before launch.
- [x] Public user sign-up flow (Cognito sign-up + email verify → `UserRegistered`)
- [x] Locality verification — manual admin approval implemented (request → verify → activate chain); automated verification (postcard, third-party) still open — design alongside age verification (radar R3)
- [ ] Profile data model — scope has shifted since written: the rich model now exists **backstage** (`irl-user-model`: envelope, doors, interests, strengths, barriers — onboarding-seeded, debrief/reflection-grown, per D6/D42), so what remains is (a) the **member-visible/editable surface** over it (legibility: members see their history and can correct beliefs — that surface doesn't exist yet) and (b) the **machine-comparable envelope form** that ranking spec v2 names as its biggest absent fit input (lands via a model re-extraction, `docs/projection-store.md`). Needs design
- [x] Profile view + edit — profile screen views/edits name, avatar, vibe (`PUT /me/profile` → `UserProfileUpdated`), plus export/delete/sign-out and the "tell us more" follow-up
- [ ] Optional user attributes — entered if user considers them valuable for matching. Needs careful design against the privacy stance (D8/D9/D28: demographic affinity lives on events, never users; the gaming register leans on IRL holding no user demographics) — the line to draw is useful-for-matching (accessibility needs, travel radius — partly captured already via onboarding `constraints`) vs. demographic proxies we've decided not to hold
- [x] Real Claude API for onboarding interview (replaces scripted flow) — backend: `POST /me/interview/turn` (per-turn interviewer, frozen system prompt + card schema from `docs/onboarding-prompt.md`, real-event grounding, branch-validated with retry + templated fallback) and `POST /me/onboarding` (extraction → `OnboardingCompleted`); frontend: onboarding screen drives the live turn loop (name as form field per D42, scripted flow retained as offline fallback) and completes via createProfile → completeOnboarding. Full screen redesign still planned.
- [x] Account deletion / data export (export decrypts the event log; delete shreds the per-user key)

### Group 2 — Core event experience

Extends the prototype's RSVP→confirm→attend→debrief flow into a full proposed → planned → in-progress → over → cancelled lifecycle, with users able to propose events.

- [x] Full event lifecycle states: proposed, planned, in-progress, over, cancelled (stored states command-driven; in-progress/over time-derived; idea time/place-derived)
- [x] Event cancellation flow — RSVP disposition decided: interaction rows are **never rewritten** on cancellation (the commitment historically existed; "live commitment" is derived — confirmed AND event not cancelled/over — everywhere it matters: conflicts, feed, future supply/reliability signals). Cancel result reports `affected: {interested, confirmed}`; the organizer's cancel dialog shows the impact before confirming. Affected members get in-app surfacing: one-time feed toast (client-side seen-set), "Cancelled — you were in" feed badge, plain-language detail note; withdraw stays available, never required. Push/email notification of attendees is explicitly the Group 7 notifications slice
- [x] Minimum attendance threshold (auto-plan at `minimumAttendance`)
- [x] User proposes event (`POST /events` → `EventProposed`)
- [x] Three event types (D53, `docs/external-events.md`) — external events are **steward, not organizer**: poster holds edit/cancel ("Listed by", never "Organized by"), born `planned` (full trio required; no threshold/auto-plan; capacity informational; D34 cost disclosure applies), confirmations are **mutual member commitments** ("you won't walk in alone") with no admin power, suggestions are the correction channel and the stale-steward signal. "This-user-organized" is a client-side view distinction (organizerId === me). "Claim stewardship" transfer is the future add if steward absence bites — never open editing
- [x] Track interest before commitment (`InterestExpressed` distinct from `AttendanceConfirmed`)
- [x] Attendee roster ("see who's going") — `GET /events/:eventId/attendees` via the `event-user-index` GSI: confirmed + interested groups, **first names only** (interaction-row snapshots; userIds never leave the server — the caller's entry is marked `me`), detail screen renders "Going / Meeting there (external) / Interested" under the counts. D52 touchpoint noted in code: when protective blocks land, the roster must pass through the rendered-world rule
- [x] Time/date suggestion handling for proposed events (suggestions: make/vote/adopt/reject/respond; polls: create/vote/close)
- [x] Time/place-less proposals — "Anyone into scrabble?" is a first-class **idea** stage: `POST /events` accepts title-only proposals (times stay a pair when given); `idea` is *derived*, not stored (`lifecycleState` stays `proposed`; missing any of startTime/endTime/location ⇒ idea), so no event-vocabulary change. Ideas are maximally open (suggestions, polls, edits, interest) but interest is the idea-stage currency — confirmation and scheduling 409 until the time/place trio is set via edit (auto-plan therefore can't fire on an idea). Feed/detail render TBD + interest-only affordances
- [x] Overlapping RSVPs — double-confirmation is surfaced, never blocked: confirming over another still-live confirmed event returns a `conflicts` heads-up on the response (interest overlaps deliberately not computed — browsing options is fine), and `GET /events` annotates `conflictsWith` among the caller's confirmed live events at read time so post-hoc edits are caught. Half-open intervals (back-to-back events don't conflict — co-located doubles are legitimate); cancelled events aren't commitments; nothing is ever auto-cancelled — the member decides. Frontend: gentle toast on confirm, standing note on detail, feed badge. Spam-scale double-confirming is contributor-rating input later (Group 4)
- [ ] Start-time strictness — events flag how tight the start really is: a hard start ("doors close 7:15 sharp") vs. an arrival window ("arriving around 7pm, all games start by 7:15"). Real events almost always have leeway — but not so much that showing up feels optional or a one-minute poke-in counts. Feeds into overlap handling (a soft start blunts a back-to-back squeeze) and later reliability reads
- [ ] Overlap follow-through — when a double-confirmation is surfaced, ask the member what they intend: attending both (legitimate, esp. co-located/back-to-back) → offer to notify one or both organizers they may be late or splitting time; otherwise nudge toward freeing the spot. Needs organizer-notification machinery (Group 7 notifications) and start-time strictness above
- [x] General event management — edit (`PUT /events/:eventId`, sparse fields incl. description/times/location/cost/spots/meeting-spot/shape, organizer/steward-gated, closed once the event leaves the open phases) and cancel (impact preview, `affected` counts, in-app surfacing) shipped across the Group 2 slices. The remaining piece — **notify attendees** — is explicitly the Group 7 notifications slice (per the cancellation item), not this one
- [x] Richer event data (v1) — **cost disclosure per D34**: `cost {amount, covers}` accepted at propose/edit, both required together (an amount never travels without what it covers), shown in the listing; the $20 donation cap / fixed-price threshold stay policy + pattern-watch, not schema. **Meeting-spot hint (D54)**: optional how-to-find-us text on every event, propose/edit/detail. **Capacity**: `maxAttendance` (includes the organizer, ≥ minimumAttendance; informational-only on external events); confirming a full event 409s (benign race overshoot accepted — hard enforcement belongs with waitlists), interest stays open on full events as the demand signal, `GET /events` annotates `full` while joinable; lowering the cap never evicts anyone. Also fixed en route: editing an idea no longer demands time/place (edit mirrors the idea pairing rules; blanking cost/spots clears them)
- [ ] Event images — deferred: member uploads need storage + moderation decisions; a curated illustration set ties to the event-type register (Group 3) and the illustrated-avatar direction (Group 7)
- [ ] Co-organizers + claim-stewardship — deferred: needs the organizer-engagement responsibility-gate design (who can edit/cancel/debrief-as-organizer); organizer and steward (D53) are two points on that one spectrum
- [ ] User interaction during event — what happens between confirm and debrief while in-progress; the finding-each-other families are recorded in D54 (`docs/external-events.md`): meeting-spot hint is live, on-arrival single message / shared symbol / proximity are tracked — proximity constrained by D50/D52 (block-awareness + advocate review before design)
- [ ] "Suggest change" modal — real time/place picker (currently stubbed). Parked deliberately: pure UI, and the full frontend redesign would throw the work away — pick it up with the redesign

### Group 3 — Matching, preferences, recommendations

Once profiles and events are real, decide who sees what.

- [ ] User preferences for kinds of events
- [ ] User preferences for kinds of people / mark friends or preferred companions
- [ ] Soft de-prioritize others (without blocking) — needs careful design
- [ ] Travel willingness — distance, preferred locations, fine-grained per event type / company
- [x] Matching/prioritization algorithm (v1 — feed ranking) — the first implemented, versioned ranking spec (`docs/matching-spec.md`, D55; `lambda/api/matching/tunables.mjs` mirrors every default, all tunable to zero): hard constraints are the only gate (joinable / not full / no overlap with the caller's live confirmed commitments / not already committed), fit = interest tags against the event shape's activityTags (high tier) with title+description text fallback, plus door fit against onboarding door weights (spec v2 with D56; envelope fit still waits on a comparable member-side form), outgoing-affinity nudge (positive taps only, generosity self-discounted per D47's H2-lite transform, capped below fitCap so nudges structurally never dominate), deterministic exploration (hash noise on simulated time reshuffling weekly + guaranteed exploratory share). `GET /events` gains an ordered `recommendations` list — ordering only, never scores; the feed renders Your plans / Suggested for you / More on the calendar. People/group recommendation, mutual-affinity strength, crews, rating, avoidance, injection stay open — each named in the spec with its landing slice
- [x] Mutual-affinity strength (D47/H4 v1 — ranking spec v3, `docs/matching-spec.md`) — affinity edges consumed **strength-weighted, never boolean**: one-sided tap at the tapper's own generosity weight (from the new projector-maintained `stats#affinity` running totals — the shared H2 substrate), mutual amplification gated by the **weaker side** (min-combiner; a spam tapper's mutuals amplify ≈ nothing while their one-sided component survives self-discounted), **reciprocal-met confirmation** (min of both sides' met counts — co-presence alone never strengthens an edge, the F13 follower guard, structural; deliberately not weight-gated: observed beats inferred), dual half-lives on simulated time (tap 90d, confirmed 270d). Reverse edges read pointwise via the typed sort key — the `otherUserId` GSI deliberately deferred to the crews slice (set-level queries). Still open, named in the spec: co-attendance chance-rate baseline (raw counts v1, H4 tuning), avoidance zeroing (capture unbuilt), crew seeding
- [x] Structured event shape (D56, `docs/event-shape-prompt.md`) — every event gets a machine-readable shape at propose time: one LLM extraction (`event-shape` task, deterministic stub in workshop/test) classifies the listing into activityTags / structure / doors; rides frozen in `EventProposed`, projects onto the event row, public data (not PII). Organizer edit replaces it wholesale (`source: organizer` vs `extracted`; null clears); extraction failure never fails propose. Ranking spec v2 consumes it: activityTags = high-confidence interest-match tier (text match demoted to fallback), doors match structured-to-structured against onboarding door weights; `structure` captured-not-used until the member envelope gets comparable form. Detail shows "What it's like"; edit form corrects tags/structure/doors
- [ ] Register of event types, operators, venues — safety rating, suitability, positive/negative attributes (shape describes one listing — the register describing *kinds* is still open)
- [ ] Real Claude API for event matching + suggestions
- [ ] Structured profile model — extracted from interviews (personality, availability, comfort, social energy)
- [x] AI updates its understanding from debriefs (v1) — tiered debrief per `docs/debrief.md`: Tier 0–1 deterministic (attended/no-show reason, again = repetition intent not stars, texture chips, people step over opaque attendee refs — met + positive-only see-again, userIds never reach clients), Tier 2 = one extraction call (`docs/debrief-prompt.md`) only when free text given, deltas ride in the event; conduct quarantine per open-risks #11 (preference fields suppressed at the command); debrief PII encrypts under the **user's** key (`piiKeyIdFor`) so account deletion shreds it; projector applies deltas under D7 v1 (observed outranks seeded annotations, per-item version + lastEventId). **Interactive Tier-2 follow-up built**: the one invited question is deterministic client-side (aim-better on maybe/no, chip-specific confirm-and-expand on mismatch texture, calibration check on good-outcome-despite-mismatch; opt-in, skippable, never shown on good outcomes/no-shows/conduct), `followUp {question, answer}` rides on the event (PII) and feeds the same single extraction call. **Reflection/coaching v1 built** (`docs/reflection-prompt.md`): `POST /me/reflection/turn` (we-voice conversational loop, gated on having debriefed the event per D44; coaching conditional with the five perspectives, frequency-capped via `offeredPerspectives` on the user row — a repeat is malformed output, retried then templated-closed) + `POST /me/reflection` (close: reuses the debrief extraction; `ReflectionRecorded` on the user aggregate with transcript/deltas/cap record/consented routed feedback — organizer-delivery channel still future; conduct-quarantined debriefs get narrative-only closes, no deltas); projector applies reflection deltas through the shared debrief path; standing "say more" door on the saved-debrief card opens the inline conversation
- [ ] App-suggested activities based on AI understanding
- [ ] Group formation — surface 3-4 people repeatedly attending together as a "crew"
- [ ] Cold-start: how a new user gets included with no history
- [ ] Balancing group sizes — some events better with 3-4, others 12+
- [ ] Events with preferred people rank higher in feed

### Group 4 — Safety, operations, support

Trust & safety surface, internal admin/support tooling.

- [ ] User blocks other users — distinct from "didn't enjoy meeting"
- [ ] Selective visibility blocking (e.g. ex-spouses) — separate from blocks
- [ ] Reporting mechanism for inappropriate behavior at events
- [ ] Mutual blocks UX — event visibility, attendee counts
- [ ] Internal user contributor rating — trustworthy, positive contributor; private, used for group composition
- [ ] Admin & support UI — system metrics, health, logs/traces, support requests, data management, workshop controls (time, seed, automated activity)
- [ ] User support — support info, request for support, assistant chat, support staff chat; communication design first (radar R4)

### Group 5 — Production economics

- [ ] Billing & plans — paid tiers, payment integration (Stripe?), entitlements, plan-based feature gates. Workshop mode bypasses entirely. Pricing model + sponsorship stance come first (radar R7).

### Group 6 — Deferred

- [ ] Minor user support — under-18 sign-up, parental consent, age-appropriate event filtering, stricter data handling. Deferred until after billing; until then, agreement makes adults-only explicit.

### Group 7 — Polish & enhancements (cross-cutting)

Items that can land alongside any group above once prerequisites exist.

- [ ] Recurring events (weekly coffee walk, monthly book swap)
- [ ] Weather/seasonality awareness for outdoor events
- [ ] Multiple locations beyond Bainbridge Island — per the launch playbook (radar R5)
- [ ] Notifications — push, email digest, in-app only? First confirmed consumers: cancellation notices to affected members (in-app toast/badge exists; the reach-them-when-away channel doesn't) and overlap follow-through's organizer heads-up
- [ ] Calendar integration — export confirmed events
- [ ] Reminders for confirmed meetups
- [ ] Illustrated avatar system (replace emoji picker)
- [ ] Spoken/voice input for interview responses
- [ ] Accessibility audit — ARIA, keyboard nav, screen readers
- [ ] About IRL screen — privacy/how-it-works
- [ ] Review "show up" usage across copy
- [ ] Onboarding for ⋯ menu / alternatives system
- [ ] AI interviewer persona — consistent name/voice
- [ ] Referral / invite flow
- [ ] Shareable link to the app
- [ ] Rethink tab categories based on user feedback
- [ ] Decide if app feedback stays as separate Lambda+S3 or moves into main API
- [ ] User-copy mechanism between production and workshop environments (when those split)
