// "How we understand you" — pure view-model + handlers (D59,
// docs/profile-and-legibility.md).
//
// Translates the GET /me/model response into friendly statements and
// chips, and drives corrections. The position vocabulary here MIRRORS
// the backend's lib/envelope.mjs (the source of truth) — same 3-position
// scales, member-facing wording added. Never renders a weight or score;
// the API never sends one.

import { text } from '../copy.js';

// Values are copy keys (src/copy/<locale>/profile.js); envelopeRows reads them.
export const ENVELOPE_VIEW = {
  groupSize: {
    title: 'profile.envelope.groupSize',
    positions: {
      intimate: 'profile.envelope.groupSize.intimate',
      small: 'profile.envelope.groupSize.small',
      large: 'profile.envelope.groupSize.large',
    },
  },
  structure: {
    title: 'profile.envelope.structure',
    positions: {
      'activity-anchored': 'profile.envelope.structure.activityAnchored',
      balanced: 'profile.envelope.structure.balanced',
      'open-conversation': 'profile.envelope.structure.openConversation',
    },
  },
  familiarity: {
    title: 'profile.envelope.familiarity',
    positions: {
      'needs-known-face': 'profile.envelope.familiarity.needsKnownFace',
      'easier-with-known-face': 'profile.envelope.familiarity.easierWithKnownFace',
      'fine-with-strangers': 'profile.envelope.familiarity.fineWithStrangers',
    },
  },
  role: {
    title: 'profile.envelope.role',
    positions: {
      'wants-a-job': 'profile.envelope.role.wantsAJob',
      either: 'profile.envelope.role.either',
      'happy-to-attend': 'profile.envelope.role.happyToAttend',
    },
  },
  novelty: {
    title: 'profile.envelope.novelty',
    positions: {
      'prefers-ritual': 'profile.envelope.novelty.prefersRitual',
      mix: 'profile.envelope.novelty.mix',
      'seeks-new': 'profile.envelope.novelty.seeksNew',
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
      title: text(view.title),
      position: dim.position,
      positionLabel: dim.position ? text(view.positions[dim.position]) : undefined,
      positionChoices: Object.entries(view.positions)
        .map(([value, key]) => ({ value, label: text(key) })),
      edgeToward: dim.edgeToward,
      edgeLabel: dim.edgeToward ? text(view.positions[dim.edgeToward]) : undefined,
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
    showToast?.(text('profile.model.loadFailedToast'));
    return undefined; // distinct from null (= genuinely no model yet)
  }
}

// One correction press. The position picker sends envelope corrections;
// chip × buttons send removals. Backend validates against the same
// vocabulary; a 400 here means the mirror drifted — surfaced, not eaten.
export async function handleCorrection({ commands, correction, showToast, onDone }) {
  try {
    await commands.correctModel({ correction });
    showToast?.(text('profile.model.noted'));
    await onDone?.();
    return true;
  } catch {
    showToast?.(text('profile.model.failed'));
    return false;
  }
}
