// LLM seam (D37) — the injected Claude provider.
//
// Every AI surface calls Claude at command time through this one interface:
//
//   llm.complete({ task, system, messages, schema, maxTokens })
//     → parsed object (when schema is given) or text
//
// Production wires createRealLlmProvider — the Claude API over HTTPS with the
// key fetched lazily via the injected getApiKey (Secrets Manager in the
// composition root). Workshop and test wire createStubLlmProvider —
// deterministic, schema-valid canned outputs keyed by `task`: no network, no
// key, fast and replayable. See docs/workshop-mode.md (D37) and llm.test.mjs.

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_API_URL = 'https://api.anthropic.com/v1/messages';

export function createRealLlmProvider({
  getApiKey,
  fetchFn = globalThis.fetch,
  model = DEFAULT_MODEL,
  apiUrl = DEFAULT_API_URL,
}) {
  let cachedKey;
  async function apiKey() {
    if (cachedKey === undefined) cachedKey = await getApiKey();
    return cachedKey;
  }

  return {
    // `task` is part of the seam interface (the stub dispatches on it);
    // the real provider works purely from system/messages/schema/effort.
    async complete({ system, messages, schema, maxTokens = 4096, effort }) {
      // Adaptive thinking stays on: with thinking disabled, Opus 4.8 can
      // leak reasoning into the visible response (onboarding-interview.md).
      const outputConfig = {
        ...(schema !== undefined && { format: { type: 'json_schema', schema } }),
        ...(effort !== undefined && { effort }),
      };
      const body = {
        model,
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },
        messages,
        ...(system !== undefined && { system }),
        ...(Object.keys(outputConfig).length > 0 && { output_config: outputConfig }),
      };

      const res = await fetchFn(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': await apiKey(),
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`llm request failed: ${res.status} ${detail}`.trim());
      }

      const out = await res.json();
      if (out.stop_reason === 'refusal') {
        throw new Error('llm request refused');
      }
      if (out.stop_reason === 'max_tokens') {
        throw new Error('llm response truncated at max_tokens');
      }
      const text = (out.content || []).find((b) => b.type === 'text')?.text;
      if (text === undefined) {
        throw new Error('llm response had no text block');
      }
      return schema !== undefined ? JSON.parse(text) : text;
    },
  };
}

// Canned Layer-2 extraction for the workshop/test stub — schema-valid against
// ONBOARDING_EXTRACTION_SCHEMA (docs/onboarding-prompt.md → Extraction schema).
export const STUB_ONBOARDING_EXTRACTION = {
  narrative: {
    selfDescription:
      'Canned workshop member: recently moved to the island, looking to meet a few people.',
    goal: 'Find one or two regular activities with familiar faces.',
    stories: [
      {
        prompt: 'Tell me about a recent time being around people felt easy',
        told: 'A small pottery class where everyone had something to do with their hands.',
      },
    ],
  },
  doors: [{ door: 'connect', weight: 0.7, provenance: 'stated', confidence: 'medium' }],
  interests: [
    { tag: 'pottery', weight: 0.8, storyRef: 0, provenance: 'stated', confidence: 'medium' },
  ],
  strengthsToOffer: [],
  envelope: {
    groupSize: { comfort: 'small', provenance: 'inferred', confidence: 'medium' },
    structure: {
      comfort: 'activity-anchored',
      growthEdge: 'open-conversation',
      provenance: 'inferred',
      confidence: 'low',
    },
    familiarity: { comfort: 'needs-known-face', provenance: 'inferred', confidence: 'low' },
    role: { comfort: 'happy-to-attend', provenance: 'inferred', confidence: 'low' },
    novelty: { comfort: 'prefers-ritual', provenance: 'inferred', confidence: 'low' },
    energy: {
      capacity: 'one evening at a time',
      frequency: 'weekly',
      provenance: 'stated',
      confidence: 'medium',
    },
  },
  constraints: { timeWindows: ['weekday-evenings'] },
  barriers: [{ what: 'walking into rooms of strangers', provenance: 'stated' }],
  provisional: true,
};

// Canned interviewer turn for the workshop/test stub — a fixed short script
// keyed off how many member turns appear in the request, so a driven loop
// deterministically reaches done: true. Schema-valid against
// INTERVIEW_TURN_SCHEMA (docs/onboarding-prompt.md → Per-turn card schema).
export function stubOnboardingTurn(request) {
  const content = request?.messages?.[0]?.content ?? '';
  const memberTurns = (content.match(/^member:/gm) || []).length;

  if (memberTurns >= 3) {
    return {
      done: true,
      doorRead: 'connect',
      closing: {
        message: 'Thanks — that gives us a real sense of what suits you. '
          + 'We’ll look for small, easygoing things to start with.',
        nextStep: 'Browse what’s coming up and tap one that looks easy.',
        exampleEventRefs: [],
      },
    };
  }

  const cards = [
    {
      prompt: 'Welcome — what would you love more of in your week?',
      subtext: 'No wrong answers; whatever comes to mind.',
      inputType: 'text',
      probing: ['door', 'open'],
    },
    {
      prompt: 'Tell us about a recent time being around people felt easy.',
      inputType: 'text',
      probing: ['group-size', 'structure', 'role', 'familiarity'],
    },
    {
      prompt: 'How often would getting out feel right — without it becoming a chore?',
      helpers: ['Weekly', 'Every couple of weeks', 'Monthly'],
      inputType: 'single-choice',
      probing: ['energy', 'constraints'],
    },
  ];
  return {
    done: false,
    doorRead: memberTurns === 0 ? 'unclear' : 'connect',
    card: cards[Math.min(memberTurns, cards.length - 1)],
  };
}

// Canned debrief extraction — schema-valid against
// DEBRIEF_EXTRACTION_SCHEMA (docs/debrief-prompt.md). Deliberately
// modest: one conditioned envelope observation, nothing invented.
export const STUB_DEBRIEF_EXTRACTION = {
  envelopeUpdates: [{
    dimension: 'groupSize',
    observation: 'a bigger room worked this time',
    condition: 'a shared activity gave everyone something to do',
    direction: 'widen',
    confidence: 'medium',
  }],
  interestUpdates: [],
  barrierUpdates: [],
};

const DEFAULT_CANNED = {
  'onboarding-extraction': STUB_ONBOARDING_EXTRACTION,
  'onboarding-turn': stubOnboardingTurn,
  'debrief-extraction': STUB_DEBRIEF_EXTRACTION,
};

// Deterministic stub provider. Outputs are keyed by `task`; workshop robots
// and tests extend or override via the `canned` option (values may be plain
// objects or functions of the complete() request). An unknown task throws —
// a missing canned entry must be loud, never silently wrong.
export function createStubLlmProvider({ canned = {} } = {}) {
  const table = { ...DEFAULT_CANNED, ...canned };
  return {
    async complete(request) {
      const entry = table[request?.task];
      if (entry === undefined) {
        throw new Error(`stub llm: no canned output for task "${request?.task}"`);
      }
      const out = typeof entry === 'function' ? entry(request) : entry;
      return typeof out === 'string' ? out : structuredClone(out);
    },
  };
}
