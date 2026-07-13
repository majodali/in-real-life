// Pure logic for the reflection conversation (docs/reflection-and-coaching.md).
//
// The screen owns the DOM; this module owns the loop rules: turn calls
// are ephemeral, the close converges on 409, and the coaching cap record
// (perspectivesOffered) is accumulated from the turn envelopes.

export function appendExchange(transcript, memberText, usText) {
  const next = [...transcript];
  if (memberText != null) next.push({ role: 'member', text: memberText });
  if (usText != null) next.push({ role: 'us', text: usText });
  return next;
}

// Perspectives actually offered during this conversation, deduped, from
// the turn envelopes the server returned.
export function collectPerspectives(turns) {
  return [...new Set(
    (turns ?? [])
      .map((t) => t?.perspectiveOffered)
      .filter((p) => p && p !== 'none'),
  )];
}

export async function handleReflectionTurn({ eventId, transcript, commands }) {
  try {
    const turn = await commands.reflectionTurn({ eventId, transcript });
    return { turn };
  } catch (error) {
    return { error };
  }
}

export async function handleReflectionClose({
  eventId,
  transcript,
  perspectivesOffered,
  commands,
  showToast,
  onDone,
}) {
  // Nothing said → nothing to record; close the panel quietly.
  if (!transcript.some((t) => t.role === 'member' && t.text.trim())) {
    onDone?.();
    return true;
  }
  try {
    await commands.completeReflection({ eventId, transcript, perspectivesOffered });
  } catch (err) {
    if (err?.status !== 409) {
      showToast(err?.message || 'Could not save that — try again.');
      return false;
    }
    // 409: already recorded — converge.
  }
  onDone?.();
  return true;
}
