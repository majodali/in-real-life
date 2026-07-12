// Event-interaction dispatcher.
//
// Maps a desired action ('interested' | 'confirmed' | 'withdraw') against
// the user's current level, calls the right command, and surfaces friendly
// errors. The DOM glue passes currentLevel and chooses what to do with
// onSuccess (e.g. re-fetch the feed). See interaction-handlers.test.mjs
// for the spec.

export async function handleInteraction({
  desired,
  currentLevel,
  eventId,
  commands,
  showToast,
  onSuccess,
}) {
  if (desired !== 'interested' && desired !== 'confirmed' && desired !== 'withdraw') {
    throw new Error(`unknown desired action: ${desired}`);
  }

  // Same-level → no-op. The backend would also no-op, but skipping the round
  // trip keeps the UI snappy.
  if (desired === 'interested' && currentLevel === 'interested') return;
  if (desired === 'confirmed' && currentLevel === 'confirmed') return;
  if (desired === 'withdraw' && currentLevel == null) return;

  try {
    let result;
    if (desired === 'withdraw') {
      result = await commands.withdrawEventInteraction({ eventId });
    } else {
      result = await commands.setEventInteraction({ eventId, level: desired });
    }
    onSuccess?.(result);
    // Double-confirmation heads-up (backlog: overlapping RSVPs). The
    // backend never blocks; we surface it gently after the success toast
    // so the member can decide — co-located doubles are legitimate.
    if (desired === 'confirmed' && result?.conflicts?.length) {
      showToast(conflictMessage(result.conflicts));
    }
  } catch (err) {
    if (err?.status === 401) {
      showToast('Your session expired. Sign in again.');
    } else if (err?.status === 404) {
      showToast('This event is no longer available.');
    } else {
      showToast(err?.message || 'Couldn’t save that. Try again.');
    }
  }
}

function conflictMessage(conflicts) {
  const first = conflicts[0]?.title || 'another event';
  const more = conflicts.length > 1 ? ` (and ${conflicts.length - 1} more)` : '';
  return `Heads up — this overlaps with “${first}”${more}, which you're also in for. If you can't make both, free up the spot.`;
}
