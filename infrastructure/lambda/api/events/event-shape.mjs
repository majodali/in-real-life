// Event shape extraction (D56) — prompt, schema, normalization, and the
// propose-time extraction helper.
//
// Verbatim from docs/event-shape-prompt.md — that file is the source of
// truth; change it there first. Shape is public listing data (not PII):
// activityTags feed interest-tag fit, doors feed door fit, structure is
// captured-not-used until the member envelope gets comparable form.
//
// Extraction failure is never propose failure: the helper returns
// undefined and the event ranks through the text-fallback fit path.

export const EVENT_SHAPE_SYSTEM = `You classify a community meetup event listing into a small, fixed shape
vocabulary for matching. You receive the listing's title and description.

Extract ONLY what the listing itself supports - the shape feeds event
recommendations, so a wrong tag misroutes real people. When the listing
is thin, prefer fewer tags: an empty tags array is a valid answer. Never
invent details, and never editorialize about the activity.

- activityTags: up to 5 short lowercase noun phrases naming what
  attendees actually DO ("board games", "trail walk", "pottery"). Not
  vibes, not adjectives, not the venue name.
- structure: how much the activity itself organizes the time.
  "structured" = a format runs the session (a class, a game, a work
  party); "semi-structured" = an anchor activity with loose space around
  it (a walk, a craft table); "unstructured" = the point is open
  conversation or hanging out.
- doors: which of the three doors the event most plausibly opens -
  "useful" (contribute, help), "make-learn" (make or learn something),
  "connect" (be with people). Most events open one or two; list only the
  credible ones.

Follow the JSON schema exactly.`;

export const EVENT_SHAPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    activityTags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    structure: {
      type: 'string',
      enum: ['structured', 'semi-structured', 'unstructured'],
    },
    doors: {
      type: 'array',
      items: { type: 'string', enum: ['useful', 'make-learn', 'connect'] },
      maxItems: 3,
    },
  },
  required: ['activityTags', 'structure', 'doors'],
};

const STRUCTURES = new Set(['structured', 'semi-structured', 'unstructured']);
const DOORS = new Set(['useful', 'make-learn', 'connect']);
const TAG_MAX = 5;
const TAG_LENGTH_MAX = 40;

function normalizeTag(tag) {
  return String(tag)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, TAG_LENGTH_MAX)
    .trim();
}

// Strict validation shared by the extraction path and organizer edits.
// Returns { value } or { error } — the value never carries `source`;
// callers stamp provenance themselves.
export function normalizeShape(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'shape must be an object with activityTags, structure, and doors' };
  }
  if (!Array.isArray(raw.activityTags)
    || raw.activityTags.some((t) => typeof t !== 'string')) {
    return { error: 'shape.activityTags must be an array of strings' };
  }
  const activityTags = [...new Set(
    raw.activityTags.map(normalizeTag).filter(Boolean),
  )].slice(0, TAG_MAX);
  if (!STRUCTURES.has(raw.structure)) {
    return { error: 'shape.structure must be structured, semi-structured, or unstructured' };
  }
  if (!Array.isArray(raw.doors) || raw.doors.some((d) => !DOORS.has(d))) {
    return { error: 'shape.doors must be an array of useful, make-learn, or connect' };
  }
  const doors = [...new Set(raw.doors)];
  return { value: { activityTags, structure: raw.structure, doors } };
}

// One extraction call at propose time. Any failure — network, refusal,
// schema-invalid output — yields undefined, never an error.
export async function extractEventShape({ llm, title, description }) {
  try {
    const raw = await llm.complete({
      task: 'event-shape',
      system: EVENT_SHAPE_SYSTEM,
      messages: [{
        role: 'user',
        content: `TITLE: ${title}\nDESCRIPTION: ${description ?? '(none)'}`,
      }],
      schema: EVENT_SHAPE_SCHEMA,
      maxTokens: 1024,
    });
    const { value, error } = normalizeShape(raw);
    if (error) return undefined;
    return { ...value, source: 'extracted' };
  } catch {
    return undefined;
  }
}
