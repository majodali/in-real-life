// Edit-event submit handler.
//
// Compares the form values against the loaded event, sends only the
// changed fields via commands.editEvent, and routes back on success.
// Validation mirrors propose-handlers (title/location non-blank,
// datetime parseable, end > start).
//
// See edit-handlers.test.mjs for the spec.

export async function handleEditSubmit({
  current,
  title,
  description,
  startTime,
  endTime,
  location,
  commands,
  showToast,
  onSuccess,
  onValidationError,
  onNoop,
}) {
  const trimmedTitle = (title ?? '').trim();
  const trimmedLocation = (location ?? '').trim();
  const trimmedDescription = (description ?? '').trim();

  if (!trimmedTitle) {
    onValidationError?.('title');
    showToast('Title can\'t be blank.');
    return;
  }
  if (!trimmedLocation) {
    onValidationError?.('location');
    showToast('Where? can\'t be blank.');
    return;
  }
  const startIso = toIso(startTime);
  if (!startIso) {
    onValidationError?.('startTime');
    showToast('Start time doesn\'t look right.');
    return;
  }
  let endIso;
  if (endTime) {
    endIso = toIso(endTime);
    if (!endIso) {
      onValidationError?.('endTime');
      showToast('End time doesn\'t look right.');
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      onValidationError?.('endTime');
      showToast('End time has to be after the start.');
      return;
    }
  }

  // Send only what changed.
  const fields = {};
  if (trimmedTitle !== current.title) fields.title = trimmedTitle;
  if (trimmedLocation !== current.location) fields.location = trimmedLocation;
  if ((trimmedDescription || '') !== (current.description || '')) {
    fields.description = trimmedDescription;
  }
  if (startIso !== current.startTime) fields.startTime = startIso;
  // endTime can be cleared.
  const currentEnd = current.endTime ?? null;
  const nextEnd = endIso ?? null;
  if (nextEnd !== currentEnd) {
    // Sending null clears the value on the server side once we extend the
    // edit API to accept clear semantics. For now we only send when set.
    if (nextEnd != null) fields.endTime = nextEnd;
  }

  if (Object.keys(fields).length === 0) {
    onNoop?.();
    return;
  }

  try {
    const result = await commands.editEvent({ eventId: current.eventId, ...fields });
    onSuccess?.(result);
  } catch (err) {
    showToast(err?.message || 'Couldn\'t save those changes.');
  }
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
