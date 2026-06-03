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
