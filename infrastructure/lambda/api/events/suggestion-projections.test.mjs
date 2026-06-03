// Specifications for suggestion + vote projections.
//
// Suggestions live on aggregate suggestion#<suggestionId>; votes on
// suggestion-vote#<suggestionId>#<userId>. Counters (supportCount /
// objectCount) sit on the suggestion state row and are mutated via
// atomic ADD by vote projections so concurrent voters don't contend.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectSuggestionMade,
  projectSuggestionWithdrawn,
  projectSuggestionAdopted,
  projectSuggestionRejected,
  projectSuggestionResponded,
  projectSuggestionVoteExpressed,
  projectSuggestionVoteRetracted,
} from './suggestion-projections.mjs';

const tables = {
  suggestionsTable: 'irl-suggestions-test',
  suggestionVotesTable: 'irl-suggestion-votes-test',
};

const madeBase = {
  eventType: 'SuggestionMade',
  version: 1,
  seq: 1,
  aggregateId: 'suggestion#sug-1',
  wallTime: '2026-06-01T12:00:00.000Z',
  data: {
    suggestionId: 'sug-1',
    eventId: 'evt-1',
    byUserId: 'user-a',
    byUserName: 'Alex',
    text: "Let's do Saturday morning at the library",
    tags: ['time', 'place'],
  },
};

const withdrawnBase = {
  eventType: 'SuggestionWithdrawn',
  version: 1,
  seq: 2,
  aggregateId: 'suggestion#sug-1',
  wallTime: '2026-06-02T12:00:00.000Z',
  data: { suggestionId: 'sug-1', eventId: 'evt-1' },
};

const adoptedBase = {
  eventType: 'SuggestionAdopted',
  version: 1,
  seq: 2,
  aggregateId: 'suggestion#sug-1',
  wallTime: '2026-06-02T13:00:00.000Z',
  data: { suggestionId: 'sug-1', eventId: 'evt-1' },
};

const rejectedBase = {
  eventType: 'SuggestionRejected',
  version: 1,
  seq: 2,
  aggregateId: 'suggestion#sug-1',
  wallTime: '2026-06-02T14:00:00.000Z',
  data: { suggestionId: 'sug-1', eventId: 'evt-1', reason: "Doesn't fit the venue" },
};

const respondedBase = {
  eventType: 'SuggestionResponded',
  version: 1,
  seq: 2,
  aggregateId: 'suggestion#sug-1',
  wallTime: '2026-06-02T15:00:00.000Z',
  data: { suggestionId: 'sug-1', eventId: 'evt-1', response: 'Good point — I\'ll think about it.' },
};

const voteBase = {
  eventType: 'SuggestionVoteExpressed',
  version: 1,
  seq: 1,
  aggregateId: 'suggestion-vote#sug-1#user-b',
  wallTime: '2026-06-01T13:00:00.000Z',
  data: {
    suggestionId: 'sug-1',
    eventId: 'evt-1',
    userId: 'user-b',
    userName: 'Brook',
    vote: 'support',
    previous: null,
  },
};

const voteRetractedBase = {
  eventType: 'SuggestionVoteRetracted',
  version: 1,
  seq: 2,
  aggregateId: 'suggestion-vote#sug-1#user-b',
  wallTime: '2026-06-02T13:00:00.000Z',
  data: {
    suggestionId: 'sug-1',
    eventId: 'evt-1',
    userId: 'user-b',
    previous: 'support',
  },
};

// ─── SuggestionMade ───

test('SuggestionMade: Puts row on suggestions table', () => {
  const writes = projectSuggestionMade(madeBase, tables);
  const put = writes.find((w) => w.Put);
  assert.ok(put);
  assert.equal(put.Put.TableName, 'irl-suggestions-test');
  assert.equal(put.Put.Item.eventId, 'evt-1');
  assert.equal(put.Put.Item.suggestionId, 'sug-1');
  assert.equal(put.Put.Item.byUserId, 'user-a');
  assert.equal(put.Put.Item.byUserName, 'Alex');
  assert.equal(put.Put.Item.text, "Let's do Saturday morning at the library");
  assert.deepEqual(put.Put.Item.tags, ['time', 'place']);
  assert.equal(put.Put.Item.status, 'open');
  assert.equal(put.Put.Item.supportCount, 0);
  assert.equal(put.Put.Item.objectCount, 0);
  assert.equal(put.Put.Item.organizerResponse, null);
  assert.equal(put.Put.Item.createdAt, '2026-06-01T12:00:00.000Z');
  assert.equal(put.Put.Item.seq, 1);
  assert.match(put.Put.ConditionExpression, /attribute_not_exists/);
});

test('SuggestionMade: empty tags array OK', () => {
  const ev = { ...madeBase, data: { ...madeBase.data, tags: [] } };
  const writes = projectSuggestionMade(ev, tables);
  const put = writes.find((w) => w.Put);
  assert.deepEqual(put.Put.Item.tags, []);
});

// ─── Status transitions ───

test('SuggestionWithdrawn: Updates status to withdrawn, conditioned on seq + open status', () => {
  const writes = projectSuggestionWithdrawn(withdrawnBase, tables);
  const update = writes.find((w) => w.Update);
  assert.equal(update.Update.TableName, 'irl-suggestions-test');
  assert.deepEqual(update.Update.Key, { eventId: 'evt-1', suggestionId: 'sug-1' });
  assert.equal(update.Update.ExpressionAttributeValues[':state'], 'withdrawn');
  assert.match(update.Update.ConditionExpression, /#seq = :prevSeq/);
  assert.match(update.Update.ConditionExpression, /#status = :open/);
});

test('SuggestionAdopted: Updates status to adopted', () => {
  const writes = projectSuggestionAdopted(adoptedBase, tables);
  const update = writes.find((w) => w.Update);
  assert.equal(update.Update.ExpressionAttributeValues[':state'], 'adopted');
});

test('SuggestionRejected: Updates status + records reason', () => {
  const writes = projectSuggestionRejected(rejectedBase, tables);
  const update = writes.find((w) => w.Update);
  assert.equal(update.Update.ExpressionAttributeValues[':state'], 'rejected');
  assert.equal(update.Update.ExpressionAttributeValues[':reason'], "Doesn't fit the venue");
});

test('SuggestionRejected: reason null when omitted', () => {
  const ev = { ...rejectedBase, data: { suggestionId: 'sug-1', eventId: 'evt-1' } };
  const writes = projectSuggestionRejected(ev, tables);
  const update = writes.find((w) => w.Update);
  assert.equal(update.Update.ExpressionAttributeValues[':reason'], null);
});

// ─── Response ───

test('SuggestionResponded: Updates organizerResponse', () => {
  const writes = projectSuggestionResponded(respondedBase, tables);
  const update = writes.find((w) => w.Update);
  assert.match(update.Update.UpdateExpression, /organizerResponse/);
  assert.equal(update.Update.ExpressionAttributeValues[':resp'], 'Good point — I\'ll think about it.');
});

// ─── Votes ───

test('SuggestionVoteExpressed first time: Puts vote row + ADD +1 supportCount', () => {
  const writes = projectSuggestionVoteExpressed(voteBase, tables);
  const put = writes.find((w) => w.Put);
  assert.equal(put.Put.TableName, 'irl-suggestion-votes-test');
  assert.equal(put.Put.Item.userId, 'user-b');
  assert.equal(put.Put.Item.suggestionId, 'sug-1');
  assert.equal(put.Put.Item.vote, 'support');

  const counter = writes.find((w) => w.Update?.TableName === 'irl-suggestions-test');
  assert.match(counter.Update.UpdateExpression, /ADD/);
  assert.equal(counter.Update.ExpressionAttributeValues[':supportDelta'], 1);
  assert.equal(counter.Update.ExpressionAttributeValues[':objectDelta'] ?? 0, 0);
});

test('SuggestionVoteExpressed object vote first time: ADD +1 objectCount', () => {
  const ev = { ...voteBase, data: { ...voteBase.data, vote: 'object' } };
  const writes = projectSuggestionVoteExpressed(ev, tables);
  const counter = writes.find((w) => w.Update?.TableName === 'irl-suggestions-test');
  assert.equal(counter.Update.ExpressionAttributeValues[':objectDelta'], 1);
});

test('SuggestionVoteExpressed flipping support → object: -1 support, +1 object, Update vote row', () => {
  const ev = {
    ...voteBase, seq: 2,
    data: { ...voteBase.data, vote: 'object', previous: 'support' },
  };
  const writes = projectSuggestionVoteExpressed(ev, tables);
  const counter = writes.find((w) => w.Update?.TableName === 'irl-suggestions-test');
  assert.equal(counter.Update.ExpressionAttributeValues[':supportDelta'], -1);
  assert.equal(counter.Update.ExpressionAttributeValues[':objectDelta'], 1);

  const voteUpdate = writes.find((w) => w.Update?.TableName === 'irl-suggestion-votes-test');
  assert.ok(voteUpdate, 'expected Update on votes table');
  assert.match(voteUpdate.Update.ConditionExpression, /#seq = :prevSeq/);
});

test('SuggestionVoteRetracted from support: -1 support, Delete vote row', () => {
  const writes = projectSuggestionVoteRetracted(voteRetractedBase, tables);
  const del = writes.find((w) => w.Delete);
  assert.equal(del.Delete.TableName, 'irl-suggestion-votes-test');
  assert.deepEqual(del.Delete.Key, { userId: 'user-b', suggestionId: 'sug-1' });

  const counter = writes.find((w) => w.Update?.TableName === 'irl-suggestions-test');
  assert.equal(counter.Update.ExpressionAttributeValues[':supportDelta'], -1);
});

test('SuggestionVoteRetracted from object: -1 object', () => {
  const ev = { ...voteRetractedBase, data: { ...voteRetractedBase.data, previous: 'object' } };
  const writes = projectSuggestionVoteRetracted(ev, tables);
  const counter = writes.find((w) => w.Update?.TableName === 'irl-suggestions-test');
  assert.equal(counter.Update.ExpressionAttributeValues[':objectDelta'], -1);
});
