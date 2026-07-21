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
  costAmount,
  costCovers,
  maxAttendance,
  meetingSpot,
  localityId,
  isExternal,
  minimumAttendance,
  autoPlanOnThreshold,
  timesApproximate,
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

  // External events (D53) are already real: full time/place required.
  if (isExternal && (!startTime || !endTime || !trimmedLocation)) {
    onValidationError?.(!startTime ? 'startTime' : !endTime ? 'endTime' : 'location');
    showToast('An existing event needs its real time and place — if it\u2019s not pinned down yet, float it as an idea instead.');
    return;
  }

  // Time and place are optional: leaving them blank floats the proposal
  // as an idea (interest-only until it firms up). Times come as a pair.
  if (startTime && !endTime) {
    onValidationError?.('endTime');
    showToast('Add an end time too — or clear the start to float this as an idea.');
    return;
  }
  if (endTime && !startTime) {
    onValidationError?.('startTime');
    showToast('Add a start time too — or clear the end to float this as an idea.');
    return;
  }

  let startIso;
  let endIso;
  if (startTime) {
    startIso = toIso(startTime);
    if (!startIso) {
      onValidationError?.('startTime');
      showToast('That start time doesn’t look right.');
      return;
    }
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

  // Cost disclosure (D34): an amount never travels without what it covers.
  let cost;
  const amountBlank = costAmount === undefined || costAmount === null || costAmount === '';
  const coversBlank = !(costCovers ?? '').trim();
  if (!amountBlank || !coversBlank) {
    const amount = Number(costAmount);
    if (amountBlank || !Number.isFinite(amount) || amount <= 0) {
      onValidationError?.('costAmount');
      showToast('Cost needs a positive amount — or clear both cost fields for a free event.');
      return;
    }
    if (coversBlank) {
      onValidationError?.('costCovers');
      showToast('Say what the cost covers — that\u2019s the one required bit for paid events.');
      return;
    }
    cost = { amount, covers: costCovers.trim() };
  }

  const minAttendance = normaliseMinimum(minimumAttendance);
  if (minimumAttendance !== undefined && minimumAttendance !== '' && minAttendance == null) {
    onValidationError?.('minimumAttendance');
    showToast('Minimum attendance must be a whole number of 3 or more.');
    return;
  }

  let maxSpots;
  if (maxAttendance !== undefined && maxAttendance !== null && maxAttendance !== '') {
    const n = Number(maxAttendance);
    const floor = minAttendance ?? 3;
    if (!Number.isInteger(n) || n < floor) {
      onValidationError?.('maxAttendance');
      showToast(`Spots must be a whole number of at least ${floor} (you count too).`);
      return;
    }
    maxSpots = n;
  }

  const trimmedDescription = description?.trim();

  try {
    const result = await commands.proposeEvent({
      title: trimmedTitle,
      description: trimmedDescription || undefined,
      startTime: startIso,
      endTime: endIso,
      location: trimmedLocation || undefined,
      organizerName: trimmedOrganizerName || undefined,
      minimumAttendance: isExternal ? undefined : (minAttendance ?? undefined),
      cost,
      maxAttendance: maxSpots,
      source: isExternal ? 'external' : undefined,
      meetingSpot: (meetingSpot ?? '').trim() || undefined,
      localityId: localityId || undefined,
      autoPlanOnThreshold: isExternal ? undefined : (autoPlanOnThreshold === true),
      timesApproximate: timesApproximate === true,
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
