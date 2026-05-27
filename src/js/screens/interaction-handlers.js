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
