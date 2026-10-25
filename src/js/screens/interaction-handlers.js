// Event-interaction dispatcher.
//
// Maps a desired action ('interested' | 'confirmed' | 'withdraw') against
// the user's current level, calls the right command, and surfaces friendly
// errors. The DOM glue passes currentLevel and chooses what to do with
// onSuccess (e.g. re-fetch the feed). See interaction-handlers.test.mjs
// for the spec.

import { text } from '../copy.js';
import { errorText } from '../errors.js';

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
    showToast(errorText(err, 'event.action.failed', { 401: 'errors.sessionExpired', 404: 'errors.eventGone' }));
  }
}

function conflictMessage(conflicts) {
  const title = conflicts[0]?.title || text('event.anotherEvent');
  return conflicts.length > 1
    ? text('event.action.overlapMore', { title, count: conflicts.length - 1 })
    : text('event.action.overlap', { title });
}
