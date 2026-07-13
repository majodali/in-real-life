// Pure logic for the tiered debrief form (docs/debrief.md).
//
// Assembles the capture from UI state, enforces the Tier-0/1 rules
// client-side (mirroring the backend), and submits with convergence on
// 409 (already debriefed / concurrent retry). DOM stays in
// event-detail.js.

export function buildDebriefPayload({
  attended,
  again,
  noShowReason,
  textures,
  people,          // [{ ref, seeAgain }]
  reflection,
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
