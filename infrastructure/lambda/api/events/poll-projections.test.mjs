// Specifications for poll + poll-vote projections.
//
// poll#<pollId> aggregates the poll lifecycle (PollCreated, PollClosed).
// poll-vote#<pollId>#<userId> aggregates a single user's vote choice
// (PollVoteCast, PollVoteRetracted) with optimistic seq control.
//
// Tallies are stored as a map on the poll row: { tallies: { [optionId]: N }, totalVotes: N }.
// Vote-cast/retract projections use atomic ADD on tallies.<optionId> so
// concurrent voters never contend on a shared seq.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectPollCreated,
  projectPollClosed,
  projectPollVoteCast,
  projectPollVoteRetracted,
} from './poll-projections.mjs';

const tables = { pollsTable: 'irl-polls-test', pollVotesTable: 'irl-poll-votes-test' };

const createdBase = {
  eventType: 'PollCreated',
  version: 1,
  seq: 1,
  aggregateId: 'poll#poll-1',
  wallTime: '2026-06-01T10:00:00.000Z',
  data: {
    pollId: 'poll-1',
    eventId: 'evt-1',
    byOrganizerId: 'organizer-1',
    question: 'Which Saturday works?',
    options: [
      { id: 'opt-a', label: 'Jun 6' },
      { id: 'opt-b', label: 'Jun 13' },
      { id: 'opt-c', label: 'Jun 20' },
    ],
  },
};

const closedBase = {
  eventType: 'PollClosed',
  version: 1,
  seq: 2,
  aggregateId: 'poll#poll-1',
  wallTime: '2026-06-02T10:00:00.000Z',
  data: { pollId: 'poll-1', eventId: 'evt-1', outcome: 'opt-b' },
};

const voteBase = {
  eventType: 'PollVoteCast',
  version: 1,
  seq: 1,
  aggregateId: 'poll-vote#poll-1#user-b',
  wallTime: '2026-06-01T11:00:00.000Z',
  data: {
    pollId: 'poll-1',
    eventId: 'evt-1',
    userId: 'user-b',
    userName: 'Brook',
    optionId: 'opt-a',
    previousOptionId: null,
  },
};

const voteRetractBase = {
  eventType: 'PollVoteRetracted',
  version: 1,
  seq: 2,
  aggregateId: 'poll-vote#poll-1#user-b',
  wallTime: '2026-06-02T11:00:00.000Z',
  data: {
    pollId: 'poll-1',
    eventId: 'evt-1',
    userId: 'user-b',
    previousOptionId: 'opt-a',
  },
};

// ─── PollCreated ───

test('PollCreated: Puts row with options + zeroed tallies', () => {
  const writes = projectPollCreated(createdBase, tables);
  const put = writes.find((w) => w.Put);
  assert.ok(put);
  assert.equal(put.Put.TableName, 'irl-polls-test');
  const item = put.Put.Item;
  assert.equal(item.eventId, 'evt-1');
  assert.equal(item.pollId, 'poll-1');
  assert.equal(item.byOrganizerId, 'organizer-1');
  assert.equal(item.question, 'Which Saturday works?');
  assert.equal(item.options.length, 3);
  assert.equal(item.status, 'open');
  assert.equal(item.outcome, null);
  assert.deepEqual(item.tallies, { 'opt-a': 0, 'opt-b': 0, 'opt-c': 0 });
  assert.equal(item.totalVotes, 0);
  assert.equal(item.seq, 1);
  assert.match(put.Put.ConditionExpression, /attribute_not_exists/);
});

// ─── PollClosed ───

test('PollClosed: Updates status to closed and records outcome', () => {
  const writes = projectPollClosed(closedBase, tables);
  const update = writes.find((w) => w.Update);
  assert.match(update.Update.UpdateExpression, /#status = :state/);
  assert.equal(update.Update.ExpressionAttributeValues[':state'], 'closed');
  assert.equal(update.Update.ExpressionAttributeValues[':outcome'], 'opt-b');
  // Guarded on prior seq + status=open
  assert.match(update.Update.ConditionExpression, /#seq = :prevSeq/);
  assert.match(update.Update.ConditionExpression, /#status = :open/);
});

test('PollClosed: outcome null when omitted', () => {
  const ev = { ...closedBase, data: { pollId: 'poll-1', eventId: 'evt-1' } };
  const writes = projectPollClosed(ev, tables);
  const update = writes.find((w) => w.Update);
  assert.equal(update.Update.ExpressionAttributeValues[':outcome'], null);
});

// ─── PollVoteCast ───

test('PollVoteCast first time: Put vote row + ADD +1 tallies[optionId] + totalVotes', () => {
  const writes = projectPollVoteCast(voteBase, tables);

  const put = writes.find((w) => w.Put);
  assert.ok(put);
  assert.equal(put.Put.TableName, 'irl-poll-votes-test');
  assert.equal(put.Put.Item.userId, 'user-b');
  assert.equal(put.Put.Item.pollId, 'poll-1');
  assert.equal(put.Put.Item.optionId, 'opt-a');

  const counter = writes.find((w) => w.Update?.TableName === 'irl-polls-test');
  assert.ok(counter);
  // ADD on tallies.<optionId> with name placeholder for safety.
  assert.match(counter.Update.UpdateExpression, /ADD/);
  assert.match(counter.Update.UpdateExpression, /totalVotes/);
  // Increment for the chosen option.
  const names = counter.Update.ExpressionAttributeNames;
  const values = counter.Update.ExpressionAttributeValues;
  const optionPlaceholder = Object.entries(names).find(([k, v]) => v === 'opt-a')?.[0];
  assert.ok(optionPlaceholder, 'expected attribute-name placeholder for the option');
  assert.equal(values[':delta_opt-a'] ?? values[`:add_${optionPlaceholder.slice(1)}`] ?? values[':addNew'], 1);
  assert.equal(values[':totalDelta'], 1);
});

test('PollVoteCast changing vote: ADD +1 new, ADD -1 previous; totalVotes unchanged', () => {
  const ev = {
    ...voteBase, seq: 2,
    data: { ...voteBase.data, optionId: 'opt-b', previousOptionId: 'opt-a' },
  };
  const writes = projectPollVoteCast(ev, tables);

  const voteUpdate = writes.find((w) => w.Update?.TableName === 'irl-poll-votes-test');
  assert.ok(voteUpdate, 'expected Update on votes table when row exists');
  assert.match(voteUpdate.Update.UpdateExpression, /SET/);
  assert.match(voteUpdate.Update.ConditionExpression, /#seq = :prevSeq/);

  const counter = writes.find((w) => w.Update?.TableName === 'irl-polls-test');
  const names = counter.Update.ExpressionAttributeNames;
  const values = counter.Update.ExpressionAttributeValues;
  const newPh = Object.entries(names).find(([k, v]) => v === 'opt-b')?.[0];
  const prevPh = Object.entries(names).find(([k, v]) => v === 'opt-a')?.[0];
  assert.ok(newPh && prevPh);
  assert.equal(values[':addNew'] ?? values[`:delta_opt-b`], 1);
  assert.equal(values[':addPrev'] ?? values[`:delta_opt-a`], -1);
  assert.equal(values[':totalDelta'] ?? 0, 0);
});

// ─── PollVoteRetracted ───

test('PollVoteRetracted: Delete vote row + ADD -1 on previous tally + totalVotes -1', () => {
  const writes = projectPollVoteRetracted(voteRetractBase, tables);

  const del = writes.find((w) => w.Delete);
  assert.equal(del.Delete.TableName, 'irl-poll-votes-test');
  assert.deepEqual(del.Delete.Key, { userId: 'user-b', pollId: 'poll-1' });
  assert.match(del.Delete.ConditionExpression, /#seq = :prevSeq/);

  const counter = writes.find((w) => w.Update?.TableName === 'irl-polls-test');
  const names = counter.Update.ExpressionAttributeNames;
  const values = counter.Update.ExpressionAttributeValues;
  const prevPh = Object.entries(names).find(([k, v]) => v === 'opt-a')?.[0];
  assert.ok(prevPh);
  assert.equal(values[':addPrev'] ?? values[':delta_opt-a'], -1);
  assert.equal(values[':totalDelta'], -1);
});
