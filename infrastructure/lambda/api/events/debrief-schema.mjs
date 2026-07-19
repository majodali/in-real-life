// Debrief extraction prompt + schema.
//
// Verbatim from docs/debrief-prompt.md — that file is the source of
// truth; change it there first. Runs at command time only when the
// debrief carries free text (surprise/reflection), never on tap-only
// debriefs and never under a conduct quarantine (open-risks #11).

export const DEBRIEF_EXTRACTION_SYSTEM =
  'You extract observed signal from a member\'s post-event debrief for a '
  + 'community meetup app. You receive the event context, the member\'s '
  + 'taps (repetition intent, texture chips), and their free text.\n\n'
  + 'Extract ONLY what the member\'s own words support - these become '
  + '"observed" evidence that outranks what they once said about '
  + 'themselves, so restraint matters more than coverage. Do not invent '
  + 'conditions, interests, or feelings. When the text supports a '
  + 'comfort-envelope update, prefer capturing the CONDITION under which '
  + 'it held ("bigger was fine BECAUSE the food gave everyone something '
  + 'to talk about") over a blanket change. An empty array is the right '
  + 'answer when the text teaches nothing on a dimension.\n\n'
  + 'Never extract anything about other people\'s conduct or character, '
  + 'and nothing that reads as a safety concern - that travels a '
  + 'different channel. Follow the JSON schema exactly.';

const CONFIDENCE = { type: 'string', enum: ['low', 'medium', 'high'] };

export const DEBRIEF_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    envelopeUpdates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dimension: {
            type: 'string',
            enum: ['groupSize', 'structure', 'familiarity', 'role', 'novelty', 'energy'],
          },
          observation: { type: 'string' },
          condition: { type: 'string' },
          direction: { type: 'string', enum: ['widen', 'confirm', 'narrow'] },
          // D58: optional pole this observation shifts the position
          // toward (validated against lib/envelope.mjs; a position moves
          // one step only when shifts REPEAT — never on one story).
          shiftToward: { type: 'string' },
          confidence: CONFIDENCE,
        },
        required: ['dimension', 'observation', 'direction', 'confidence'],
      },
    },
    interestUpdates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tag: { type: 'string' },
          direction: { type: 'string', enum: ['strengthen', 'confirm', 'weaken'] },
          observation: { type: 'string' },
          confidence: CONFIDENCE,
        },
        required: ['tag', 'direction', 'observation', 'confidence'],
      },
    },
    barrierUpdates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          what: { type: 'string' },
          direction: { type: 'string', enum: ['observed', 'easing'] },
          observation: { type: 'string' },
        },
        required: ['what', 'direction', 'observation'],
      },
    },
    forecastError: {
      type: 'object',
      additionalProperties: false,
      properties: {
        predicted: { type: 'string' },
        actual: { type: 'string' },
      },
      required: ['predicted', 'actual'],
    },
  },
};
