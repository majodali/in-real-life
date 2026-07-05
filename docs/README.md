# IRL Design Notes

Design notes for **in·real·life** — a local community meetup app: AI-guided onboarding, discover nearby events and people, coordinate real-world meetups. Privacy-focused (first names only, no messaging — just show up).

These notes are **living and provisional** — current best decisions, revisable as real usage teaches us. `decisions.md` is the map: a register of every decision (D1–D36) with a one-line pointer to the note that holds the reasoning, plus watch-items for emergent effects we're tracking.

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

**Start:** `decisions.md` (the register) · this README.

**Foundations (Group 0)**
- `event-sourcing.md` — hybrid event sourcing: event log + synchronous state tables, replay, crypto-shredding, tracing.
- `workshop-mode.md` — one codebase, two modes (production / workshop); time manipulation, gate bypass.
- `projection-store.md` — the derived read-model (`irl-user-model`): async Streams projection, per-item rows, where precedence/decay lives.

**The person (Groups 1 & 3)**
- `user-model.md` — model situations not traits; three layers (narrative / annotated index / earned relational); the comfort envelope; compatibility stance; *difference is not incompatibility* + demographic affinity lives on the event.

**Onboarding (Group 1)**
- `onboarding-interview.md` — architecture of the adaptive interview (per-turn structured calls, Opus 4.8).
- `onboarding-prompt.md` — the interviewer system prompt + exact JSON schemas.

**The event experience & feedback (Group 2)**
- `debrief.md` — the dominant signal source; information-first, tiered, low-friction; people step; safety + policy feedback paths.
- `organizer-engagement.md` — organisers as first-class; framing help, responsibility gates, organiser debrief.
- `event-policy.md` — what belongs on IRL: honesty + non-coercion, not subject matter.

**Understanding & guidance (Group 3)**
- `reflection-and-coaching.md` — the optional deeper modes the debrief opens a door to; skills development; the reframe library.
- `coaching-and-engagement.md` — the global AI voice (warm-not-familiar, "we", no persona), the coaching model, active engagement.

**Matching & recommendation (Group 3)**
- `matching.md` — how fit, affinity, rating, crews, constraints, avoidance, and newcomer status combine into what a member sees; fit-first, bounded soft nudges, exploration/inclusion floor; the definitions + influence map; the gaming/negative-scenario register.

**Trust & safety (Group 4)**
- `contributor-rating.md` — a private, backstage, multi-faceted trust read; informs, never dominates.

## Cross-cutting principles (the spine of the whole design)

- **Warm, not familiar; "we", not "I"; no persona.** One voice across every AI surface — warmth is in the manner, never manufactured rapport (D15, D17, D23).
- **Model situations, not traits; stories, not ratings; observed beats stated.** (D6, D7)
- **Compatibility is not a goal.** Constraints + weak priors + revealed signal, never a score; difference is bridged, not sorted by; demographic affinity lives on the event, never the user (D8, D9, D28).
- **Backstage and legible.** Beliefs and ratings are never shown as scores; the subject sees their own history and can correct beliefs; consequential actions carry a reason + recourse.
- **Not an engagement machine.** A not-for-profit; the interaction serves the user, the signal is a byproduct.
- **Pair every "don't" with a "do".** Never a bare refusal, never implying the user is biased (D30).

## Status

Conceptual design across Groups 0–4 is substantially complete; nothing here is built beyond the Group 2 event-lifecycle code already on `main`. Known weaknesses, gaps, and inconsistencies are tracked in `open-risks.md` (the consolidation-critique defect list, with status), alongside `decisions.md` watch-items and each note's *Open questions*.
