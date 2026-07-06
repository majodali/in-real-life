# Workshop Mode — Design

## Overview

A single codebase runs in two distinct **modes**. *Production mode* is for real users with real money and real consequences. *Workshop mode* is for training sessions, demos, automated tests, and timeline walkthroughs — anywhere we want time manipulation, automated user/event activity, and bypassing production gates (locality verification, billing, age checks).

The two modes share all the same domain code. They differ only in:

- Which routes are registered on the API
- Which production gates are enforced vs. bypassed
- Whether time can be advanced / reset by an admin
- Whether automated robot users can be triggered

Both modes are first-class. Workshop mode is not a "test override" or a feature flag — it's a peer deployment shape.

## Principles

- **One mode per stack.** Mode is fixed at deploy time; no per-request or per-user switching.
- **Structural enforcement.** Workshop scaffolding (admin time endpoints, robot endpoints, seed endpoints) is *not registered* on production stacks. It doesn't exist on the route table — not just disabled.
- **Workshop bypasses production gates, never the reverse.** Production never bypasses anything; workshop can skip locality, billing, age verification, etc.
- **Workshop scaffolding is event-sourced too.** Time advances, robot activity, and seed loads all flow through the same command/event pipeline as real activity, so they're auditable and replayable.

## Mode derivation

```js
const mode = process.env.STAGE === 'prod' ? 'production' : 'workshop';
```

Computed once at Lambda init. The stage env var is already populated by CDK from the stack's `stage` prop.

Stage names other than `prod` — `workshop`, `test`, future `workshop-train-alpha`, etc. — all run workshop mode. The default is workshop; production is the explicit named exception. This keeps the rule simple and keeps new stages safe-by-default for development.

> ### Note on test validity
> Tests run against `IrlStackTest` which is workshop mode. That keeps tests fast and gives them access to time manipulation. The trade-off: production-only behaviour (real locality verification flow, real billing, real age gating) isn't exercised by automated tests against the test stack. When those production gates become substantial, we'll need a `prod` test stack and a production-mode test suite. Not in scope now — it's a known gap.

## Seams

Where mode matters and what each side does:

| Seam | Production | Workshop |
|---|---|---|
| Workshop time offset | Fixed at 0 | Admin-controlled |
| `POST /admin/time` route | Not registered | Registered |
| `POST /admin/seed` route | Not registered | Registered |
| `POST /admin/robot/*` routes | Not registered | Registered (when implemented) |
| Locality verification | Real flow (manual admin → automated later) | Auto-approve, or admin-approve via workshop UI |
| Billing gates (Group 5) | Real | Bypassed entirely |
| Age verification (Group 6) | Real | Bypassed |
| LLM / Claude API (onboarding, debrief, reflection, coaching, organiser framing) | Real Opus calls | Injected client → deterministic stub / canned provider; robots use canned transcripts |

The route-registration seams are the highest-confidence safety: workshop-only routes are wrapped in `if (mode === 'workshop')` in `index.mjs`. They literally don't exist on the production Lambda's route table.

Domain seams (locality, billing, age) are guarded inside their handlers with mode checks. The production branch is the default; workshop branches are explicit exceptions.

**The LLM seam (open-risks #5).** Every AI surface — onboarding interview, debrief Tier-2 extraction, reflection/coaching, organiser framing — calls Claude *at command time*: live, paid, non-deterministic, wall-clock-slow. That cannot run in the test stack (which must be fast and deterministic and has no API key) or for robot users. So the Claude client is **injected**, with a deterministic stub / canned provider in workshop and test mode and the real provider in production — a first-class seam alongside time, locality, and billing. Robot users produce interview/debrief content from canned scripts, not live model calls. This is a Group-0 foundation seam, not a detail: it must be defined before any AI flow is testable.

## Workshop time

The first concrete workshop-mode mechanism. Already lightly sketched in [event-sourcing.md](event-sourcing.md#workshop-time); here's the full design.

### Storage

The existing `irl-config` table (per-stage) holds a single key:

```
configKey = "workshop-time"
value     = { offsetMs: <number>, description: <string>, updatedAt: <ISO> }
```

- `offsetMs`: milliseconds added to `wallTime` to produce `simulatedTime`. Default 0 (or absent — runner treats absent as 0).
- `description`: human-readable note like "advanced 2h" or "rewound to 2026-04-01".
- `updatedAt`: ISO timestamp of the most recent change (for diagnostics).

### How simulatedTime gets computed

The command runner reads `workshop-time` from `irl-config` on each invocation and computes:

```js
const simulatedTime = new Date(Date.now() + offsetMs).toISOString();
```

This replaces the current hardcoded `simulatedTime = wallTime`. Every event written from that moment carries the offset-adjusted time.

### Setting the offset

Setting the offset is itself a command, emitting an event:

- Command: `AdvanceWorkshopTime`
- Aggregate: `system#workshop-time`
- Event: `WorkshopTimeAdvanced` v1
- Data: `{ action: 'set' | 'advance' | 'reset', requested: <input>, newOffsetMs: <number>, description: <string> }`
- Projection: updates `irl-config` row for `workshop-time`

The aggregate accumulates seqs (1, 2, 3, …) over the workshop's life. Replay rebuilds `irl-config` from these events.

### Time endpoint shape

- `GET /time` (both modes) — returns `{ wallTime, simulatedTime, offsetMs, description }`. Read-only; useful for clients that need to display "time as we're operating it."
- `POST /admin/time` (workshop only) — body `{ commandId, action: 'set'|'advance'|'reset', datetime?, hours?, days? }`. Computes the new offset, emits `WorkshopTimeAdvanced`. Requires admin role.

### Production behaviour

- `POST /admin/time` is not registered → 404
- The runner still reads `workshop-time` from `irl-config`. In production stacks the row never gets created, so `offsetMs` defaults to 0 and `simulatedTime === wallTime` always.

## Admin authorization

`/admin/*` routes — workshop-only or not — need an admin-only authorization gate. We use the Cognito `custom:role` attribute (already in the user pool schema) checked in the handler:

```js
const role = claims['custom:role'];
if (role !== 'admin') return reply(403, { error: 'admin only' });
```

For the test stack, we promote a user to admin via `AdminUpdateUserAttributes` in the test setup helper. For the eventual workshop stack, the first admin is created manually via the AWS CLI; subsequent admins are promoted by an existing admin via a future endpoint.

## Out of scope

- Per-request mode switching
- Per-user mode (users belong to a stack, not to a mode)
- Test-only override to fake production mode (the structural gate is enough)
- Robot users / automated activity (deferred until needed; same pattern when added)
- Workshop control UI (admin screen — comes in Group 4)

## First implementation slice

Per TDD discipline, the smallest end-to-end vertical:

1. **`MODE` derivation** in `index.mjs` — one constant. No test.
2. **Config loader** lib — reads `workshop-time` from `irl-config`, returns `{ offsetMs, description }`. Unit-tested with `aws-sdk-client-mock`.
3. **Runner integration** — runner takes a `getWorkshopOffset()` function (DI for testability), calls it during command processing to compute `simulatedTime`. Unit tests verify offset is applied.
4. **`AdvanceWorkshopTime` command + projection** — `WorkshopTimeAdvanced` projector writes to `irl-config`. Unit tests for the projection.
5. **`GET /time`** — handler queries the config loader and the simulated clock. Unit tests.
6. **`POST /admin/time`** — admin role check, command runner. Registered conditionally in `index.mjs`. Unit tests.
7. **Functional tests** against the deployed test stack:
   - `GET /time` returns `simulatedTime ≈ wallTime` when offset is 0
   - `POST /admin/time { action: 'advance', hours: 2 }` returns 200, emits `WorkshopTimeAdvanced`
   - Subsequent `GET /time` shows `simulatedTime ≈ wallTime + 2h`
   - A subsequent user registration produces an event whose `simulatedTime` reflects the offset
   - `POST /admin/time { action: 'reset' }` brings `simulatedTime` back to `wallTime`
   - Non-admin users get 403 from `POST /admin/time`

After this slice lands, every subsequent workshop-mode feature (robot, seed, etc.) follows the same template: mode-gated route registration + domain command + projection + functional test.

## Open notes

1. **Admin role bootstrap.** First admin in any stack must be created manually (CLI). We have no admin-promotion endpoint yet; that lands when we build the admin screen (Group 4).
2. **Mode signalling on the wire.** Should `GET /health` or some other endpoint expose the current mode? Yes for diagnostic visibility — add `mode` to `/health`'s response in this slice. (Workshop clients can show a banner; production clients ignore.)
3. **Workshop time and existing tests.** Once the runner reads from `irl-config`, our existing functional tests still need to pass with `offsetMs = 0`. The replay test in particular asserts `simulatedTime === wallTime`, which remains true when no offset is set. No test changes needed.
