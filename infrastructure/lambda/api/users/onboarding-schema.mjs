// Extraction schema for the onboarding interview's final call.
//
// Verbatim from docs/onboarding-prompt.md → "Extraction schema (final call)"
// — that file is the source of truth; change it there first. Produces the
// onboarding slice of the user model: Layer 1 narrative + coarse annotated
// Layer 2. Layer 3 is never populated at onboarding (user-model.md).
// `weight` is 0–1 by convention (structured outputs don't enforce numeric
// ranges); `comfort` values are free text while the dimension vocabulary is
// still a hypothesis.

export const ONBOARDING_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    narrative: {
      type: 'object',
      additionalProperties: false,
      properties: {
        selfDescription: { type: 'string' },
        goal: { type: 'string' },
        stories: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              prompt: { type: 'string' },
              told: { type: 'string' },
            },
            required: ['prompt', 'told'],
          },
        },
      },
      required: ['selfDescription', 'goal', 'stories'],
    },
    doors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          door: { type: 'string', enum: ['useful', 'make-learn', 'connect'] },
          weight: { type: 'number' },
          provenance: { type: 'string', enum: ['stated', 'inferred'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['door', 'weight', 'provenance', 'confidence'],
      },
    },
    interests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tag: { type: 'string' },
          weight: { type: 'number' },
          storyRef: { type: 'integer' },
          provenance: { type: 'string', enum: ['stated', 'inferred'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['tag', 'provenance', 'confidence'],
      },
    },
    strengthsToOffer: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          what: { type: 'string' },
          storyRef: { type: 'integer' },
          willingToFacilitate: { type: 'boolean' },
          provenance: { type: 'string', enum: ['stated', 'inferred'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['what', 'provenance', 'confidence'],
      },
    },
    envelope: {
      type: 'object',
      additionalProperties: false,
      properties: {
        groupSize: { $ref: '#/$defs/dim' },
        structure: { $ref: '#/$defs/dim' },
        familiarity: { $ref: '#/$defs/dim' },
        role: { $ref: '#/$defs/dim' },
        novelty: { $ref: '#/$defs/dim' },
        energy: {
          type: 'object',
          additionalProperties: false,
          properties: {
            capacity: { type: 'string' },
            frequency: {
              type: 'string',
              enum: ['weekly', 'biweekly', 'monthly', 'occasional'],
            },
            provenance: { type: 'string', enum: ['stated', 'inferred'] },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['provenance', 'confidence'],
        },
      },
    },
    constraints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        timeWindows: { type: 'array', items: { type: 'string' } },
        maxTravel: { type: 'string' },
        accessibility: { type: 'string' },
      },
    },
    barriers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          what: { type: 'string' },
          provenance: { type: 'string', enum: ['stated', 'inferred'] },
        },
        required: ['what', 'provenance'],
      },
    },
    provisional: { type: 'boolean' },
  },
  required: ['narrative', 'doors', 'envelope', 'provisional'],
  $defs: {
    dim: {
      type: 'object',
      additionalProperties: false,
      properties: {
        comfort: { type: 'string' },
        growthEdge: { type: 'string' },
        provenance: { type: 'string', enum: ['stated', 'inferred'] },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['comfort', 'provenance', 'confidence'],
    },
  },
};
