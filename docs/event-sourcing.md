# Event Sourcing, CQRS, and Tracing — Design

## Overview

Every state-changing interaction in IRL flows through an immutable event log, with synchronous updates to current-state tables in the same DynamoDB transaction. Reads happen against the state tables and are strongly consistent. The event log gives us audit, replay, and analytics. AWS X-Ray plus structured CloudWatch logs provide end-to-end tracing.

The design is **hybrid event sourcing**: state lives in both the event log and dedicated state tables. We accept the duplication in exchange for simple, strongly-consistent reads and a low-ceremony developer model. Pure ES (where state is always derived from the log on every read) is rejected for its operational cost — eventual consistency, mandatory snapshots, schema-versioning gymnastics — none of which buy us much at workshop or early-production scale.

## Principles

- **Every state change is an event.** State tables are never updated except as the projection side of an event append.
- **Strongly consistent reads.** Writes use `TransactWriteItems` to update the log and state tables atomically. Subsequent strongly-consistent reads see the new state.
- **Idempotent commands.** Every command carries a client-generated `commandId`; duplicates within a TTL window return the original result without re-executing.
- **Time-aware.** Every event records both wall-clock and simulated (workshop) time. Replay can use either basis.
- **Versioned events.** Every event carries an explicit `version`; old versions are upcast in code, never rewritten.
- **Domain events only.** UI clicks and behavioral telemetry live in a separate system if added later.

## Aggregates

Three aggregates initially:

- `user#{userId}` — registration, profile updates, agreement acceptance, locality verification, blocks given
- `event#{eventId}` — proposed, planned, in-progress, over, cancelled, attendees changed
- `interaction#{userId}#{eventId}` — RSVP, confirm, attend, debrief

Cross-aggregate effects (e.g. RSVP count on an event) are derived at read time. If a counter ever becomes hot, we add an async projection — but not now.

System-level events that don't naturally belong to a domain aggregate (e.g. `WorkshopTimeAdvanced`) use a synthetic aggregate ID like `system#workshop-time`.

> **AI-flow events (added since this note was first written).** The AI experience introduces `OnboardingCompleted` (`user#`), `DebriefRecorded` and `ReflectionRecorded` (`interaction#`), and `OrganizerDebriefRecorded` (`event#`/`interaction#`) — carrying LLM-extracted deltas that feed the async user-model projection (`projection-store.md`). **Resolved (open-risks #2, D42):** `UserProfileCreated` is basics-only (name/avatar/vibe); `OnboardingCompleted` is the sole carrier of interview content; cross-env import stays no-history but emits a `ProfileImported` model *snapshot* — see §Import.

## Event log

### Table: `irl-events-log`

Distinct from the existing `irl-events` table, which holds current event-aggregate state.

| Attribute | Type | Role |
|---|---|---|
| `aggregateId` | string | Partition key. e.g. `user#abc123`, `event#xyz789` |
| `seq` | number | Sort key. Strictly increasing per aggregate, starts at 1 |
| `eventId` | string | ULID — globally sortable, URL-safe, no coordinator needed |
| `eventType` | string | e.g. `UserRegistered`, `EventProposed`, `RsvpGiven` |
| `version` | number | Schema version of this event type. Always present. |
| `commandId` | string | Client-supplied UUID for idempotency |
| `actorId` | string | `user#…` who initiated, or `system` for internal |
| `wallTime` | string (ISO) | Real timestamp |
| `simulatedTime` | string (ISO) | Wall-clock + workshop offset |
| `data` | map | Event-specific payload |
| `traceId` | string | X-Ray trace ID, for log/event correlation |

**GSI `events-by-time-bucket`** — for cross-aggregate replay and analytics:

- PK: `bucket` — date string `YYYY-MM-DD`
- SK: `wallTime` (ISO)

One partition per day is well-sized for prototype and workshop volume. If volume grows, we shard the bucket (`YYYY-MM-DD#0` … `#9`).

**DynamoDB Streams enabled from day one.** We don't consume them in v1, but they're available the moment we want async projections (AI analysis, search index, analytics).

### Sequence numbers

The current `seq` for an aggregate lives on its state row (`irl-users`, `irl-events`, `irl-interactions`). Every state row carries `seq` and `version`. This avoids a separate seq table.

For the *first* event on a new aggregate (e.g. `UserRegistered`), the state row doesn't exist yet — the transaction conditions on `attribute_not_exists(userId)` for the state row insert, and the event row uses `seq = 1`. Subsequent commands condition on `seq = expected` on the state row.

Concurrent writes to the same aggregate: only one `TransactWriteItems` succeeds; the other gets `ConditionalCheckFailedException` and can retry (which now reads the new seq).

## Idempotency

### Table: `irl-commands`

| Attribute | Type | Role |
|---|---|---|
| `commandId` | string | PK. Client-generated UUID v4 |
| `result` | map | Cached response body |
| `eventId` | string | The event this command produced |
| `createdAt` | string | ISO timestamp |
| `ttl` | number | Unix epoch seconds, 24h after `createdAt` |

If a command arrives with a known `commandId`, the Lambda returns the cached `result` without re-executing. Native DynamoDB TTL reaps old entries — 24h is enough for client retries; older retries are extremely unlikely in practice.

The `commandId` insert is part of the same `TransactWriteItems` as the event append, conditional on `attribute_not_exists(commandId)`. So either everything happens or nothing does.

## Append protocol

Every state-changing command runs a single `TransactWriteItems` with three operations:

1. **Put `irl-commands`** — condition `attribute_not_exists(commandId)`
2. **Put `irl-events-log`** — condition `attribute_not_exists(seq)` for this aggregateId
3. **Update or Put state table row** — condition `seq = expectedSeq` (or `attribute_not_exists` for aggregate creation)

The state-table mutation is the *projection* of the event. Projections live next to the command handler so a single PR adds command + event type + projection together.

If any condition fails, the whole transaction rolls back. The caller can retry safely — duplicate commandId returns the cached result; a stale seq read causes the caller to refetch and try again.

## CQRS

Light-touch. Reads and writes share a Lambda but go through different code paths:

- **Commands** (POST/PUT/DELETE): validate → load aggregate → build event → `TransactWriteItems` → cache result → return
- **Queries** (GET): read directly from state tables with `ConsistentRead: true`

No separate query service, no event-store-backed projections at first. Async consumers come later via Streams, when we have a use case (AI analysis, search, analytics).

## State projections

The existing CDK tables become the read models:

- `irl-users` ← projects from User events
- `irl-events` ← projects from Event events
- `irl-interactions` ← projects from Interaction events
- `irl-config` ← workshop time offset, feature flags (not event-sourced)

A projection function takes an event and returns the DynamoDB update operation that goes into the transaction:

```js
export function projectUserRegistered(event) {
  return {
    Put: {
      TableName: USERS_TABLE,
      Item: {
        userId: event.data.userId,
        email: event.data.email,
        name: event.data.name,
        seq: event.seq,
        version: 1,
        createdAt: event.wallTime,
      },
      ConditionExpression: 'attribute_not_exists(userId)',
    },
  };
}
```

## Workshop time

Every event records both `wallTime` (real) and `simulatedTime` (real + workshop offset from `irl-config`). Time-sensitive reads use `simulatedTime`; audit and forensic queries use `wallTime`.

Time manipulation in workshop mode is itself a command — `WorkshopTimeAdvanced` on the `system#workshop-time` aggregate. Auditable, replayable, traceable.

### Replay

1. Provision empty state tables (or wipe existing ones)
2. Read events from `irl-events-log` ordered by `wallTime` via the GSI
3. For each event, dispatch to the same projection function the live system uses
4. State is rebuilt — **exactly, for non-shredded aggregates.** A user whose key was shredded (`UserKeyShredded`) has unreadable PII, so their PII-derived state cannot be rebuilt; projection functions must tolerate this and produce a tombstone rather than fail (open-risks #3).

This is exactly the import/export mechanism for the eventual production↔workshop user-copy story: export a user's events, import them into the other env.

## Registration & user lifecycle

The User aggregate (`user#{userId}`) has these events:

- `UserInvited` — admin path only, precursor
- `UserRegistered` — agreement signed, account exists in IRL
- `UserProfileCreated` — profile **basics only**: name, avatar, vibe (projects the synchronous `irl-users` row; collected in a small basics step, e.g. at the interview's close)
- `OnboardingCompleted` — the AI interview: full transcript (Layer 1) + extracted structured-profile seed (Layer 2); consumed by the async user-model projector (`projection-store.md`)
- `ProfileImported` — import path only: Layer 1 narrative + as-of-export Layer 2 snapshot (see §Import)
- `LocalityVerificationRequested`
- `LocalityVerified` / `LocalityRejected`
- `UserActivated` — emitted when prerequisites are met; lets us hook side effects (welcome flow) and audit the activation moment
- `UserAgreementReaccepted` — see "Agreement versioning" below
- Later: `UserProfileUpdated`, `UserBlockedAnother`, `UserDeactivated`, `UserKeyShredded` (for crypto-shredding deletion)

Three registration paths produce a registered user. All three converge on the same events; only path metadata and command sequence differ.

### Self-registration

1. Cognito `SignUp` (email + password)
2. Cognito sends verification email; user confirms
3. Client calls `POST /me/register` with JWT (carries `userId`, `email`, `email_verified`)
4. `RegisterUser` command → `UserRegistered` event (`path: 'self'`)
5. Profile basics (name, avatar, vibe — a small step at the interview's close) → `POST /me/profile` → `UserProfileCreated`
6. AI onboarding interview (`POST /me/interview/turn`, per turn — `onboarding-interview.md`) → on completion → `OnboardingCompleted`. Required by default in production (the model is the product), but **structurally decoupled from activation** so workshop/robot paths can run the canned-LLM seam or skip it (D37)
7. Locality submission → `LocalityVerificationRequested`
8. Admin approves → `LocalityVerified`
9. Prereqs met (agreement + profile basics + locality) → `UserActivated`

Cognito-first, then `UserRegistered`. Orphan risk (Cognito user with no event) is benign — `RegisterUser` is idempotent on `commandId`; abandoned Cognito users are cleanable via a periodic job.

### Admin-invite

1. Admin calls `POST /admin/invite { email }`
2. `InviteUser` command:
   - Cognito `AdminCreateUser` (sends temp password)
   - Appends `UserInvited` event
3. User clicks invite link, sets password (Cognito only)
4. User calls `POST /me/register` — command handler detects prior `UserInvited` on the aggregate and sets `path: 'admin'` on `UserRegistered`
5. Onboarding proceeds normally

`AdminCreateUser` errors with `UsernameExistsException` are treated as success (idempotent at the Cognito level).

### Import (cross-environment user copy)

A copy is admin-initiated in the target env with a signed payload from the source. The chunk contains only what's needed to skip steps the user already completed — no history, no references to other users or events.

**Chunk fields:**

| Field | Replaces in target |
|---|---|
| `email` | Cognito identity |
| `name`, `avatar`, `vibeMessage` | profile basics |
| `agreementVersion`, `agreementAcceptedAt` | agreement step (re-prompt if target requires a higher version) |
| `locality`, `localityVerifiedAt` | locality verification |
| `layer1Narrative`, `layer2Snapshot` (as-of-export) | onboarding interview + the accumulated user model, via `ProfileImported` (below) |
| `optionalAttributes`, `preferences` (when those exist) | preferences setup |
| `dateOfBirth` or `ageBand` (when minors land) | age confirmation |

**Flow:**

1. `AdminCreateUser` in target Cognito
2. Single `ImportUser` command emits, in one `TransactWriteItems` on `user#newSub`:
   - `UserRegistered` (seq 1, `path: 'imported'`, `sourceEnv`)
   - `UserProfileCreated` (seq 2 — basics: name, avatar, vibe)
   - `ProfileImported` (seq 3 — Layer 1 narrative + as-of-export Layer 2 snapshot; the async projector seeds the user model from it, so an imported user is **not** model-empty)
   - `LocalityVerified` (seq 4, `originallyVerifiedAt`)
   - `UserActivated` (seq 5)

**What never crosses environments:** Layer 3 (affinity, crews) and contributor rating — relational data references *other users* and is env-local by design; imported users start relationally fresh with newcomer benefit-of-the-doubt, and the model grows again from target-env debriefs on top of the imported seed.
3. User receives a temp password and sets it on first login

All events have target-env `wallTime` and `simulatedTime`. Replay rebuilds state exactly: imported users look identical to any other user during replay. The markers are `path: 'imported'` on `UserRegistered` and the `ProfileImported` event — audit-only; nothing else in the system behaves differently because of them.

The signed import payload is short-lived and bound to the source env via a pre-shared key. Forgery is rejected at command validation. (Implementation detail of the import endpoint, not of the event-sourcing layer.)

## Agreement versioning

`irl-config` holds `required_user_agreement_version`. Bumping it is an admin command — `UpdateRequiredAgreementVersion` on `system#config`, which emits a `RequiredAgreementVersionUpdated` event so the change is auditable and replayable.

When required version changes, all users with `acceptedAgreementVersion < required` are presented the new agreement on their next sign-in. Acceptance emits a `UserAgreementReaccepted` event on their aggregate.

This is the same mechanism for everyone:

- Self-registered users with old agreements
- Admin-invited users whose pre-existing agreement was older
- Imported users whose source-env agreement was older than target's required version

At sign-in, the API checks `user.acceptedAgreementVersion` against `required_user_agreement_version`. If lower, the response carries a `requires_agreement_reacceptance` flag and the new agreement text. Until acceptance, the user cannot run any state-changing command except `ReacceptAgreement`; read-only commands (e.g. viewing their own profile) remain available.

## Tracing & observability

### X-Ray

- API + projector Lambdas: `tracing: lambda.Tracing.ACTIVE` in CDK
- HTTP APIs (v2) don't support X-Ray stage tracing — that's REST-API-only — so the trace root is the Lambda function segment. The stage contributes structured JSON access logs instead (one line per request: requestId, route, status, gateway vs integration latency split), correlated with the Lambda's per-command log line via requestId/timestamps.
- Custom subsegments (`lib/tracing.mjs`) around the command phases — `idempotency-check`, `encrypt-pii`, `transact-write` — emitted over the X-Ray daemon wire protocol directly, so no X-Ray SDK dependency; the transact-write subsegment times the DynamoDB transaction that appends events and applies projections atomically. Tracing never breaks a request: emission is fire-and-forget, and untraced/unsampled invocations pass straight through.

### Structured logs

One JSON log line per command:

```json
{
  "level": "info",
  "traceId": "1-...",
  "commandId": "uuid",
  "eventId": "01HF...",
  "eventType": "UserRegistered",
  "actorId": "user#abc123",
  "aggregateId": "user#abc123",
  "seq": 1,
  "status": "ok",
  "durationMs": 42
}
```

CloudWatch Logs Insights queries on these are trivial. Errors add `errorType` and a stack trace.

The `traceId` field on every event row lets us jump from "what happened" (event log) to "how did it happen" (X-Ray) for any historical command.

## Schema evolution

- Every event carries `version: <int>`, starting at 1
- Additive changes (new optional fields) → version unchanged
- Breaking changes (renames, removals, semantics changes) → bump version, write upcast code
- Historical events are never rewritten

Upcasters live next to each event type:

```js
// upcasts/user-registered.mjs
export function upcastUserRegistered(e) {
  if (e.version === 1) {
    // v1 had `name`; v2 splits into `firstName` + `displayName`
    return {
      ...e,
      version: 2,
      data: { ...e.data, firstName: e.data.name, displayName: e.data.name },
    };
  }
  return e;
}
```

The replay path and any consumer reads the event through the upcast pipeline.

## Out of scope (initial)

- Pure event sourcing (deriving state from log on every read)
- Async-only projections via Streams or EventBridge — *for the initial synchronous core.* The rich user-model + contributor-rating projection (`projection-store.md`) is the first **planned** async-Streams consumer — a later phase built on the day-one Streams hook, not part of the initial slice (open-risks #12).
- Snapshots — the state tables *are* the snapshot
- UI/behavioral telemetry — separate system if added
- A separate read database (Postgres, OpenSearch)
- Event log retention/compaction — defer until volume warrants it

## Future hooks

- **DynamoDB Streams** on `irl-events-log` — enabled from day one, ready for async consumers
- **EventBridge bus** — if/when we have multiple downstream services beyond the API Lambda
- **OpenTelemetry** — only if we leave AWS; X-Ray is sufficient until then

## First implementation slice

1. **CDK** — add `irl-events-log` (with GSI + Streams) and `irl-commands` tables; enable `Tracing.ACTIVE` on the API Lambda; enable tracing on the HTTP API stage
2. **Shared Lambda lib** (`infrastructure/lambda/api/lib/`):
   - `ulid.mjs` — ULID generator
   - `command.mjs` — `runCommand({ commandId, aggregateId, eventType, build, project })` wraps validation, idempotency check, transaction, result caching, structured logging
   - `tracing.mjs` — X-Ray subsegment helper
3. **First vertical slice — `UserRegistered`**:
   - Route: `POST /auth/register`
   - Validate input → build event → project to `irl-users` → cache result in `irl-commands`
   - Returns the new userId and a session token (Cognito specifics TBD when we wire Group 1 sign-up)
4. **Verification**:
   - Register 5 users via the API
   - Dump `irl-events-log`
   - Wipe `irl-users`
   - Run replay (a small script that reads events and re-runs projections)
   - Confirm `irl-users` matches the original state
5. **Logs & traces**:
   - One trace per registration in X-Ray, with subsegments for validate / append / project
   - One structured log line per command, queryable via Logs Insights

After this slice lands, every subsequent command (`UserProfileUpdated`, `EventProposed`, `RsvpGiven`, …) follows the same template.

## Resolved decisions

1. **Cognito + UserRegistered sequencing** — Cognito first, `UserRegistered` second. See "Registration & user lifecycle" above. Orphan path is benign and cleanable.

2. **Event payload size limits** — Deferred. DynamoDB's 400 KB item limit hasn't been hit. When we approach it (likely with debrief notes or event descriptions), spill payloads to S3 with a reference in the event. No design needed now.

3. **PII in events** — Crypto-shredding adopted. PII fields in events are encrypted with per-user keys; deletion shreds the key, rendering historical PII unreadable while keeping the event log structurally intact. The `UserKeyShredded` event records the shredding for audit. Detailed key-management design is TBD before the first PII-bearing event ships — and `OnboardingCompleted` (transcript + extraction) is essentially that event, so key management is a **blocker for the onboarding flow**, not a later detail (open-risks #3).
