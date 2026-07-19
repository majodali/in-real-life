// "How we understand you" — pure view-model + handlers (D59,
// docs/profile-and-legibility.md).
//
// Translates the GET /me/model response into friendly statements and
// chips, and drives corrections. The position vocabulary here MIRRORS
// the backend's lib/envelope.mjs (the source of truth) — same 3-position
// scales, member-facing wording added. Never renders a weight or score;
// the API never sends one.

export const ENVELOPE_VIEW = {
  groupSize: {
    title: 'Group size',
    positions: {
      intimate: 'a few people (3–4)',
      small: 'a small group (5–8)',
      large: 'a bigger group (9+)',
    },
  },
  structure: {
    title: 'The shape of it',
    positions: {
      'activity-anchored': 'something to do together',
      balanced: 'a bit of both',
      'open-conversation': 'open conversation',
    },
  },
  familiarity: {
    title: 'Familiar faces',
    positions: {
      'needs-known-face': 'best with someone you know there',
      'easier-with-known-face': 'easier with a familiar face',
      'fine-with-strangers': 'fine walking in new',
    },
  },
  role: {
    title: 'Having a role',
    positions: {
      'wants-a-job': 'happiest with a job to do',
      either: 'either way',
      'happy-to-attend': 'happy to just come along',
    },
  },
  novelty: {
    title: 'New vs. familiar',
    positions: {
      'prefers-ritual': 'the regular and familiar',
      mix: 'a mix',
      'seeks-new': 'trying new things',
    },
  },
};

// Envelope → ordered display rows. Every dimension the view knows is
// shown (even unplaced ones — so the member can place them); dimensions
// the view doesn't know (e.g. energy) pass through only if they carry
// something readable.
export function envelopeRows(envelope) {
  const rows = [];
  for (const [dimension, view] of Object.entries(ENVELOPE_VIEW)) {
    const dim = envelope?.[dimension] ?? {};
    rows.push({
      dimension,
      title: view.title,
      position: dim.position,
      positionLabel: dim.position ? view.positions[dim.position] : undefined,
      positionChoices: Object.entries(view.positions)
        .map(([value, label]) => ({ value, label })),
      edgeToward: dim.edgeToward,
      edgeLabel: dim.edgeToward ? view.positions[dim.edgeToward] : undefined,
      source: dim.source,
      story: dim.latestObservation ?? dim.comfort,
      growthEdge: dim.growthEdge,
    });
  }
  return rows;
}

// Chip lists with their provenance language, straight from the API's
// member-facing shape.
export function chipLists(model) {
  return {
    doors: (model?.doors ?? []).map((d) => ({ label: d.door, source: d.source })),
    interests: (model?.interests ?? []).map((i) => ({
      label: i.tag, source: i.source, removable: true,
      correction: { type: 'interest-remove', tag: i.tag },
    })),
    strengths: (model?.strengths ?? []).map((s) => ({ label: s.what, source: s.source })),
    barriers: (model?.barriers ?? []).map((b) => ({
      label: b.what, source: b.source, easing: b.easing === true, removable: true,
      correction: { type: 'barrier-remove', what: b.what },
    })),
  };
}

export async function handleModelLoad({ commands, showToast }) {
  try {
    const out = await commands.getModel();
    return out?.model ?? null;
  } catch {
    showToast?.("Couldn't load this right now — try again in a moment");
    return undefined; // distinct from null (= genuinely no model yet)
  }
}

// One correction press. The position picker sends envelope corrections;
// chip × buttons send removals. Backend validates against the same
// vocabulary; a 400 here means the mirror drifted — surfaced, not eaten.
export async function handleCorrection({ commands, correction, showToast, onDone }) {
  try {
    await commands.correctModel({ correction });
    showToast?.('Got it — noted');
    await onDone?.();
    return true;
  } catch {
    showToast?.("That didn't save — try again in a moment");
    return false;
  }
}
