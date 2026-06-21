# Debrief Loop — Design

## Overview

The debrief is the **dominant source of signal** in IRL. Onboarding seeds priors; debriefs are where the model actually learns, because they carry `observed` evidence — what happened, not what someone guessed about themselves. Every key projection (the comfort envelope, door weights, people affinities, crews) is refined here.

The central tension: debriefs must be **rich** (they feed the whole model) yet **low-friction** (they fire after every event, so a long one nobody finishes teaches nothing). The resolution is a **tiered** debrief — a fast, mostly tap-based core with a high completion rate, plus an optional conversational layer that goes deeper only when there's real signal to chase or the user wants to reflect.

A debrief is also three things at once: a **signal source**, a **coaching touchpoint** (the most natural one — reflecting on what happened is where the evidence-based perspectives land best), and a **safety surface** (a bad experience may be a report, not a preference).

This note designs the loop and its signal model. The exact prompt and JSON Schemas are a follow-up artifact (`debrief-prompt.md`), mirroring how `onboarding-interview.md` preceded `onboarding-prompt.md`. It extends the prototype debrief (`src/js/screens/debrief.js`).

## Principles

- **Completion rate is the asset.** A debrief that's skipped teaches nothing. Default to the shortest thing that captures real signal; earn depth, never demand it.
- **Observed signal dominates.** This is where the model learns. Debrief evidence is `observed` provenance and outranks `stated`/`inferred` under the precedence rules (`user-model.md`, D7).
- **Warm, not familiar.** Same voice as everywhere (D17): warmth is in the manner. The user feels heard because their input visibly changes what they're shown next — not because the agent performs empathy. No validation of how the event went.
- **People-data is the most sensitive signal.** "Want to see again" is the single strongest thing the model ever learns *and* the most sensitive — it's about another real person. It stays backstage, bound by the anti-observation principle (D11).
- **Safety is not signal.** "I didn't enjoy it" and "I felt unsafe" are different in kind. The second routes to reporting and care (Group 4), never into the preference model.
- **Honest calibration.** People mispredict what they'll enjoy. Capturing surprise-vs-expectation is high-value precisely because it tells the model where this person's self-prediction is wrong.

## Tiered structure

| Tier | What | LLM? | Most users |
|---|---|---|---|
| 0 | Did you go? (and, if not, a light "what got in the way?") | No | always |
| 1 | Fast core: how was it (worth another go?) + anyone you'd want to see again | No — deterministic taps | usually stop here |
| 2 | Optional depth: one or two adaptive follow-ups when there's signal to chase or the user wants to reflect; free text; at most one coaching aside | Yes — one extraction+follow-up call | sometimes |

Tier 0–1 is taps and needs no model call; the structured choices map directly to updates. Tier 2 is where an LLM call earns its keep: it generates a worthwhile follow-up (only when one exists), absorbs free text, extracts `observed` deltas, and may offer a single general perspective. Most debriefs are Tier 1; depth is voluntary or lightly invited, never forced.

**Outcome framing.** Not a 1–5 star. Stars anchor and teach little. Capture **repetition intent** — "worth another go?" — which is both more humane and directly actionable (it drives re-surfacing and is the seed of repetition-over-chemistry), plus per-person affinity. Texture ("too big," "nothing to do," "great company") is optional chips/text, not required.

## What it captures → how the model changes

| Captured | Model effect | Layer / provenance |
|---|---|---|
| Attendance / no-show + light reason | reliability; if no-show, a situational barrier | L2 barriers (`observed`) |
| Worth another go? | door confirmation; event-type outcome; re-surfacing | L2 doors, L3 outcomes (`observed`) |
| Want to see again (per attendee) | people-affinity edge; mutual = strongest, seeds crews | L3 relational (`observed`) |
| What worked / didn't (size, things-to-do, role, energy) | envelope nudges — comfort and growth-edge | L2 envelope (`observed`, higher confidence) |
| Surprise vs expectation | forecast-error calibration — where they mispredict | L2/L3 calibration |
| Free reflection | narrative append + LLM-extracted deltas | L1 + L2/L3 |

Because debrief evidence is `observed`, it dominates and decays the `stated`/`inferred` values onboarding set — e.g. someone who *said* "small groups only" but reports a big trivia night was great gets their `groupSize` comfort widened, and the growth-edge confirmed as working.

## Projection-update mechanism

A debrief emits a **`DebriefRecorded`** event on the `interaction#{userId}#{eventId}` aggregate (`event-sourcing.md`), carrying the raw debrief plus, when Tier 2 ran, the extracted deltas. A **projector** applies those deltas to the user's profile projection under the precedence rules (`observed > inferred > stated`, with decay and a `sourceRef` back to the event). Per D7, the conflict-resolution mechanism starts as **per-contribution judgment calls** and is otherwise TBD.

- **Per-debrief** updates the individual's projection (Tier-2 extraction is one cheap call; Tier-0/1 maps deterministically).
- **Batched, aggregate** analysis across users is a *separate* loop — the model-evolution governance (`user-model.md` → Model evolution): de-identified, surfaces new candidate dimensions, never per-person.

The profile-projection store shape (single document vs. per-dimension items) is the open question shared with `user-model.md`; it most affects how cleanly these deltas apply.

## People affinity & the anti-observation principle

"Want to see again" is the strongest signal and the most ethically loaded. Rules:

- **Backstage only — no "who liked you."** Affinity is never surfaced to the other person as a like/score. A "who wants to see me again" feed would import exactly the dating-app dynamics IRL exists to avoid, and would be an observation vector (D11). Mutual affinity instead *quietly* raises the chance two people end up at the same suggested events — it influences ranking, it is never legible.
- **Positive-only capture; negative is never asked.** The debrief only ever offers a positive affordance ("anyone you'd want to see again?"); there is no per-person "no" to give — grading people is exactly the dynamic we avoid. Negative is inferred conservatively (e.g. repeated non-selection over time), never solicited, never shown to either party, and only soft-deprioritizes co-suggestion. It is distinct from a block (Group 4).
- **Mutual seeds crews.** Repeated mutual affinity among 3–4 people is the seed of crew detection (Group 3) — surfaced as a gently strengthening cluster, not as "these people like each other."
- **Anti-observation.** Affinity data must never let one user infer another's attendance, feelings, or movements. The feature is designed around preventing that inference.

## Safety surface

A debrief can surface harm, not just disappointment. The loop must **distinguish "I didn't enjoy it" from "I felt unsafe,"** and route the second to the reporting and support path (Group 4) with care — never fold it into preference signal, never treat a person who behaved badly as merely "didn't click." This is a first-class branch of the debrief, handled gently and without making the user do investigative work. (Mechanism is Group 4; the branch is fixed here.)

## Coaching at the debrief

The most natural coaching moment — but the same restraint (D14, D17): warm-not-familiar, no validation, at most one *general* perspective, only when it fits.

- **Lukewarm event:** a general aside, not advice — "the second time is often easier than the first."
- **Good event:** usually nothing; occasionally a light "things like this tend to be worth a repeat."
- **No-show:** no guilt, no lecture. Normalize and move on; the barrier is signal, not a failing.
- **Never** "you should…", never a reaction to their feelings.

## Timing & triggering

- Fires when the event is **over** (event lifecycle, Group 2; workshop mode can simulate the clock).
- A gentle prompt, **one** reminder at most, then it lapses. No nagging — IRL is not an engagement machine.
- A lapsed debrief is itself mild signal (mild disengagement or a barrier), but absence is weak evidence; don't over-read it.

## Flow in detail

The loop has a **fast path** (taps only, no model call, instant) and a **deep path** (one extraction/follow-up call), with a **safety door** available throughout.

```
event over
   │
   ▼
gentle prompt ──ignored──▶ one reminder ──ignored──▶ lapse (mild, weak signal)
   │
   ▼
[0] Did you go?
   ├─ No  ─▶ what got in the way? (optional chips/text) ─▶ brief close          ← no LLM
   └─ Yes
        ▼
[1] Worth another go?   (yes / maybe / not for me)
        ▼
[1] Anyone you'd want to see again?   (tap attendees; positive-only)
        │                              └ "did anything not feel right?" ─▶ SAFETY (Group 4)
        ▼
[1] (optional) a couple of texture chips   (too big / nothing to do / …)
        ▼
   depth worth it?  ──no──▶ close: templated, warm, real-event next step         ← no LLM
        │ yes, or user taps "say more"
        ▼
[2] one or two adaptive follow-ups (free text) + ≤1 general aside ─▶ close        ← LLM
        ▼
   extract observed deltas ─▶ DebriefRecorded ─▶ projector (precedence)
```

### Steps (voice = warm, not familiar; no commentary on how it went)

- **[0] Did you go?** — "Did you make it to the trail walk?" → *Yes* / *Couldn't make it*.
  - **No** → "No worries — what got in the way?" optional chips (timing, distance, energy, nerves, plans changed) + optional text → brief close ("Got it, thanks — I'll keep that in mind."). No guilt. The reason is a situational barrier (`observed`).
- **[1a] Worth another go?** — "Worth doing again?" → *Yes* / *Maybe* / *Not for me*. Outcome + repetition intent in one. ("Not for me" is fit, not a verdict on the event.)
- **[1b] See again?** — "Anyone you'd want to cross paths with again?" Attendee chips (first names + avatars), tap to mark. **Positive-only** — untapped is just neutral, there is no "no" to give. Beside it, a quiet, separate door: *"Did anything not feel right?"* → routes to the safety/support path (Group 4), handled with care. Safety is never a per-person red flag inside the affinity UI; it's its own calm affordance.
- **[1c] Texture (optional)** — "Anything stand out?" optional chips (too big / too small / nothing to do / liked having a role / hard to break in / great company). Maps to envelope hints deterministically.

### When depth (Tier 2) is invited

Only when it would yield real signal — otherwise skip straight to the close:

- *Maybe* / *Not for me* → "what would've made it better?" (envelope / barrier)
- a texture chip implying a mismatch ("too big," "nothing to do") → confirm and expand it
- something worth a calibration check → "anything surprise you?"
- the user taps **"say more"**

Cap at one or two short follow-ups. **Don't probe *why* they liked a specific person** — that's intrusive, and the affinity tap is already enough.

### The LLM boundary (cost/latency)

- **Fast path: zero model calls.** Tiers 0–1 are taps; the structured answers map to updates deterministically, and the close is templated (warm, with a real-event next step pulled from the feed). This is the common case — instant and free.
- **Deep path: one call (rarely two).** Tier 2 generates the follow-up, absorbs free text, may add a single general aside, and the same pass extracts the `observed` deltas and writes the close. Bounded on purpose.

### Two walkthroughs

**Fast path — after the pottery night.**
- Did you go? → *Yes* · Worth another go? → *Yes* · See again? → taps *Priya* · texture → *great company*
- Close (templated): "Thanks — that helps. I'll keep small, hands-on evenings like this near the top."
- No model call. Deltas: affinity +Priya; repetition yes; envelope confirms small / activity-anchored.

**Deep path — after a big mixer tried as a stretch.**
- Did you go? → *Yes* · Worth another go? → *Maybe* · See again? → (none) · texture → *too big*, *hard to break in*
- Depth triggered (maybe + mismatch). Follow-up: "What would've made it easier?" → "If I'd had a job to do. Standing around with a drink isn't me."
- Close: "Got it. I'll steer you toward things with a task to them, and keep the big open ones off your list."
- One call. Deltas (`observed`): role = wants-a-job (strengthen); groupSize comfort stays small, the big-group growth-edge isn't landing *yet*; barrier "open mingling"; useful door confirmed.

The close earns "felt heard" through **action** ("I'll look for X next"), never through validation.

## Schema sketches

Exact schemas live in the forthcoming `debrief-prompt.md`. Shape:

**Capture** (mostly deterministic; most fields optional — Tier 1 is `attended` + `outcome`/`again` + `people`):

```jsonc
{
  "attended": true,
  "noShowReason": "string?",                 // light, situational
  "again": "yes | maybe | no",               // repetition intent (not a star rating)
  "outcomeTexture": ["too-big", "nothing-to-do", "great-company"],  // optional chips/text
  "people": [
    { "attendeeId": "string", "seeAgain": "yes | neutral" }          // positive-only; no per-person "no"
  ],
  "surprise": "string?",                     // optional
  "reflection": "string?",                   // optional free text → Tier 2
  "feltUnsafe": false                        // routes to safety, NOT signal
}
```

**Extracted deltas** (Tier 2 LLM output; all `observed`, each with `sourceEventId`):

```jsonc
{
  "envelopeUpdates": [
    { "dimension": "groupSize", "observation": "string", "direction": "widen | confirm | narrow",
      "confidence": "low | medium | high", "sourceEventId": "string" }
  ],
  "doorUpdates": [ /* … */ ],
  "interestUpdates": [ /* … */ ],
  "affinityEdges": [ { "attendeeId": "string", "valence": "positive | negative", "sourceEventId": "string" } ],
  "eventTypeOutcome": { "eventType": "string", "energized": true },
  "forecastError": { "predicted": "string", "actual": "string" },
  "narrativeAppend": "string"
}
```

## Decisions

- **Tiered debrief** — fast tap core (no LLM) + optional AI depth (one call); outcome framed as repetition-intent and affinity, not star ratings.
- **People-affinity is backstage only** — no "who liked you," negative invisible, mutual quietly shapes co-suggestion and seeds crews, bound by anti-observation.
- **Safety ≠ signal** — unsafe experiences route to reporting/care (Group 4), never into the preference model.
- **Debrief evidence is `observed`** and dominates `stated`/`inferred` (applies D7; debrief is the main observed source).

## Open questions

- Exactly how mutual affinity shapes ranking/co-attendance while staying illegible — needs care; Group 3 matching.
- Whether to capture *predicted* enjoyment at RSVP (to measure forecast error precisely) — real calibration value vs. added friction.
- Profile-projection store shape (shared with `user-model.md`) — single doc vs. per-dimension items; affects delta application.
- Per-debrief vs. batched projection updates at scale — start per-debrief; revisit if volume bites.
- Reminder cadence and how much (if anything) to infer from a lapsed debrief.
- Crew-detection threshold and surfacing (Group 3) — its own design.
- `debrief-prompt.md` — the exact follow-up prompt + JSON Schemas, once this design is agreed.
