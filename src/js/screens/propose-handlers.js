// Propose-event submit handler.
//
// Validates the form fields, normalises the local datetime strings to ISO,
// calls commands.proposeEvent, and routes the caller on success. The DOM
// glue in propose.js owns inputs, button state, and the actual navigation;
// this module owns the rules.
//
// See propose-handlers.test.mjs for the spec.

import { text } from '../copy.js';
import { errorText } from '../errors.js';

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
    showToast(text('propose.rule.title'));
    return;
  }

  // External events (D53) are already real: full time/place required.
  if (isExternal && (!startTime || !endTime || !trimmedLocation)) {
    onValidationError?.(!startTime ? 'startTime' : !endTime ? 'endTime' : 'location');
    showToast(text('propose.rule.externalNeedsTime'));
    return;
  }

  // Time and place are optional: leaving them blank floats the proposal
  // as an idea (interest-only until it firms up). Times come as a pair.
  if (startTime && !endTime) {
    onValidationError?.('endTime');
    showToast(text('propose.rule.needsEnd'));
    return;
  }
  if (endTime && !startTime) {
    onValidationError?.('startTime');
    showToast(text('propose.rule.needsStart'));
    return;
  }

  let startIso;
  let endIso;
  if (startTime) {
    startIso = toIso(startTime);
    if (!startIso) {
      onValidationError?.('startTime');
      showToast(text('propose.rule.badStart'));
      return;
    }
    endIso = toIso(endTime);
    if (!endIso) {
      onValidationError?.('endTime');
      showToast(text('propose.rule.badEnd'));
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      onValidationError?.('endTime');
      showToast(text('propose.rule.endBeforeStart'));
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
      showToast(text('propose.rule.costAmount'));
      return;
    }
    if (coversBlank) {
      onValidationError?.('costCovers');
      showToast(text('propose.rule.costCovers'));
      return;
    }
    cost = { amount, covers: costCovers.trim() };
  }

  const minAttendance = normaliseMinimum(minimumAttendance);
  if (minimumAttendance !== undefined && minimumAttendance !== '' && minAttendance == null) {
    onValidationError?.('minimumAttendance');
    showToast(text('propose.rule.min'));
    return;
  }

  let maxSpots;
  if (maxAttendance !== undefined && maxAttendance !== null && maxAttendance !== '') {
    const n = Number(maxAttendance);
    const floor = minAttendance ?? 3;
    if (!Number.isInteger(n) || n < floor) {
      onValidationError?.('maxAttendance');
      showToast(text('propose.rule.max', { floor }));
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
    showToast(errorText(err, 'propose.failed'));
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
