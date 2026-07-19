// Pure logic for the tiered debrief form (docs/debrief.md).
//
// Assembles the capture from UI state, enforces the Tier-0/1 rules
// client-side (mirroring the backend), and submits with convergence on
// 409 (already debriefed / concurrent retry). DOM stays in
// event-detail.js.

// The one invited Tier-2 question (docs/debrief.md → When depth is
// invited) — deterministic, so the fast path stays model-free. Returns
// null when depth wouldn't yield real signal (good outcome, no-show,
// conduct) — the minimal close is the right ending for most debriefs.
const MISMATCH_EXPAND = {
  'too-big': 'Was it the size itself, or more that it was hard to find a way in?',
  'hard-to-break-in': 'What would’ve made it easier to break in?',
  'nothing-to-do': 'What would’ve given it more shape for you?',
  'went-long': 'Was it the length itself, or the pacing?',
};

export function chooseFollowUp({ attended, again, textures, conductConcern }) {
  if (!attended || conductConcern) return null;
  const mismatch = (textures ?? []).find((t) => t in MISMATCH_EXPAND);
  if (again === 'maybe' || again === 'no') {
    // Poor-ish result → one follow-up to aim better; a mismatch chip
    // makes it specific (confirm and expand).
    return mismatch ? MISMATCH_EXPAND[mismatch] : 'What would’ve made it easier?';
  }
  if (again === 'yes' && mismatch) {
    // Enjoyed it despite a predicted mismatch — worth a calibration
    // check (forecast error), not a refine-negotiation.
    return 'Anything surprise you about how it went?';
  }
  return null;
}

// The people step's marks → API entries. Avoidance (D49) is a quiet,
// deliberate act behind the ⋯ affordance — mutually exclusive with the
// see-again tap by construction (the UI enforces it; this mapping
// guarantees it: a tap outranks a stale avoid mark and vice versa is
// impossible because setting either clears the other).
export function buildPeopleEntries(peopleMarks) {
  return [...peopleMarks.entries()]
    .filter(([, v]) => v.met)
    .map(([ref, v]) => ({
      ref,
      seeAgain: v.seeAgain === true,
      ...(v.avoid && v.seeAgain !== true ? { avoid: v.avoid } : {}),
    }));
}

export function buildDebriefPayload({
  attended,
  again,
  noShowReason,
  textures,
  people,          // [{ ref, seeAgain, avoid? }]
  reflection,
  followUp,        // { question, answer } from the one invited question
  conductConcern,
  conductNote,
}) {
  if (typeof attended !== 'boolean') {
    return { error: 'Let us know if you made it.' };
  }
  if (conductConcern === true) {
    // Quarantine: the concern travels alone (plus attendance) — the
    // backend suppresses every preference field regardless.
    return {
      payload: {
        attended,
        conductConcern: true,
        ...(conductNote?.trim() ? { conductNote: conductNote.trim() } : {}),
      },
    };
  }
  if (!attended) {
    return {
      payload: {
        attended: false,
        ...(noShowReason ? { noShowReason } : {}),
      },
    };
  }
  if (!['yes', 'maybe', 'no'].includes(again)) {
    return { error: 'Worth another go? Pick one — that’s the heart of it.' };
  }
  return {
    payload: {
      attended: true,
      again,
      ...(textures?.length ? { outcomeTexture: textures } : {}),
      ...(people?.length ? { people } : {}),
      ...(reflection?.trim() ? { reflection: reflection.trim() } : {}),
      ...(followUp?.answer?.trim()
        ? { followUp: { question: followUp.question, answer: followUp.answer.trim() } }
        : {}),
    },
  };
}

export async function handleDebriefSubmit({
  eventId,
  state,
  commands,
  showToast,
  onSuccess,
}) {
  const { payload, error } = buildDebriefPayload(state);
  if (error) {
    showToast(error);
    return false;
  }
  try {
    await commands.submitDebrief({ eventId, ...payload });
  } catch (err) {
    if (err?.status !== 409) {
      showToast(err?.message || 'Could not save.');
      return false;
    }
    // 409: already recorded (retry or another tab) — converge.
  }
  onSuccess?.();
  return true;
}
