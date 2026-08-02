# IRL Design Notes

Design notes for **in·real·life** — a local community meetup app: AI-guided onboarding, discover nearby events and people, coordinate real-world meetups. Privacy-focused (first names only, no messaging — just show up).

These notes are **living and provisional** — current best decisions, revisable as real usage teaches us. `decisions.md` is the map: a register of every decision (D1–D67) with a one-line pointer to the note that holds the reasoning, plus watch-items for emergent effects we're tracking.

## How the pieces fit

```
                 ┌─────────────── the AI spine (Claude API) ───────────────┐
   onboarding ──▶│  interview ─▶ debrief ─▶ reflection ─▶ coaching/skills    │
   (seed)        └──────────────────────┬──────────────────────────────────┘
                                        │ observed signal
                                        ▼
   events ──▶ event log ──(Streams)──▶ user-model projection ──▶ matching, feed,
   (ES core)                            + contributor rating       group composition
```

Understanding of a person is **seeded** at onboarding and **grown** from what they actually do (debriefs, reflections, attendance) — stored as a derived projection over the immutable event log.

## Reading order

**Start:** `backlog.md` (**the source of truth for progress** — what's built, what's next, dependency-ordered) · `decisions.md` (the decision register) · `hypotheses.md` (the hypothesis register — every embedded analysis as a testable, tunable, reversible hypothesis) · `open-risks.md` (known gaps) · `radar.md` (tracked workstreams not yet designed, R1–R10) · **`flows.md` (the visual map — all processes and flows as diagrams, TBD elements dashed)** · this README.

**Registers & feedback (decided: D66, R1 graduated):** `registers-and-feedback.md` — how feedback lands on decisions: record-on-contact registers (`ux-register.md` U-rows, `tech-register.md` T-rows), the intake pipeline (`feedback-log.md` FB-rows: solicit → capture → triage → land → answer → reopen), the advisor round pack, and the boundaries (not member signal, not support, not governance).

**Foundations (Group 0)**
- `event-sourcing.md` — hybrid event sourcing: event log + synchronous state tables, replay, crypto-shredding, tracing.
- `workshop-mode.md` — one codebase, two modes (production / workshop); time manipulation, gate bypass.
- `projection-store.md` — the derived read-model (`irl-user-model`): async Streams projection, per-item rows, where precedence/decay lives.

**The person (Groups 1 & 3)**
- `user-model.md` — model situations not traits; three layers (narrative / annotated index / earned relational); the comfort envelope; compatibility stance; *difference is not incompatibility* + demographic affinity lives on the event.
- `profile-and-legibility.md` — **(decided: D58/D59)** the machine-comparable envelope form (coarse positions + growth edge alongside the stories) and the member-visible correction surface ("How we understand you", `UserModelCorrected`, the D7 correction-precedence rule made concrete).

**Onboarding (Group 1)**
- `onboarding-interview.md` — architecture of the adaptive interview (per-turn structured calls, Opus 4.8).
- `onboarding-prompt.md` — the interviewer system prompt + exact JSON schemas.

**The event experience & feedback (Group 2)**
- `debrief.md` — the dominant signal source; information-first, tiered, low-friction; people step; safety + policy feedback paths.
- `debrief-prompt.md` — the extraction call's prompt + schema (v1: extraction only; the interactive Tier-2 follow-up and reflection handling are future sections).
- `external-events.md` — events IRL didn't create: steward not organizer (D53), confirmation as mutual member commitment, suggestions as the correction channel; finding-each-other design area (D54).
- `organizer-engagement.md` — organisers as first-class; framing help, responsibility gates, organiser debrief.
- `event-policy.md` — what belongs on IRL: honesty + non-coercion, not subject matter.

**Understanding & guidance (Group 3)**
- `reflection-and-coaching.md` — the optional deeper modes the debrief opens a door to; skills development; the reframe library.
- `reflection-prompt.md` — the reflection/coaching turn prompt + control envelope and the close (v1; the reframe library in `reflection-and-coaching.md` stays the copy source of truth).
- `coaching-and-engagement.md` — the global AI voice (warm-not-familiar, "we", no persona), the coaching model, active engagement.

**Matching & recommendation (Group 3)**
- `success-and-progress.md` — **the keystone: what IRL is *for*.** Success = real-world connection & belonging, not engagement; distributional; indicators-not-targets. Everything downstream is evaluated against this.
- `matching.md` — how fit, affinity, rating, crews, constraints, avoidance, and newcomer status combine into what a member sees; fit-first, bounded soft nudges, exploration/inclusion floor; the definitions + influence map; the gaming/negative-scenario register.
- `matching-spec.md` — the implemented, versioned ranking spec (v9): tunables + defaults, hard constraints, the honest register of what it omits and where each piece lands.
- `evidence-decay.md` — **(decided: D60, spec v6)** clock half-lives replaced by evidence-based decay — the lived-events axis, decay floors as the incompleteness prior, ambiguous counter-evidence captured-not-used.
- `localities-and-constraints.md` — **(decided: D62, spec v8)** the curated locality register (effort bands — here/nearby/a-trip/far — no coordinates, draft launch register awaiting local correction) and structured constraints: travel reach as a graduated de-weight (prioritization, never filtering), per-locality adjustments, time windows as soft fit, the "wish this was closer" capture (consumption = R8); effort-is-personal watch signals.
- `event-shape-prompt.md` — the propose-time event-shape extraction (D56): activityTags / structure / doors, organizer-correctable, feeding the fit tiers in `matching-spec.md`.
- `event-type-register.md` — **(decided: D63, spec v9)** kinds, not listings — graduated tags, earned by recurrence: types exist so "worth another go" keeps its promise (again-intent fit is the flagship consumer); deterministic tag matching (tie → untyped, first-class), organizer-correctable, member display deferred; `outcome#{eventType}` rows land the parked extractions; attribution kept honest (§4) and the formality risk named (§7); venues + operators designed, deferred.
- `scenario-walkthroughs.md` — the matching + success test scenarios run concretely through the design as written; two passes (F1–F12 triaged → D46–D51; second pass re-verifies all twelve and adversarially probes the new machinery, F13–F14 fixed). All scenarios currently `holds`.

**Trust & safety / operations (Group 4)**
- `operations.md` — **(decided: D67, R9 graduated)** operating at unstaffed scale: the per-loop discipline (automate / staff / redesign-away / operator-for-now with a named failure signal; automation never launders judgment), the public loop map, and the automation backlog it creates; roles and staffing live in the private org register (R11).
- `launch-playbook.md` — **(decided: D65, R5 graduated)** the phased operating process for launch #1 (Bainbridge): interest read as judgment-with-named-inputs, the founding cohort (voice, never knobs; gratitude outside the product), the advisor round (the strawman registers' waiting corrections + D52's advocate validation; opens R1), the three workshop session scripts consuming the D64 tooling (attendees do the interview themselves; robots v1 scoped to batch persona actions; self-serve demo stacks named with the red-team-agent use case), soft open → community open, languages decided-by-deferral (→ R10), and the retro that corrects the playbook itself. Run-day cards: `workshop-crib-sheets.md`.
- `admin-and-support.md` — **(decided: D64)** the operator console (in-app, role-gated, five panels: workshop seed + time, verification queue, registers view, health, policy) with the admin data discipline stated; member support explicitly gated on R4's communication design.
- `contributor-rating.md` — a private, backstage, multi-faceted trust read; informs, never dominates.
- `protective-blocks.md` — the safety tier's mechanism (D50/D52): the rendered-world rule, ordinary-power blocker view (awareness/peace), block ≠ accusation; advocate validation planned before build.

## Cross-cutting principles (the spine of the whole design)

- **Warm, not familiar; "we", not "I"; no persona.** One voice across every AI surface — warmth is in the manner, never manufactured rapport (D15, D17, D23).
- **Model situations, not traits; stories, not ratings; observed beats stated.** (D6, D7)
- **Compatibility is not a goal.** Constraints + weak priors + revealed signal, never a score; difference is bridged, not sorted by; demographic affinity lives on the event, never the user (D8, D9, D28).
- **Backstage and legible.** Beliefs and ratings are never shown as scores; the subject sees their own history and can correct beliefs; consequential actions carry a reason + recourse.
- **Not an engagement machine.** A not-for-profit; the interaction serves the user, the signal is a byproduct.
- **Pair every "don't" with a "do".** Never a bare refusal, never implying the user is biased (D30).

## Status

Conceptual design across Groups 0–4 is substantially complete; nothing here is built beyond the Group 2 event-lifecycle code already on `main`. Known weaknesses, gaps, and inconsistencies are tracked in `open-risks.md` (the consolidation-critique defect list, with status), alongside `decisions.md` watch-items and each note's *Open questions*.
