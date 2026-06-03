// Propose-event submit handler.
//
// Validates the form fields, normalises the local datetime strings to ISO,
// calls commands.proposeEvent, and routes the caller on success. The DOM
// glue in propose.js owns inputs, button state, and the actual navigation;
// this module owns the rules.
//
// See propose-handlers.test.mjs for the spec.

export async function handleProposeSubmit({
  title,
  description,
  startTime,
  endTime,
  location,
  organizerName,
  minimumAttendance,
  autoPlanOnThreshold,
  commands,
  showToast,
  onSuccess,
  onValidationError,
}) {
  const trimmedTitle = (title ?? '').trim();
  const trimmedLocation = (location ?? '').trim();
  const trimmedOrganizerName = (organizerName ?? '').trim();

  if (!trimmedTitle) {
    onValidationError?.('title');
    showToast('A short title helps people find this.');
    return;
  }
  if (!startTime) {
    onValidationError?.('startTime');
    showToast('Pick a start time.');
    return;
  }
  if (!trimmedLocation) {
    onValidationError?.('location');
    showToast('Where is this happening?');
    return;
  }

  const startIso = toIso(startTime);
  if (!startIso) {
    onValidationError?.('startTime');
    showToast('That start time doesn’t look right.');
    return;
  }

  let endIso;
  if (endTime) {
    endIso = toIso(endTime);
    if (!endIso) {
      onValidationError?.('endTime');
      showToast('That end time doesn’t look right.');
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      onValidationError?.('endTime');
      showToast('End time needs to be after the start.');
      return;
    }
  }

  const minAttendance = normaliseMinimum(minimumAttendance);
  if (minimumAttendance !== undefined && minimumAttendance !== '' && minAttendance == null) {
    onValidationError?.('minimumAttendance');
    showToast('Minimum attendance must be a whole number of 3 or more.');
    return;
  }

  const trimmedDescription = description?.trim();

  try {
    const result = await commands.proposeEvent({
      title: trimmedTitle,
      description: trimmedDescription || undefined,
      startTime: startIso,
      endTime: endIso,
      location: trimmedLocation,
      organizerName: trimmedOrganizerName || undefined,
      minimumAttendance: minAttendance ?? undefined,
      autoPlanOnThreshold: autoPlanOnThreshold === true,
    });
    onSuccess?.(result);
  } catch (err) {
    showToast(err?.message || 'Couldn’t propose that event. Try again.');
  }
}

// <input type="datetime-local"> emits "2026-06-01T12:00" (no zone). Treat
// as local time and produce an ISO string. ISO strings pass through.
function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normaliseMinimum(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 3) return null;
  return n;
}
