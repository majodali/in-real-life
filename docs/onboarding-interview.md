# AI-Guided Onboarding Interview — Design

## Overview

The onboarding interview replaces the scripted Q&A (`src/js/screens/onboarding.js`) with a real, adaptive conversation driven by Claude. The experience is built on three settled forks:

- **Adaptive cards** — Claude picks the next prompt from the answers so far; the UI presents one card at a time; each turn is a server call.
- **Multi-door (purpose-aware)** — the interview detects what draws the user in (being *useful*, *making/learning* something, *connecting* with people) and orients around it rather than running a fixed catalogue.
- **Seed now, grow later** — onboarding gently opens the door and ends on a concrete next step; the AI's understanding deepens over time through debriefs and reactions to events, not all up front.

Technically this is a **workflow, not an agent**: a code-controlled loop of per-turn structured LLM calls. Claude executes no external tools, so the right primitive is **structured outputs**, not a tool-use loop. (If we later let users *propose an event* from within the interview, that step becomes a real tool — but the interview itself does not need one.)

## Principles

- **Motivate, don't catalogue.** Every card should move the user toward showing up, not just collect attributes.
- **Frozen system prompt.** Persona, the six conversational principles, door logic, and schema guidance live in a byte-stable system prompt. Per-user content (the transcript) lives in `messages`, never interpolated into the system prompt.
- **Per-turn calls are ephemeral.** The interview's intermediate calls are stateless transformations. They are **not** written to the event log.
- **One event on completion.** When the interview ends, a single `OnboardingCompleted` event carries the full transcript *and* the extracted structured profile. Debriefs and event-reactions later emit their own events that update the structured-profile projection — that is what "grow later" means.
- **Everything provisional.** The structured profile is a projection that evolves; nothing extracted at onboarding is treated as final.

## Conversation flow

```
client holds transcript ──┐
                          ▼
   POST /me/interview/turn  (transcript so far)
                          │
                          ▼
   API Lambda → Claude (frozen system prompt + transcript)
                          │
            structured output per turn:
              { done: false, card: { prompt, subtext?, helpers?[], door } }
                          │
            …repeat until…
              { done: true, closing: { message, suggestedNextStep } }
                          │
                          ▼
   final extraction call → structured profile
                          │
                          ▼
   emit OnboardingCompleted { transcript, profile }
```

The transcript is held client-side during the interview and re-posted each turn; nothing is persisted server-side until completion. This keeps per-turn Claude calls ephemeral and the event log clean, and confines in-flight PII to the client and the live request.

## Claude API request design

| Setting | Value | Rationale |
|---|---|---|
| Model | `claude-opus-4-8` | Warmth, judgment, and multi-door detection are exactly Opus 4.8's strengths. Cost is cents per onboarding. A/B against Haiku 4.5 / Sonnet 4.6 later if turn latency needs trimming. |
| Mechanism | Structured outputs (`output_config.format`) | No external tools to execute. JS SDK: `client.messages.parse({ output_config: { format: zodOutputFormat(Schema) } })` → `response.parsed_output`. |
| Thinking | `thinking: { type: "adaptive" }` + `output_config: { effort: "low" }` (tune to `medium`) | Keeps turns snappy. Leave adaptive *on* — with thinking disabled, Opus 4.8 can leak reasoning into the visible response. Structured outputs are compatible with adaptive thinking. |
| `max_tokens` | ~1024 | Each card is small. Keeps every turn well inside the Lambda 30s / API Gateway 29s ceiling. |
| Streaming | **Non-streaming** | Outputs are tiny and the UI reveals one finished card at a time. True browser streaming would require Lambda response-streaming (Function URLs) for no real benefit. |
| Caching | `cache_control: { type: "ephemeral" }` on the system block | Turns within a session are seconds apart, so turns 2..N read the system prompt from cache (~0.1× cost); shared across concurrent users. Verify via `usage.cache_read_input_tokens`. |

**Caching caveat:** the minimum cacheable prefix on Opus 4.8 is **4096 tokens**. If the system prompt lands under that, it silently won't cache (no error, just `cache_creation_input_tokens: 0`). Either keep the prompt rich enough to clear the floor or accept uncached reads — it's small and cheap either way.

**SDK:** use the official `@anthropic-ai/sdk` (Node 20 Lambda). This adds a bundled dependency to the API Lambda, which today ships dependency-light (AWS SDK v3 only). Raw `fetch` to `/v1/messages` is a viable fallback to keep the Lambda dep-free, but the official SDK is preferred.

**Real-event grounding:** examples and the closing next-step must be grounded in real events, never invented (finding #3). The server injects a short, tiered events list — this locality first, then nearby areas, then a few canonical fallbacks — into the interview context (in `messages`, not the frozen system block). The interviewer draws example names only from that list; the close records which it used in `closing.exampleEventRefs`. See `onboarding-prompt.md` → *Using real examples* / *Runtime context*.

## Extraction schema

The conceptual model behind the extracted profile — the three layers, the comfort envelope, provenance rules, and the compatibility stance — is defined in `user-model.md`. The extraction call produces the onboarding slice of it:

```jsonc
{
  // Layer 1 — narrative (source of truth; prose, user's words + faithful paraphrase)
  "narrative": {
    "selfDescription": "string",
    "goal": "string",
    "stories": [{ "prompt": "string", "told": "string" }]
  },

  // Layer 2 — derived index; every value carries provenance + confidence
  "doors": [{ "door": "useful | make-learn | connect", "weight": 0.6, "provenance": "inferred", "confidence": "medium" }],
  "interests": [{ "tag": "string", "weight": 0.8, "storyRef": 0, "provenance": "stated", "confidence": "high" }],
  "strengthsToOffer": [{ "what": "string", "storyRef": 1, "provenance": "inferred", "confidence": "medium" }],
  "envelope": {
    "groupSize":   { "comfort": "intimate | small | large", "growthEdge": "string?", "provenance": "inferred", "confidence": "low" },
    "structure":   { "comfort": "activity-anchored | open | either", "provenance": "inferred", "confidence": "low" },
    "familiarity": { "comfort": "strangers-ok | needs-known-face", "provenance": "inferred", "confidence": "low" },
    "role":        { "comfort": "wants-a-job | happy-to-attend | either", "provenance": "inferred", "confidence": "low" },
    "energy":      { "frequency": "weekly | biweekly | monthly", "provenance": "stated", "confidence": "medium" }
  },
  "constraints": { "timeWindows": ["..."], "maxTravel": "string?", "accessibility": "string?" },
  "barriers": [{ "what": "string", "provenance": "stated" }],   // situational, never deficits

  // Layer 3 starts empty — populated only by lived signal (debriefs, attendance)
  "provisional": true
}
```

The per-turn card schema is separate and minimal: `{ done, card?, closing? }` as shown in the flow above. Interview question style follows the elicitation table in `user-model.md` — episodes and externalized strengths, never trait ratings.

The exact JSON Schemas for both calls, the card skeleton, and the interviewer system prompt live in `onboarding-prompt.md` (the source of truth for those artifacts).

## Privacy

Interview content is PII and is crypto-shredded in the event log per the event-sourcing design. Sending it to Claude is **external processing**. The API key is already in Secrets Manager and wired through the API Lambda, but the data-handling posture (e.g. whether this warrants an Anthropic zero-retention arrangement) is an explicit launch decision, not a default.

## Decisions

- Model: **Opus 4.8** as the starting default.
- State: **ephemeral per-turn calls + a single `OnboardingCompleted` event** (transcript + structured profile), rather than per-turn `InterviewTurnRecorded` events.
- Mechanism: **structured outputs**, not tool use.
- Events: **`OnboardingCompleted` is a distinct event type**, separate from `UserProfileCreated`.
- Streaming: **non-streaming** server-side.

## Open questions

- Exact system-prompt content for the persona and the six principles (warm tone, multi-door detection, normalize challenge, motivate-not-catalogue, brevity for cards, end-on-next-step).
- Anthropic data-retention posture for interview content.
- How the structured-profile projection is stored and how debrief/event-reaction events mutate it (the "grow later" wiring — likely its own design note under Group 3).
- Cold-start system-prompt token budget vs. the 4096-token cache floor.
