# Projection Store — Design

The **derived read-model** that the user model (`user-model.md`), debrief/reflection deltas (`debrief.md`, `reflection-and-coaching.md`), and contributor rating (`contributor-rating.md`) all write into. This resolves the "single document vs. per-dimension items" open question those notes share.

## Where it fits event sourcing

The event log is the source of truth (`event-sourcing.md`). The synchronous state tables (`irl-users`, `irl-events`, `irl-interactions`) are the *immediate* read models, updated inside the command's `TransactWriteItems`. The rich model is different in kind — analytical, delta-applied, eventually-consistent — so it's the **first async projection off DynamoDB Streams**, exactly the "async consumers come later via Streams (AI analysis)" path the ES note anticipates.

- **Synchronous (unchanged):** basic profile — name, avatar, vibe, activation, `seq`/`version` — stays a same-transaction projection in `irl-users`. User-visible immediately.
- **Async (new):** the rich model — Layer 2 (envelope, doors, interests…), Layer 3 (affinity, outcomes), contributor rating, calibration — is built by a **Streams projector** into a dedicated store. Eventual consistency is fine (a debrief refining the model a second later is invisible to the user), and it keeps the command write-path simple and the precedence/decay logic out of the synchronous transaction.

**Narrative (Layer 1) is not duplicated here.** It already lives in the events (`OnboardingCompleted`, `ReflectionRecorded`, debrief reflections). Re-derivability = replay the log through the projector; the store holds only the derived structure.

## Single document vs. per-item: per-item, with a rule

Each incoming delta targets one value and must apply precedence/decay against *that value's* current state. Per-item rows make that a clean read-one → apply → conditional-write; a single mega-document would force whole-doc read-modify-write on every debrief and bump the 400 KB item limit as affinity edges accumulate. So:

- **Fixed-shape, bounded, read-together data → grouped into a few core items** with nested fixed keys (nested update expressions work cleanly for fixed keys).
- **Variable-set / append-y collections → one item each**, typed sort key (clean per-value deltas + provenance + unbounded growth).

## Table: `irl-user-model`

`PK = userId`, `SK = <typed item key>`. Assemble a profile with a single partition `Query`; read a facet with `GetItem`.

| SK | Holds | Shape |
|---|---|---|
| `profile#core` | envelope (6 fixed dims), doors (3), constraints, growth edges, `provisional` | fixed keys, each value annotated |
| `interest#{tag}` | one interest | per-item, annotated |
| `strength#{id}` | one strength-to-offer (incl. `willingToFacilitate`) | per-item |
| `barrier#{id}` | one situational barrier | per-item |
| `affinity#{otherUserId}` | met + positive-only see-again + `sourceRef`s | per-item, unbounded (L3) |
| `outcome#{eventType}` | event-type outcome / calibration (`condition`, forecast error) | per-item |
| `rating#core` | contributor-rating facets + pertinent supporting data | fixed keys; **access-gated** |

Every item carries: the value(s) with `provenance` / `confidence` / `asOf` / `sourceRef` (per `user-model.md`), a `version` (optimistic concurrency), and `lastEventId` (idempotent projection).

## The projector (where precedence lives)

A Streams-consuming Lambda. For each model-bearing event (`OnboardingCompleted`, `DebriefRecorded` with its extracted deltas, `ReflectionRecorded`, `interaction` attendance, `OrganizerDebriefRecorded`, policy feedback):

1. **Idempotency** — Streams can deliver more than once; each target item records `lastEventId`, and the projector skips an event already applied (conditional write).
2. **Precedence & decay (D7 lives here)** — read the target item, apply the delta under `observed > inferred > stated`, with decay of stale `stated`/`inferred` and a fresh user-correction temporarily outranking; write back conditional on `version`. On `ConditionalCheckFailed`, re-read and retry. **All decay/recency is a function of the event's `simulatedTime` (data in the log), never wall-clock `now`** (open-risks #4) — otherwise replay wouldn't be deterministic and a workshop time-advance would silently age everyone's priors. This is what keeps the projector pure.
3. **LLM stays out of the projector.** Debrief Tier-2 extraction happens at *command* time (the one call), and its deltas are carried *in* the `DebriefRecorded` event; the projector is pure precedence/decay logic — cheap, deterministic, replayable.

## Re-derivability & replay

Two distinct operations, easily conflated — separating them was a real fix (open-risks #1):

- **Projector replay (deterministic, LLM-free).** Wipe `irl-user-model` and re-run the projector over the log; it re-applies the **frozen** deltas already baked into each event, reproducing the *same* Layer 2/3 the live system produced. This is the ES replay mechanism — *within* an environment. Cross-env user copy is **not** full-history replay: the import emits a `ProfileImported` snapshot event (Layer 1 narrative + as-of-export Layer 2) that this projector seeds from, and Layer 3 / contributor rating never cross environments (`event-sourcing.md` → Import; D42).
- **Re-extraction (batched, LLM, separate job).** To actually *evolve* the model — a new or merged dimension, a better prompt — replay is **not** enough: it only reproduces the *old* extraction. We must re-run the Opus extraction over the Layer-1 narrative in the log to regenerate deltas under the new schema. This is a distinct, batched, non-deterministic, **costed** job (not the projector), and it is what makes "re-derive Layer 2 from Layer 1 without re-interviewing" actually true. Its cost/latency/throughput story is TBD.

## Consistency

- Eventual, via Streams — acceptable everywhere the rich model is read (recommendations, matching, backstage review).
- **Onboarding seed (minor choice):** so the feed personalises immediately after onboarding, either accept a ~1–2s lag before the first async projection lands, or write an initial `profile#core` synchronously at `OnboardingCompleted` and let async take over. Lean: accept the small lag; add the synchronous seed only if it reads as sluggish.

## Privacy, shredding, access-gating

- Every item is PII, encrypted under the per-user key; `UserKeyShredded` (`event-sourcing.md`) destroys the key → the store's items become unreadable and are deleted. The projector handles shred/deletion events. **Replay therefore reproduces state exactly only for non-shredded aggregates** (open-risks #3); a shredded user's PII-derived model can't be — and shouldn't be — rebuilt, so the projector yields an empty tombstone for them rather than choking on unreadable fields.
- **`rating#*` is backstage** — read only by internal matching / admin / enforcement paths, never returned to a member (legibility: a member sees their *history* from events, not their scores — `contributor-rating.md`).
- Legibility reads (a member's own history) come from the **event log / interaction state**, not from this derived store.

## Decisions

- The rich model is an **async Streams projection** into a dedicated `irl-user-model` table; the synchronous `irl-users` row keeps only basic, immediately-visible profile.
- **Per-item rows** (fixed-shape bounded data grouped into a few core items; variable collections one item each), each carrying provenance + `version` + `lastEventId`.
- **Precedence/decay (D7) lives in the projector**, applied per-item with optimistic concurrency; LLM extraction stays at command time, deltas ride in the event.
- Narrative isn't duplicated (lives in the log); the store is fully **rebuildable by replay**.
- `rating#*` items are access-gated; all items are per-user-encrypted and shredded via `UserKeyShredded`.

## Open questions

- Facet/decay tuning and the precedence conflict rules in detail (start as per-contribution judgment calls, D7) — needs real data.
- Whether any consumer genuinely needs read-your-writes (would force a synchronous seed beyond onboarding).
- Streams fan-out / projector throughput at scale, and dead-letter handling for a poison event.
- GSIs for cross-user reads matching will need (e.g. affinity edges by `otherUserId` for mutual-affinity/crews) — a Group 3 concern once matching is designed.
