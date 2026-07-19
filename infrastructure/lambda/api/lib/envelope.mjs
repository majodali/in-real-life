// The envelope vocabulary (docs/profile-and-legibility.md, D58).
//
// One source of truth for the coarse 3-position scales: the onboarding
// extraction, debrief position shifts, member corrections, and fit
// comparison all validate against THIS module. Positions are a tool for
// fit, never a label: 3 positions resists false precision, every pole is
// language the design already speaks, the story always travels with the
// position, and only the member ever sees their own.
//
// Ordering matters: positions are listed pole → pole, and adjacency is
// index distance (fit scores exact / adjacent / opposite).

export const ENVELOPE_DIMENSIONS = {
  groupSize: {
    positions: ['intimate', 'small', 'large'],
  },
  structure: {
    positions: ['activity-anchored', 'balanced', 'open-conversation'],
    // Direct 1:1 map onto the event shape enum (D56) — what makes
    // structure fit a straight comparison.
    shapeMap: {
      'activity-anchored': 'structured',
      balanced: 'semi-structured',
      'open-conversation': 'unstructured',
    },
  },
  familiarity: {
    positions: ['needs-known-face', 'easier-with-known-face', 'fine-with-strangers'],
  },
  role: {
    positions: ['wants-a-job', 'either', 'happy-to-attend'],
  },
  novelty: {
    positions: ['prefers-ritual', 'mix', 'seeks-new'],
  },
  // `energy` stays structured its own way (frequency enum + capacity
  // text) — pacing is a feed-level concern, not a per-event position.
};

export function isValidPosition(dimension, position) {
  return ENVELOPE_DIMENSIONS[dimension]?.positions.includes(position) ?? false;
}

// A growth edge points at a POLE (first or last position) — "stretching
// toward large", never at the middle.
export function isValidEdge(dimension, edgeToward) {
  const positions = ENVELOPE_DIMENSIONS[dimension]?.positions;
  if (!positions) return false;
  return edgeToward === positions[0] || edgeToward === positions[positions.length - 1];
}

export function positionIndex(dimension, position) {
  const i = ENVELOPE_DIMENSIONS[dimension]?.positions.indexOf(position);
  return i === undefined || i === -1 ? null : i;
}

// One step toward a pole; clamped at the pole itself.
export function stepToward(dimension, position, pole) {
  const positions = ENVELOPE_DIMENSIONS[dimension]?.positions;
  if (!positions) return position;
  const from = positions.indexOf(position);
  const to = positions.indexOf(pole);
  if (from === -1 || to === -1 || from === to) return position;
  return positions[from + Math.sign(to - from)];
}

// Adjacency score: exact match 1, adjacent 0.5, opposite 0. Null when
// either side has no position (fit component simply doesn't apply).
export function adjacencyScore(dimension, positionA, positionB) {
  const a = positionIndex(dimension, positionA);
  const b = positionIndex(dimension, positionB);
  if (a === null || b === null) return null;
  const distance = Math.abs(a - b);
  return distance === 0 ? 1 : distance === 1 ? 0.5 : 0;
}
