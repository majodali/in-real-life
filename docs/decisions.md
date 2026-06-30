# Decision Register

The canonical record of design decisions for IRL. Each entry is summarized here with a pointer to the note that holds the full reasoning — the notes are where context lives; this register is the index.

**Decisions are revisable.** Every entry is a current best call, not a permanent commitment — especially before we have real user interactions and results. The *process* for reviewing this register and changing the system in response (small tweaks to large pivots) is itself first-class work, deliberately deferred for now — see Governance below.

## Current decisions

| # | Decision | Where |
|---|---|---|
| D1 | Hybrid event sourcing: immutable event log + state tables, strongly-consistent reads | `event-sourcing.md` |
| D2 | Workshop mode is a runtime flag on a single env, with seams defined up front | `workshop-mode.md` |
| D3 | Onboarding is an AI-guided adaptive interview: adaptive cards, purpose-aware (multi-door), seed-now-grow-later | `onboarding-interview.md` |
| D4 | Per-turn structured-output calls (Opus 4.8), not tool use; non-streaming; one extraction call at the end | `onboarding-interview.md`, `onboarding-prompt.md` |
| D5 | `OnboardingCompleted` is distinct from `UserProfileCreated`; per-turn calls are ephemeral, one event on completion | `onboarding-interview.md` |
| D6 | The user model represents person–situation fit, not traits: three layers (narrative / annotated index / earned relational); stories not ratings | `user-model.md` |
| D7 | Provenance: observed > inferred > stated, with decay; a fresh user correction temporarily outranks stale observations; resolution mechanism TBD | `user-model.md` |
| D8 | Compatibility is not a goal: hard constraints + weak soft priors + revealed signal; never a score; computed pairs-in-context; backstage but legible to the subject | `user-model.md` |
| D9 | Difference is bridged, not sorted by; never model or match on protected/sensitive characteristics; answer the concern honestly when raised | `user-model.md`, `coaching-and-engagement.md` |
| D10 | Barriers never filter event visibility; barrier-affected events are clearly marked and attendable anyway | `user-model.md` |
| D11 | Anti-observation principle: do-not-interact relationships are information-symmetric and never a tracking vector | `user-model.md` |
| D12 | Not-for-profit posture; members and their information are never a revenue source | `user-model.md` |
| D13 | Re-derivability → persistent narrative storage, with privacy controls (legibility, export, shredding) shipping alongside the model | `user-model.md` |
| D14 | Coaching is circumspect: perspective not instruction, ≤1 per interaction, earned by context; active engagement (proposing/mediating) with guardrails | `coaching-and-engagement.md` |
| D15 | The AI voice is warm but has no name, persona, or avatar; self-effacing and outward-pointing; a global rule across every AI-voiced surface | `coaching-and-engagement.md` |
| D16 | Onboarding feels like a short, warm, guided flow with a clear end — adaptive per card, but not an open conversation | `onboarding-prompt.md` |
| D17 | Warm, not familiar: warmth is in manner, not commentary; the voice never validates, reassures, or interprets the user's experience. Provisional — validate against real reactions | `coaching-and-engagement.md` |
| D18 | Examples and the closing next-step are grounded only in real events provided to the interview (tiered: this locality → nearby areas → canonical fallback); the model never invents events | `onboarding-prompt.md`, `onboarding-interview.md` |
| D19 | `role` is stored as a single scalar at onboarding (v1); per-context role is deferred to Layer 3 refinement | `onboarding-prompt.md` |
| D20 | Debrief is tiered — fast tap core (no LLM) + optional AI depth (one call); outcome framed as repetition-intent ("worth another go?") and affinity, not star ratings | `debrief.md` |
| D21 | People-affinity is backstage only — no "who liked you"; capture is positive-only (no per-person "no"); negative is inferred conservatively and never shown; mutual quietly shapes co-suggestion and seeds crews; bound by anti-observation | `debrief.md` |
| D22 | A bad experience that is a safety concern routes to reporting and care (Group 4), never treated as preference signal | `debrief.md` |
| D23 | IRL speaks as "we" (the community/organisation), never "I" (an individual) — global across all AI-voiced surfaces; reinforces D15 | `coaching-and-engagement.md` |
| D24 | The debrief is framed as collaboration to tune the user's future suggestions (plus optional self-reflection), not data collection — this is what earns depth; chips are adaptive, opt-in sequences of sets | `debrief.md` |

## Governance — to define later

Flagged as needed, deliberately not designed yet:

- **Register review & change process** — how we review these decisions and modify the system in response to real-world results, from small tweaks to large pivots: cadence, who decides, and how a change propagates back through notes, prompts, and code.
- **Prompt evaluation & testing** — how the onboarding prompt (and later the coaching and debrief prompts) are evaluated, modified, and regression-tested against real and simulated user interactions before changes ship.
