// Projections for user-event interactions.
//
// Each function returns an array of DynamoDB write ops that maintain
//   (a) the per-user state row on irl-interactions
//   (b) atomic ADDs on the event's counters in irl-events
// Atomic ADDs let multiple users interact with the same event concurrently
// without contention on a shared seq number — each user's interactions live
// on their own aggregate (interaction#<userId>#<eventId>).

function countDelta(previousLevel, newLevel) {
  // Returns { interestDelta, confirmedDelta } describing how the event row
  // counters should move when transitioning previousLevel → newLevel.
  // Same-level transitions yield 0/0 (caller can skip the event-row write).
  const get = (lvl) => ({
    interestDelta: lvl === 'interested' ? 1 : 0,
    confirmedDelta: lvl === 'confirmed' ? 1 : 0,
  });
  const prev = get(previousLevel);
  const next = get(newLevel);
  return {
    interestDelta: next.interestDelta - prev.interestDelta,
    confirmedDelta: next.confirmedDelta - prev.confirmedDelta,
  };
}

function eventCounterUpdate(eventId, { interestDelta, confirmedDelta }, tables) {
  if (interestDelta === 0 && confirmedDelta === 0) return null;
  const parts = [];
  const values = {};
  if (interestDelta !== 0) {
    parts.push('interestCount :interestDelta');
    values[':interestDelta'] = interestDelta;
  }
  if (confirmedDelta !== 0) {
    parts.push('confirmedCount :confirmedDelta');
    values[':confirmedDelta'] = confirmedDelta;
  }
  return {
    Update: {
      TableName: tables.eventsTable,
      Key: { eventId },
      UpdateExpression: `ADD ${parts.join(', ')}`,
      ExpressionAttributeValues: values,
    },
  };
}

function interactionRowWrite(event, level, tables) {
  const { userId, eventId, userName, previousLevel } = event.data;
  if (previousLevel == null) {
    return {
      Put: {
        TableName: tables.interactionsTable,
        Item: {
          userId,
          eventId,
          level,
          userName,
          seq: event.seq,
          updatedAt: event.wallTime,
        },
        ConditionExpression: 'attribute_not_exists(eventId)',
      },
    };
  }
  return {
    Update: {
      TableName: tables.interactionsTable,
      Key: { userId, eventId },
      UpdateExpression: 'SET #level = :level, #seq = :seq, updatedAt = :now',
      ConditionExpression: '#seq = :prevSeq',
      ExpressionAttributeNames: { '#level': 'level', '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':level': level,
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
        ':now': event.wallTime,
      },
    },
  };
}

export function projectInterestExpressed(event, tables) {
  const writes = [interactionRowWrite(event, 'interested', tables)];
  const delta = countDelta(event.data.previousLevel, 'interested');
  const counter = eventCounterUpdate(event.data.eventId, delta, tables);
  if (counter) writes.push(counter);
  return writes;
}

export function projectAttendanceConfirmed(event, tables) {
  const writes = [interactionRowWrite(event, 'confirmed', tables)];
  const delta = countDelta(event.data.previousLevel, 'confirmed');
  const counter = eventCounterUpdate(event.data.eventId, delta, tables);
  if (counter) writes.push(counter);
  return writes;
}

export function projectDebriefSubmitted(event, tables) {
  const { userId, eventId, rating, notes } = event.data;
  const debrief = { rating, submittedAt: event.wallTime };
  if (notes !== undefined) debrief.notes = notes;
  return [{
    Update: {
      TableName: tables.interactionsTable,
      Key: { userId, eventId },
      UpdateExpression: 'SET debrief = :debrief, #seq = :seq, updatedAt = :now',
      ConditionExpression: '#seq = :prevSeq',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':debrief': debrief,
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
        ':now': event.wallTime,
      },
    },
  }];
}

export function projectAttendanceWithdrawn(event, tables) {
  const { userId, eventId, previousLevel } = event.data;
  const writes = [{
    Delete: {
      TableName: tables.interactionsTable,
      Key: { userId, eventId },
      ConditionExpression: '#seq = :prevSeq',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: { ':prevSeq': event.seq - 1 },
    },
  }];
  const delta = countDelta(previousLevel, null);
  const counter = eventCounterUpdate(eventId, delta, tables);
  if (counter) writes.push(counter);
  return writes;
}
