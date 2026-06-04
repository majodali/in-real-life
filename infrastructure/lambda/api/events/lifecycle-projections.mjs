// Projections for lifecycle transitions on event#<id>:
//   EventScheduled → lifecycleState='planned'
//   EventCancelled → lifecycleState='cancelled' (from any non-cancelled state)
//   EventAutoPlanSettingChanged → flips autoPlanOnThreshold (only while proposed)
//
// All three condition on prior seq, so concurrent transitions cleanly fail
// (the runner will then reload state and the side-effecting caller retries
// or backs off). EventScheduled and EventAutoPlanSettingChanged also
// condition on lifecycleState=proposed so a planned or cancelled event
// can't accidentally re-enter a setup state.

export function projectEventScheduled(event, tables) {
  return {
    Update: {
      TableName: tables.eventsTable,
      Key: { eventId: event.data.eventId },
      UpdateExpression:
        'SET lifecycleState = :state, scheduledBy = :scheduledBy, '
        + 'autoTriggered = :autoTriggered, scheduledAt = :scheduledAt, '
        + '#seq = :seq',
      ConditionExpression: '#seq = :prevSeq AND lifecycleState = :proposed',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':state': 'planned',
        ':proposed': 'proposed',
        ':scheduledBy': event.data.scheduledBy,
        ':autoTriggered': event.data.autoTriggered === true,
        ':scheduledAt': event.wallTime,
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
      },
    },
  };
}

export function projectEventCancelled(event, tables) {
  const reason = event.data.reason ?? null;
  return {
    Update: {
      TableName: tables.eventsTable,
      Key: { eventId: event.data.eventId },
      UpdateExpression:
        'SET lifecycleState = :state, cancelledBy = :cancelledBy, '
        + 'cancelledAt = :cancelledAt, cancellationReason = :reason, '
        + '#seq = :seq',
      ConditionExpression: '#seq = :prevSeq AND lifecycleState <> :cancelled',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':state': 'cancelled',
        ':cancelled': 'cancelled',
        ':cancelledBy': event.data.cancelledBy,
        ':reason': reason,
        ':cancelledAt': event.wallTime,
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
      },
    },
  };
}

// SET-only-what-changed update for the editable fields. Conditioned on
// prior seq + lifecycleState <> cancelled. The handler is responsible for
// rejecting edits on cancelled/over events; this projection guard catches
// the cancelled case as a defence in depth.
const EDITABLE_FIELDS = new Set(['title', 'description', 'startTime', 'endTime', 'location']);

export function projectEventEdited(event, tables) {
  const names = { '#seq': 'seq' };
  const values = {
    ':now': event.wallTime,
    ':seq': event.seq,
    ':prevSeq': event.seq - 1,
    ':cancelled': 'cancelled',
  };
  const sets = ['lastEditedAt = :now', '#seq = :seq'];
  for (const [field, value] of Object.entries(event.data.fields || {})) {
    if (!EDITABLE_FIELDS.has(field)) continue;
    const nameKey = `#${field}`;
    const valueKey = `:${field}`;
    names[nameKey] = field;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  }
  return {
    Update: {
      TableName: tables.eventsTable,
      Key: { eventId: event.data.eventId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: '#seq = :prevSeq AND lifecycleState <> :cancelled',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

export function projectEventAutoPlanSettingChanged(event, tables) {
  return {
    Update: {
      TableName: tables.eventsTable,
      Key: { eventId: event.data.eventId },
      UpdateExpression: 'SET autoPlanOnThreshold = :autoPlan, #seq = :seq',
      ConditionExpression: '#seq = :prevSeq AND lifecycleState = :proposed',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':autoPlan': event.data.autoPlanOnThreshold === true,
        ':proposed': 'proposed',
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
      },
    },
  };
}
