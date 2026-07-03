# Debrief Loop — Design

## Overview

The debrief is the **dominant source of signal** in IRL. Onboarding seeds priors; debriefs are where the model actually learns, because they carry `observed` evidence — what happened, not what someone guessed about themselves. Every key projection (the comfort envelope, door weights, people affinities, crews) is refined here.

The central tension: debriefs must be **useful** (they feed the whole model) yet **low-friction** (they fire after every event, so a long one nobody finishes teaches nothing). The resolution is a **tiered** debrief — a fast, mostly tap-based core with a high completion rate, plus an optional deeper layer.

The most important framing: **the debrief is *information*.** It is deliberately kept distinct from two deeper, optional activities — **reflection** and **coaching** — which the debrief can open a door to but never performs inline. Merging them is what makes an interaction chatty, falsely familiar, and prone to over-promising. The debrief's job is to capture crisply, notice when a door to reflection has opened, and otherwise get out of the way. It is also a **safety surface** (a bad experience may be a report, not a preference).

This note designs the loop and its signal model. The exact prompt and JSON Schemas are a follow-up artifact (`debrief-prompt.md`). It extends the prototype debrief (`src/js/screens/debrief.js`).

## Three activities, kept separate

| Activity | When | Character |
|---|---|---|
| **Debrief** (information) | after every event | crisp, factual, minimal; captures what happened; no empathy, no counsel, no over-promising |
| **Reflection** (optional) | only if the user pulls, or is clearly dwelling | a distinct conversational space where feelings, motivations, and challenges are natural; warm and understanding, but no manufactured connection |
| **Coaching** (conditional) | only from reflection, if appropriate | reached when a user stays fixed on negatives rather than learnings/outcomes; home of the evidence-based perspectives |

The debrief **recognises the doorway** to reflection but never walks the user through it uninvited. This separation is what keeps the debrief honest and light: information here, feelings there, guidance only if earned.

## Principles

- **Completion rate is the asset.** A debrief that's skipped teaches nothing. Default to the shortest thing that captures real signal; earn depth, never demand it.
- **Information first.** The debrief captures; it does not counsel. Warmth is in the manner — brief and plain — not in empathy performance, validation, or narrating what we'll do with the answer.
- **Observed signal dominates.** Debrief evidence is `observed` provenance and outranks `stated`/`inferred` under the precedence rules (`user-model.md`, D7).
- **Ask to refine only after a poor experience.** When something didn't land, we may ask the user to help us aim better. A good or pleasantly-surprising outcome we simply acknowledge — no refine-question, no steering negotiation.
- **People-data is the most sensitive signal.** "Want to see again" is the strongest thing the model learns *and* the most sensitive — it's about another real person. Backstage, bound by the anti-observation principle (D11).
- **Safety is not signal.** "I didn't enjoy it" and "I felt unsafe" are different in kind. The second routes to reporting and care (Group 4), never into the preference model.
- **Honest calibration.** People mispredict what they'll enjoy. Capturing surprise-vs-expectation tells the model where this person's self-prediction is wrong.

## What the debrief signals about matching

The user should understand, *lightly*, that their input helps IRL find better matches — but the debrief never narrates what it will do about it. Closes are minimal ("Thanks — we'll keep that in mind."). The one time we invite the user to help us refine is **after a poor experience**, and even then briefly, without promising specifics. Deeper collaboration on what they want belongs in reflection, not here.

## Tiered structure

| Tier | What | LLM? | Most users |
|---|---|---|---|
| 0 | Did you go? (and, if not, a light "what got in the way?") | No | always |
| 1 | Fast core: worth another go? · who did you meet / want to see again · optional texture | No — deterministic taps | usually stop here |
| 2 | Optional depth: a follow-up to capture *better information*, or the **doorway to reflection** | Yes — one call | sometimes |

Tier 0–1 is taps and needs no model call. Tier 2 spends a call to capture better information (a targeted follow-up after a poor result), or to open reflection if the user wants it. Coaching is not a "Tier-2 aside" — it lives in its own mode (below). Most debriefs are Tier 1.

**Outcome framing.** Not a 1–5 star — stars anchor and teach little. Capture **repetition intent** ("worth another go?"), which is humane and directly actionable (it drives re-surfacing and is the seed of repetition-over-chemistry).

## The people step — who you met, and who you'd see again

Two light taps over the attendee list, and it does real work:

- **Who did you actually meet?** Tap the people you connected or spent time with. This makes the debrief feel complete (especially at a large gathering where you met 3 of 20, or when someone didn't show), grounds affinity (you can only want to see again someone you met), and cross-validates who was really there.
- **Anyone you'd want to see again?** A positive-only second mark on the people you met. Untapped is neutral; there is no per-person "no."

## What it captures → how the model changes

| Captured | Model effect | Layer / provenance |
|---|---|---|
| Attendance / no-show + light reason | reliability; if no-show, a situational barrier | L2 barriers (`observed`) |
| Worth another go? | door confirmation; event-type outcome; re-surfacing | L2 doors, L3 outcomes (`observed`) |
| Who you met | grounds affinity; attendance cross-check | L3 relational |
| Want to see again | people-affinity edge; mutual = strongest, seeds crews | L3 relational (`observed`) |
| Texture (size, things-to-do, role, energy) | envelope nudges — comfort and growth-edge | L2 envelope (`observed`) |
| Surprise vs expectation | forecast-error calibration | L2/L3 calibration |
| Free reflection (if the user opens that door) | narrative append + LLM-extracted deltas | L1 + L2/L3 |

Because debrief evidence is `observed`, it dominates and decays the `stated`/`inferred` values onboarding set — someone who *said* "small groups only" but reports a big trivia night worked gets their `groupSize` comfort widened, with the **condition** attached (see calibration below).

## Projection-update mechanism

A debrief emits a **`DebriefRecorded`** event on the `interaction#{userId}#{eventId}` aggregate (`event-sourcing.md`), carrying the raw debrief plus, when Tier 2 ran, extracted deltas. A **projector** applies them under the precedence rules (`observed > inferred > stated`, with decay and a `sourceRef` back to the event). Per D7, conflict-resolution starts as **per-contribution judgment calls**.

- **Per-debrief** updates the individual's projection (Tier-2 extraction is one cheap call; Tier-0/1 maps deterministically).
- **Batched, aggregate** analysis across users is a *separate* loop — model-evolution governance (`user-model.md`): de-identified, surfaces candidate dimensions, never per-person.

The profile-projection store shape (single document vs. per-dimension items) is the open question shared with `user-model.md`.

## People affinity & the anti-observation principle

- **Backstage only — no "who liked you."** Affinity is never surfaced to the other person. A "who wants to see me again" feed would import the dating-app dynamics IRL exists to avoid, and would be an observation vector (D11). Mutual affinity instead *quietly* raises the chance two people land at the same suggested events — it influences ranking, never legibly.
- **Positive-only capture; negative is never asked.** No per-person "no." Negative is inferred conservatively (repeated non-selection over time), never solicited, never shown, and only soft-deprioritizes co-suggestion. Distinct from a block (Group 4).
- **Mutual seeds crews.** Repeated mutual affinity among 3–4 people seeds crew detection (Group 3) — a gently strengthening cluster, never "these people like each other."
- **Anti-observation.** Affinity data must never let one user infer another's attendance, feelings, or movements.

## Safety surface

A debrief can surface harm, not just disappointment. The loop **distinguishes "I didn't enjoy it" from "I felt unsafe,"** and routes the second to the reporting and support path (Group 4) with care — never folding it into preference signal, never treating a person who behaved badly as merely "didn't click." A first-class branch, handled gently, without making the user do investigative work.

> **Affordance (two-tier).** Entry — a calm, conduct-focused line: *"Did you have any concerns with anyone's conduct?"* On tap it becomes explicit and caring: *"If someone made you feel unsafe or uncomfortable, you can tell us what happened, or just talk to someone — whatever you prefer."* Calm on the surface; unambiguously the safety channel the moment it's engaged. Conduct-focused, not person-focused, so it reads as being about behaviour rather than "a problem with a person."

## Reflection & coaching (the separate modes)

These are where feelings, motivations, and challenges belong — not the debrief.

- **Reflection** is entered only by the user's pull ("say more"), or offered gently when the user is clearly dwelling on something. In it, discussing how an event felt, what they're after, or what's getting in the way is natural. Tone: warm and understanding, **grounded and honest, with no manufactured connection** — we don't construct rapport or empathise theatrically. A plain acknowledgment is enough.
- **Coaching** progresses from reflection *only if appropriate* — when a user stays fixed on negatives rather than learnings or outcomes. This is the home of the evidence-based perspectives (repetition over chemistry, side-by-side, contribution, we-mispredict, situational barriers), offered as general observations, ≤1, never as "you should…" (D14, D17).

The debrief's role toward these is only to **notice the doorway and open it**, never to drag the user through.

## When a user steers somewhere we won't go

Agency invites friction: a user may try to steer toward something we don't support — most importantly, limiting who they meet by age, gender, or ethnicity. This is **handled in reflection, not the debrief**. We hold the line (we don't sort by demographics, D9); the manner is everything:

- **A brief, plain acknowledgment — nothing more.** "That's fair to raise." Not "that's its own kind of hard" — we don't interpret, empathise, or manufacture a connection.
- **An honest, *grounded* rationale — no unprovable claims.** We can truthfully say it isn't how IRL works and that we couldn't promise it on an island this size. We do **not** assert empirical claims we can't back yet (e.g. "a filter misses the people you'd click with") — until we have real evidence to ground such statements ("in our experience…"), we don't make them.
- **Point back to what worked, from their own signal.** If the activity landed, that's the honest, concrete thing to lean on — not a demographic offer. (We explicitly do *not* offer "where newer people are landing": new people are any age, and it doesn't address the wish.)
- **No compromise, no judgment, no lecture.** A small reframe the user is free to ignore; if they stay stuck on the negative, that — and only that — is the opening to coaching.

Getting this wording right is **work to do**, and needs real-world validation.

## Timing & triggering

- Fires when the event is **over** (event lifecycle, Group 2; workshop mode can simulate the clock).
- A **last-minute "can't make it"** affordance exists before/at event time — cleaner signal than a silent skip (it separates "intended, dropped last-minute" from "forgot" or "never committed"). But a silent skip is fine too; the debrief will ask.
- A gentle prompt, **one** reminder at most, then it lapses. No nagging.
- A lapsed debrief is mild signal (disengagement or a barrier), but absence is weak evidence; don't over-read it.

## Flow in detail

Fast path (taps, no model call, instant) and a deep path (one call), with a safety door available throughout.

```
event over  (or: last-minute "can't make it" beforehand)
   │
   ▼
gentle prompt ──ignored──▶ one reminder ──ignored──▶ lapse (mild, weak signal)
   │
   ▼
[0] Did you go?
   ├─ No  ─▶ what got in the way? (optional chips/text) ─▶ minimal close        ← no LLM
   └─ Yes
        ▼
[1] Worth another go?   (yes / maybe / not for me)
        ▼
[1] Who did you meet?  →  anyone you'd want to see again?   (positive-only)
        │                    └ "any concerns with anyone's conduct?" ─▶ SAFETY (Group 4)
        ▼
[1] (optional) texture chips   (adaptive sequence)
        ▼
   poor experience?  ──no──▶ minimal close ("thanks, we'll keep it in mind")     ← no LLM
        │ yes → one follow-up to aim better;  or user taps "say more"
        ▼
[2] capture better info  ── or ──▶  open REFLECTION (feelings/motivations)  ← LLM
        │                                        └─(if user stays on negatives)─▶ COACHING
        ▼
   extract observed deltas ─▶ DebriefRecorded ─▶ projector (precedence)
```

### Steps (voice = warm, brief, plain; no commentary on how it went)

- **[0] Did you go?** — "Did you make it?" → *Yes* / *Couldn't make it*.
  - **No** → "No worries — what got in the way?" optional chips (timing, distance, energy, nerves, plans changed) + optional text → minimal close ("Got it, thanks."). No guilt. The reason is a situational barrier (`observed`).
- **[1a] Worth another go?** — → *Yes* / *Maybe* / *Not for me*. Outcome + repetition intent in one.
- **[1b] People** — "Who'd you end up meeting?" tap attendees you connected with; then a second, positive-only mark for "want to see again." Beside it, a separate, calm conduct affordance — *"Did you have any concerns with anyone's conduct?"* → routes to Group 4 with care (see *Safety surface*). Never a per-person red flag inside the affinity UI.
- **[1c] Texture (optional)** — "Anything stand out?" optional chips; first of an adaptive sequence (below).

### Adaptive chip sequences

Chips are not one fixed set. They adapt to the event type and prior taps, and can unfold as a **short sequence of sets, each opt-in**: a light texture set first; then, only if the user engages, a "what made the difference?" set. Deeper reflective prompts do **not** live in the chip sequence — if the user is leaning in that far, that's the doorway to reflection, handled as a conversation, not a chip. Stopping is always the default.

Sequencing is **rule-based for now** (event type + prior answers), so the fast path stays model-free. Sets **will evolve** — a chip people keep reaching for is a candidate new dimension (`user-model.md`).

### When depth (Tier 2) is invited

Only when it yields real signal — otherwise go straight to the minimal close:

- *Maybe* / *Not for me* → one follow-up to aim better ("what would've made it easier?")
- a texture chip implying a mismatch → confirm and expand it
- something worth a calibration check → "anything surprise you?"
- the user taps **"say more"** → this may open reflection

**Don't probe *why* they liked a specific person** — intrusive, and the affinity tap already carries it.

### The LLM boundary (cost/latency)

- **Fast path: zero model calls.** Tiers 0–1 map deterministically; the close is templated and minimal.
- **Deep path: one call (rarely two).** A follow-up to capture better information, plus delta extraction and the close; or the entry into a reflective conversation.

### Walkthroughs

**Fast, positive (pottery).** Go? *Yes* · Again? *Yes* · met *Priya* → see again *Priya* · texture *great company*.
→ Close: **"Thanks — we'll keep that in mind."** No model call. Deltas: met/affinity +Priya; repetition yes; envelope confirms small / activity-anchored.

**Poor-ish, growth-edge (big mixer, tried as a stretch).** Go? *Yes* · Again? *Maybe* · met (a couple), see again (none) · texture *too big*, *hard to break in*.
→ Poor result → one follow-up: "What would've made it easier?" → "If I'd had a job to do." → Close: **"Got it — that helps us aim better."** One call. Deltas (`observed`): role = wants-a-job (strengthen); big-group growth-edge not landing *yet*; barrier "open mingling."

**Positive surprise (big community dinner, a stretch for a small-group person).** Go? *Yes* · Again? *Yes* · texture *bigger than I'd like* + *great company* · surprise: "figured it'd be too much, but the food gave everyone something to talk about."
→ Close: **"Good to know — thanks."** (A good outcome; we don't refine or negotiate.) Deltas: forecastError captured; the growth-edge lands **with the condition** *shared focus*, not "bigger is fine."

**Steering, via reflection (pottery, Mara).** Go? *Yes* · Again? *Maybe* · met (none marked) · texture *loved the activity*. She taps "say more": "the clay was great. it's just — everyone was 60+. can you find me ones with people my age?"
→ This opens **reflection**, handled per *When a user steers…*: **"That's fair to raise. We don't match by age, though — it's not how IRL works, and on an island this size we couldn't promise it anyway. The clay part landed, going by your answers — that's the kind of thing we'll lean on."** Plain acknowledgment, grounded rationale, no manufactured connection, no over-promise, no demographic offer. If she stays fixed on the age point, *that* is the opening to a gentle coaching perspective — not before.

## Schema sketches

Exact schemas live in the forthcoming `debrief-prompt.md`.

**Capture** (mostly deterministic; Tier 1 is `attended` + `again` + `people`):

```jsonc
{
  "attended": true,
  "lastMinuteCantMake": false,               // set via the pre-event affordance
  "noShowReason": "string?",                 // light, situational
  "again": "yes | maybe | no",               // repetition intent (not a star rating)
  "outcomeTexture": ["too-big", "nothing-to-do", "great-company"],  // optional chips/text
  "people": [
    { "attendeeId": "string", "met": true, "seeAgain": "yes | neutral" }  // met grounds affinity; positive-only
  ],
  "surprise": "string?",                     // optional
  "reflection": "string?",                   // optional free text → may open reflection
  "conductConcern": false                    // routes to safety/care, NOT signal
}
```

**Extracted deltas** (Tier 2 LLM output; all `observed`, each with `sourceEventId`):

```jsonc
{
  "envelopeUpdates": [
    { "dimension": "groupSize", "observation": "string", "condition": "string?",
      "direction": "widen | confirm | narrow", "confidence": "low | medium | high", "sourceEventId": "string" }
  ],
  "doorUpdates": [ /* … */ ],
  "interestUpdates": [ /* … */ ],
  "affinityEdges": [ { "attendeeId": "string", "valence": "positive", "sourceEventId": "string" } ],
  "eventTypeOutcome": { "eventType": "string", "energized": true },
  "forecastError": { "predicted": "string", "actual": "string" },
  "narrativeAppend": "string"
}
```

## Decisions

- **Debrief is information, kept separate from reflection and coaching.** It captures crisply and opens a door to the deeper modes, but never performs them inline.
- **Tiered debrief** — fast tap core (no LLM) + optional depth (one call); outcome = repetition-intent + affinity, not star ratings.
- **Minimal closes; refine only after a poor experience.** A good or pleasantly-surprising outcome is simply acknowledged.
- **People step captures "who you met" then positive-only "see again."**
- **People-affinity is backstage only** — no "who liked you"; positive-only; negative inferred, never shown; mutual seeds crews; anti-observation.
- **Safety ≠ signal** — routes to reporting/care (Group 4); the event's preference signal is quarantined when a conduct concern is raised.
- **Steering handled in reflection** — plain acknowledgment, grounded (no unprovable claims), no compromise, no demographic offer.

## Open questions

- How the debrief *detects* that reflection's door has opened (explicit "say more" only, or also gentle offer when a user is dwelling) — and how the reflective conversation is structured. Its own follow-on design.
- How mutual affinity shapes ranking/co-attendance while staying illegible — Group 3.
- Whether to capture *predicted* enjoyment at RSVP (precise forecast error vs. friction).
- When we can honestly *ground* the difference rationale in real experience ("in our experience…") — needs data; until then, policy + practical constraint + the user's own signal only.
- Profile-projection store shape (shared with `user-model.md`).
- Reminder cadence; how much to infer from a lapse.
- `debrief-prompt.md` — exact prompt + schemas (debrief) and the reflection/coaching handling, once agreed.
