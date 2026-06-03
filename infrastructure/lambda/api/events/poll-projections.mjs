// Projections for the Poll aggregate and per-user vote aggregate.
//
// poll#<pollId>:
//   PollCreated → Put on irl-polls with zeroed tallies + open status
//   PollClosed → Update status='closed' (open only) + outcome
//
// poll-vote#<pollId>#<userId>:
//   PollVoteCast → Put/Update vote row, atomic ADD on tallies.<optionId>
//                  (and -1 on previous option if changing); totalVotes
//                  delta is +1 for new, 0 for change, -1 for retract.
//   PollVoteRetracted → Delete vote row + ADD -1 on previous option + -1
//                       on totalVotes.
//
// Per-(poll,user) aggregates keep concurrent voters from contending on
// shared seq; tallies are updated via atomic ADD on a map element.

export function projectPollCreated(event, tables) {
  const d = event.data;
  const tallies = {};
  for (const o of d.options) tallies[o.id] = 0;
  return [{
    Put: {
      TableName: tables.pollsTable,
      Item: {
        eventId: d.eventId,
        pollId: d.pollId,
        byOrganizerId: d.byOrganizerId,
        question: d.question,
        options: d.options,
        status: 'open',
        outcome: null,
        tallies,
        totalVotes: 0,
        createdAt: event.wallTime,
        seq: event.seq,
      },
      ConditionExpression: 'attribute_not_exists(pollId)',
    },
  }];
}

export function projectPollClosed(event, tables) {
  const { pollId, eventId } = event.data;
  const outcome = event.data.outcome ?? null;
  return [{
    Update: {
      TableName: tables.pollsTable,
      Key: { eventId, pollId },
      UpdateExpression:
        'SET #status = :state, outcome = :outcome, closedAt = :now, #seq = :seq',
      ConditionExpression: '#seq = :prevSeq AND #status = :open',
      ExpressionAttributeNames: { '#status': 'status', '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':state': 'closed',
        ':open': 'open',
        ':outcome': outcome,
        ':now': event.wallTime,
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
      },
    },
  }];
}

function voteRowWrite(event, tables) {
  const { pollId, eventId, userId, userName, optionId, previousOptionId } = event.data;
  if (previousOptionId == null) {
    return {
      Put: {
        TableName: tables.pollVotesTable,
        Item: {
          userId,
          pollId,
          eventId,
          userName,
          optionId,
          seq: event.seq,
          updatedAt: event.wallTime,
        },
        ConditionExpression: 'attribute_not_exists(pollId)',
      },
    };
  }
  return {
    Update: {
      TableName: tables.pollVotesTable,
      Key: { userId, pollId },
      UpdateExpression: 'SET optionId = :optionId, #seq = :seq, updatedAt = :now',
      ConditionExpression: '#seq = :prevSeq',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':optionId': optionId,
        ':seq': event.seq,
        ':prevSeq': event.seq - 1,
        ':now': event.wallTime,
      },
    },
  };
}

function tallyCounterUpdate(eventId, pollId, optionId, previousOptionId, tables) {
  const names = { '#tallies': 'tallies' };
  const values = {};
  const adds = ['totalVotes :totalDelta'];

  let totalDelta = 0;
  if (previousOptionId == null) totalDelta = 1;            // first vote
  // Same-option re-votes never reach the projection — short-circuited in handler.
  // Change: delta == 0; Retract uses the separate Retracted projection.

  values[':totalDelta'] = totalDelta;

  if (optionId) {
    names['#optNew'] = optionId;
    adds.push('#tallies.#optNew :addNew');
    values[':addNew'] = 1;
  }
  if (previousOptionId) {
    names['#optPrev'] = previousOptionId;
    adds.push('#tallies.#optPrev :addPrev');
    values[':addPrev'] = -1;
  }

  return {
    Update: {
      TableName: tables.pollsTable,
      Key: { eventId, pollId },
      UpdateExpression: `ADD ${adds.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

export function projectPollVoteCast(event, tables) {
  const { pollId, eventId, optionId, previousOptionId } = event.data;
  const writes = [voteRowWrite(event, tables)];
  writes.push(tallyCounterUpdate(eventId, pollId, optionId, previousOptionId, tables));
  return writes;
}

export function projectPollVoteRetracted(event, tables) {
  const { pollId, eventId, userId, previousOptionId } = event.data;
  return [
    {
      Delete: {
        TableName: tables.pollVotesTable,
        Key: { userId, pollId },
        ConditionExpression: '#seq = :prevSeq',
        ExpressionAttributeNames: { '#seq': 'seq' },
        ExpressionAttributeValues: { ':prevSeq': event.seq - 1 },
      },
    },
    {
      Update: {
        TableName: tables.pollsTable,
        Key: { eventId, pollId },
        UpdateExpression: 'ADD #tallies.#optPrev :addPrev, totalVotes :totalDelta',
        ExpressionAttributeNames: { '#tallies': 'tallies', '#optPrev': previousOptionId },
        ExpressionAttributeValues: { ':addPrev': -1, ':totalDelta': -1 },
      },
    },
  ];
}
