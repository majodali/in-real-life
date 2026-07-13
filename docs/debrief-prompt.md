# Debrief Extraction — Prompt & Schema (v1)

The forthcoming-artifact companion to `debrief.md` (its "Schema sketches"
section is the source of intent). **v1 covers the extraction call only** —
the single Tier-2 call that turns a debrief's free text into observed
deltas. The *interactive* Tier-2 follow-up ("what would've made it
easier?") and the reflection/coaching conversation handling are future
sections; they involve the D14/D17/D30 voice rules and the reframe
library, and deserve their own pass.

Change process: this file is the source of truth for the prompt and
schema; `infrastructure/lambda/api/events/debrief-schema.mjs` mirrors it
verbatim. Change here first.

## When the call runs

At command time (one call, per `projection-store.md`: deltas ride in the
event; the projector stays LLM-free). Only when the debrief carries free
text worth extracting — `surprise` or `reflection` non-empty. Tap-only
debriefs (the overwhelming majority) never spend a call: attendance,
repetition intent, texture chips, and the people step map
deterministically.

Never when `conductConcern` is set: the quarantine (open-risks #11)
suppresses that event's preference deltas entirely, so there is nothing
to extract.

## System prompt

```
You extract observed signal from a member's post-event debrief for a
community meetup app. You receive the event context, the member's taps
(repetition intent, texture chips), and their free text.

Extract ONLY what the member's own words support - these become
"observed" evidence that outranks what they once said about themselves,
so restraint matters more than coverage. Do not invent conditions,
interests, or feelings. When the text supports a comfort-envelope
update, prefer capturing the CONDITION under which it held ("bigger was
fine BECAUSE the food gave everyone something to talk about") over a
blanket change. An empty array is the right answer when the text
teaches nothing on a dimension.

Never extract anything about other people's conduct or character, and
nothing that reads as a safety concern - that travels a different
channel. Follow the JSON schema exactly.
```

## Extraction schema

Deliberately narrower than the full sketch in `debrief.md`: affinity
edges come from the people-step taps (deterministic, never the LLM),
`eventTypeOutcome` waits for the event-type register (Group 3), and
`narrativeAppend` is unnecessary — the debrief text itself stays on the
(crypto-shredded) event as Layer 1.

```jsonc
{
  "envelopeUpdates": [
    {
      "dimension": "groupSize | structure | familiarity | role | novelty | energy",
      "observation": "string",          // what the text actually showed
      "condition": "string?",           // the circumstances it held under
      "direction": "widen | confirm | narrow",
      "confidence": "low | medium | high"
    }
  ],
  "interestUpdates": [
    { "tag": "string", "direction": "strengthen | confirm | weaken",
      "observation": "string", "confidence": "low | medium | high" }
  ],
  "barrierUpdates": [
    { "what": "string", "direction": "observed | easing",
      "observation": "string" }
  ],
  "forecastError": {                     // only when surprise text shows one
    "predicted": "string", "actual": "string"
  }
}
```

All fields optional; the projector stamps provenance `observed`, `asOf`
(simulated time), and `sourceEventId` — the model never asserts
provenance.
