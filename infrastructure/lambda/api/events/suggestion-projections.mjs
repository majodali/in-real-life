// Projections for the Suggestion aggregate and per-user vote aggregate.
//
// suggestion#<suggestionId>:
//   SuggestionMade → Put on irl-suggestions
//   SuggestionWithdrawn → Update status = 'withdrawn' (open only)
//   SuggestionAdopted → Update status = 'adopted' (open only)
//   SuggestionRejected → Update status = 'rejected' (open only) + reason
//   SuggestionResponded → Update organizerResponse
//
// suggestion-vote#<suggestionId>#<userId>:
//   SuggestionVoteExpressed → Put/Update vote row, atomic ADD on counts
//   SuggestionVoteRetracted → Delete vote row, atomic ADD (-1) on counts
//
// Vote aggregates are per-(suggestion,user) so concurrent voters never
// contend on a shared seq. Count changes use atomic ADD on the suggestion
// state row.

export function projectSuggestionMade(event, tables) {
  const d = event.data;
  return [{
    Put: {
      TableName: tables.suggestionsTable,
      Item: {
        eventId: d.eventId,
        suggestionId: d.suggestionId,
        byUserId: d.byUserId,
        byUserName: d.byUserName,
        text: d.text,
        tags: d.tags ?? [],
        status: 'open',
        supportCount: 0,
        objectCount: 0,
        organizerResponse: null,
        createdAt: event.wallTime,
        seq: event.seq,
      },
      ConditionExpression: 'attribute_not_exists(suggestionId)',
    },
  }];
}

function statusTransition(event, tables, newState, extras = {}) {
  const { suggestionId, eventId } = event.data;
  const setParts = ['#status = :state', '#seq = :seq', 'updatedAt = :now'];
  const values = {
    ':state': newState,
    ':open': 'open',
    ':seq': event.seq,
    ':prevSeq': event.seq - 1,
    ':now': event.wallTime,
  };
  for (const [k, v] of Object.entries(extras)) {
    setParts.push(`${k} = :${k}`);
    values[`:${k}`] = v;
  }
  return [{
    Update: {
      TableName: tables.suggestionsTable,
      Key: { eventId, suggestionId },
      UpdateExpression: 'SET ' + setParts.join(', '),
      ConditionExpression: '#seq = :prevSeq AND #status = :open',
      ExpressionAttributeNames: { '#status': 'status', '#seq': 'seq' },
      ExpressionAttributeValues: values,
    },
  }];
}

export function projectSuggestionWithdrawn(event, tables) {
  return statusTransition(event, tables, 'withdrawn');
}

export function projectSuggestionAdopted(event, tables) {
  return statusTransition(event, tables, 'adopted');
}

export function projectSuggestionRejected(event, tables) {
  const { suggestionId, eventId } = event.data;
  const reason = event.data.reason ?? null;
  return [{
    Update: {
      TableName: tables.suggestionsTable,
      Key: { eventId, suggestionId },
      UpdateExpression:
        'SET #status = :state, rejectionReason = :reason, #seq = :seq, updatedAt = :now',
      ConditionExpression: '#seq = :prevSeq AND #status = :open',
      ExpressionAttributeNames: { '#status': 'status', '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':state': 'rejected',
        ':reason': reason,
        ':open': 'open',
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
        ':now': event.wallTime,
      },
    },
  }];
}

export function projectSuggestionResponded(event, tables) {
  const { suggestionId, eventId } = event.data;
  return [{
    Update: {
      TableName: tables.suggestionsTable,
      Key: { eventId, suggestionId },
      UpdateExpression: 'SET organizerResponse = :resp, organizerRespondedAt = :now, #seq = :seq',
      ConditionExpression: '#seq = :prevSeq',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':resp': event.data.response,
        ':now': event.wallTime,
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
      },
    },
  }];
}

// ─── Votes ───

function voteDelta(prev, next) {
  const get = (v) => ({
    supportDelta: v === 'support' ? 1 : 0,
    objectDelta: v === 'object' ? 1 : 0,
  });
  const p = get(prev), n = get(next);
  return {
    supportDelta: n.supportDelta - p.supportDelta,
    objectDelta: n.objectDelta - p.objectDelta,
  };
}

function suggestionCounterAdd(eventId, suggestionId, delta, tables) {
  if (delta.supportDelta === 0 && delta.objectDelta === 0) return null;
  const parts = [];
  const values = {};
  if (delta.supportDelta !== 0) {
    parts.push('supportCount :supportDelta');
    values[':supportDelta'] = delta.supportDelta;
  }
  if (delta.objectDelta !== 0) {
    parts.push('objectCount :objectDelta');
    values[':objectDelta'] = delta.objectDelta;
  }
  return {
    Update: {
      TableName: tables.suggestionsTable,
      Key: { eventId, suggestionId },
      UpdateExpression: `ADD ${parts.join(', ')}`,
      ExpressionAttributeValues: values,
    },
  };
}

function voteRowWrite(event, vote, tables) {
  const { suggestionId, eventId, userId, userName, previous } = event.data;
  if (previous == null) {
    return {
      Put: {
        TableName: tables.suggestionVotesTable,
        Item: {
          userId,
          suggestionId,
          eventId,
          userName,
          vote,
          seq: event.seq,
          updatedAt: event.wallTime,
        },
        ConditionExpression: 'attribute_not_exists(suggestionId)',
      },
    };
  }
  return {
    Update: {
      TableName: tables.suggestionVotesTable,
      Key: { userId, suggestionId },
      UpdateExpression: 'SET #vote = :vote, #seq = :seq, updatedAt = :now',
      ConditionExpression: '#seq = :prevSeq',
      ExpressionAttributeNames: { '#vote': 'vote', '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':vote': vote,
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
        ':now': event.wallTime,
      },
    },
  };
}

export function projectSuggestionVoteExpressed(event, tables) {
  const { suggestionId, eventId, vote, previous } = event.data;
  const writes = [voteRowWrite(event, vote, tables)];
  const counter = suggestionCounterAdd(eventId, suggestionId, voteDelta(previous, vote), tables);
  if (counter) writes.push(counter);
  return writes;
}

export function projectSuggestionVoteRetracted(event, tables) {
  const { suggestionId, eventId, userId, previous } = event.data;
  const writes = [{
    Delete: {
      TableName: tables.suggestionVotesTable,
      Key: { userId, suggestionId },
      ConditionExpression: '#seq = :prevSeq',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: { ':prevSeq': event.seq - 1 },
    },
  }];
  const counter = suggestionCounterAdd(eventId, suggestionId, voteDelta(previous, null), tables);
  if (counter) writes.push(counter);
  return writes;
}
