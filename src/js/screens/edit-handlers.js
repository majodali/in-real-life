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
  costAmount,
  costCovers,
  maxAttendance,
  meetingSpot,
  shapeTags,
  shapeStructure,
  shapeDoors,
  eventTypeId,
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
  // Time and place follow the idea rules (an idea may have neither):
  // blank keeps whatever the event has — the edit API can't clear them —
  // and a start entering for the first time needs its end alongside.
  if (!trimmedLocation && current.location) {
    onValidationError?.('location');
    showToast('Where? can\'t be cleared once set — change it instead.');
    return;
  }
  let startIso;
  if (startTime) {
    startIso = toIso(startTime);
    if (!startIso) {
      onValidationError?.('startTime');
      showToast('Start time doesn\'t look right.');
      return;
    }
  } else if (current.startTime) {
    onValidationError?.('startTime');
    showToast('Start time can\'t be cleared once set — change it instead.');
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
    const effectiveStart = startIso ?? current.startTime;
    if (!effectiveStart) {
      onValidationError?.('startTime');
      showToast('Set a start time along with the end.');
      return;
    }
    if (new Date(endIso) <= new Date(effectiveStart)) {
      onValidationError?.('endTime');
      showToast('End time has to be after the start.');
      return;
    }
  }
  if (startIso && !endIso && !current.endTime) {
    onValidationError?.('endTime');
    showToast('Add an end time along with the start.');
    return;
  }

  // Cost disclosure (D34) + capacity, mirroring propose; blanking both
  // cost fields (or the spots field) clears the value on the server.
  const amountBlank = costAmount === undefined || costAmount === null || costAmount === '';
  const coversBlank = !(costCovers ?? '').trim();
  let nextCost;
  if (amountBlank && coversBlank) {
    nextCost = null;
  } else {
    const amount = Number(costAmount);
    if (amountBlank || !Number.isFinite(amount) || amount <= 0) {
      onValidationError?.('costAmount');
      showToast('Cost needs a positive amount — or clear both cost fields.');
      return;
    }
    if (coversBlank) {
      onValidationError?.('costCovers');
      showToast('Say what the cost covers.');
      return;
    }
    nextCost = { amount, covers: costCovers.trim() };
  }

  let nextMax = null;
  if (maxAttendance !== undefined && maxAttendance !== null && maxAttendance !== '') {
    const n = Number(maxAttendance);
    const floor = current.minimumAttendance ?? 3;
    if (!Number.isInteger(n) || n < floor) {
      onValidationError?.('maxAttendance');
      showToast(`Spots must be a whole number of at least ${floor}.`);
      return;
    }
    nextMax = n;
  }

  // Event shape (D56): the organizer's correction replaces the extracted
  // shape wholesale. Blanking the whole group clears it; tags or doors
  // without a structure pick is the one invalid combination.
  const tags = (shapeTags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const doors = shapeDoors ?? [];
  const structure = (shapeStructure ?? '').trim();
  let nextShape;
  if (!structure && tags.length === 0 && doors.length === 0) {
    nextShape = current.shape ? null : undefined;
  } else if (!structure) {
    onValidationError?.('shapeStructure');
    showToast('Pick how structured it is — or clear the tags and doors too.');
    return;
  } else {
    nextShape = { activityTags: tags, structure, doors };
  }

  // Send only what changed.
  const fields = {};
  if (trimmedTitle !== current.title) fields.title = trimmedTitle;
  if (trimmedLocation && trimmedLocation !== current.location) fields.location = trimmedLocation;
  if ((trimmedDescription || '') !== (current.description || '')) {
    fields.description = trimmedDescription;
  }
  // endTime can be cleared.
  const currentEnd = current.endTime ?? null;
  const nextEnd = endIso ?? null;
  if (nextEnd !== currentEnd) {
    // Sending null clears the value on the server side once we extend the
    // edit API to accept clear semantics. For now we only send when set.
    if (nextEnd != null) fields.endTime = nextEnd;
  }
  if (startIso && startIso !== current.startTime) fields.startTime = startIso;
  const currentCost = current.cost ?? null;
  if (JSON.stringify(nextCost) !== JSON.stringify(currentCost)) fields.cost = nextCost;
  const currentMax = current.maxAttendance ?? null;
  if (nextMax !== currentMax) fields.maxAttendance = nextMax;
  const nextSpot = (meetingSpot ?? '').trim() || null;
  const currentSpot = current.meetingSpot ?? null;
  if (nextSpot !== currentSpot) fields.meetingSpot = nextSpot;
  if (nextShape !== undefined && shapeChanged(nextShape, current.shape ?? null)) {
    fields.shape = nextShape;
  }
  // Event type (D63): the organizer's word; '' from the picker means
  // untyped (null clears server-side). undefined = field absent (picker
  // not rendered) — never touched.
  if (eventTypeId !== undefined) {
    const nextType = eventTypeId || null;
    if (nextType !== (current.eventTypeId ?? null)) fields.eventTypeId = nextType;
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

// Compare shape ignoring provenance — the server re-stamps source anyway.
function shapeChanged(next, currentShape) {
  if (next === null) return currentShape !== null;
  if (currentShape === null) return true;
  const norm = (s) => JSON.stringify({
    activityTags: (s.activityTags ?? []).map((t) => t.toLowerCase()),
    structure: s.structure,
    doors: [...(s.doors ?? [])].sort(),
  });
  return norm(next) !== norm(currentShape);
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
