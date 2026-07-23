# Technical Register (T)

Technical decisions as lightweight ADR-style rows
(`registers-and-feedback.md` §1). Where the reasoning already lives
well in a note, the row *indexes* it — this register never duplicates
`event-sourcing.md` et al., it makes the calls findable and gives
feedback something to land on. **Record on contact** (see the UX
register's header); ids are never reused.

| # | Decision | Why | Lives in |
|---|---|---|---|
| T1 | Hybrid event sourcing: immutable log + synchronous transactional projections + async derived read store | Replayable truth with read-your-writes state rows; the full reasoning is the note | `event-sourcing.md`, `projection-store.md` |
| T2 | No frontend build step — plain HTML/CSS/JS, ES modules, edit-and-deploy | Tooling debt deferred until it buys something; the app must stay inspectable | `CLAUDE.md` → Conventions |
| T3 | One injected LLM seam (D37): real Claude in production, deterministic canned stub in workshop/test | Every AI surface replayable and demo-able without a key or network | `lib/llm.mjs`, `workshop-mode.md` |
| T4 | Per-aggregate crypto-shredding for PII; deletion destroys the key, never rewrites the log | Immutable log and real deletion, both — encryption is the reconciliation | `event-sourcing.md` → Crypto-shredding |
| T5 | Mode-gated route registration: workshop-only routes live inside `if (isWorkshop)` and don't exist on production route tables | Absence is a stronger guarantee than a gate that must be checked | `index.mjs`, `workshop-mode.md` |
| T6 | Deterministic per-entity commandIds for seeded/derived chains, generation-salted where teardown is possible | Retries converge at the idempotency table; re-seeds must not collide with cached command records (D64 slice 2) | `workshop/seed.mjs`, `users/locality.mjs` |
| T7 | Functional tests run serially against a deployed stack (IrlStackTest), never mocks-as-integration | The deploy is self-diagnosing; what passed is what's actually running | `test/functional/`, `admin-and-support.md` → Health |
| T8 | Strawman registers ship as curation-in-code (localities, event types, seed catalog) until the named trigger moves them to a store + tool | Curation should be one legible file edit while one head curates; premature tooling calcifies the contents | `lib/localities.mjs`, `lib/event-types.mjs`, `workshop/seed-fixture.mjs` |
| T9 | Entry files never share a name with a sibling directory (the `stream-projector.mjs` lesson) | Node resolution shadows the file silently; named so nobody relearns it the hard way | `infrastructure/lambda/api/` layout |
