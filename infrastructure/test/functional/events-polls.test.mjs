// Functional tests for slice-6 poll endpoints.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb } from '../helpers/cleanup.mjs';

let config;
let organizer;
let other;
let createdEventIds;

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  organizer = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `organizer-${randomUUID()}@example.test`,
  });
  other = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `other-${randomUUID()}@example.test`,
  });
  createdEventIds = [];
});

afterEach(async () => {
  for (const eventId of createdEventIds) {
    await ddb.send(new DeleteCommand({ TableName: config.tables.events, Key: { eventId } }));
    const polls = await ddb.send(new QueryCommand({
      TableName: config.tables.polls,
      KeyConditionExpression: 'eventId = :e',
      ExpressionAttributeValues: { ':e': eventId },
    }));
    for (const p of polls.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: config.tables.polls,
        Key: { eventId: p.eventId, pollId: p.pollId },
      }));
      for (const u of [organizer, other]) {
        await ddb.send(new DeleteCommand({
          TableName: config.tables.pollVotes,
          Key: { userId: u.sub, pollId: p.pollId },
        })).catch(() => {});
      }
      const pollAgg = `poll#${p.pollId}`;
      const evs = await ddb.send(new QueryCommand({
        TableName: config.tables.eventsLog,
        KeyConditionExpression: 'aggregateId = :a',
        ExpressionAttributeValues: { ':a': pollAgg },
      }));
      for (const ev of evs.Items ?? []) {
        await ddb.send(new DeleteCommand({
          TableName: config.tables.eventsLog,
          Key: { aggregateId: ev.aggregateId, seq: ev.seq },
        }));
      }
    }
    const evs = await ddb.send(new QueryCommand({
      TableName: config.tables.eventsLog,
      KeyConditionExpression: 'aggregateId = :a',
      ExpressionAttributeValues: { ':a': `event#${eventId}` },
    }));
    for (const ev of evs.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: config.tables.eventsLog,
        Key: { aggregateId: ev.aggregateId, seq: ev.seq },
      }));
    }
  }
  createdEventIds = [];

  for (const u of [organizer, other]) {
    if (!u) continue;
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: u.email }); } catch { /* ignore */ }
  }
  organizer = null; other = null;
});

async function proposeEvent(token) {
  const body = {
    commandId: randomUUID(),
    title: `Coffee walk ${randomUUID().slice(0, 6)}`,
    startTime: '2026-12-01T16:00:00.000Z',
    endTime: '2026-12-01T17:30:00.000Z',
    location: 'Blackbird Bakery',
    organizerName: 'Organizer',
  };
  const res = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`propose failed: ${res.status}`);
  const out = await res.json();
  createdEventIds.push(out.eventId);
  return out.eventId;
}

async function makePoll(token, eventId, body) {
  return fetch(`${config.apiUrl}/events/${eventId}/polls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), ...body }),
  });
}

async function listPolls(token, eventId) {
  const res = await fetch(`${config.apiUrl}/events/${eventId}/polls`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function vote(token, eventId, pollId, optionId) {
  return fetch(`${config.apiUrl}/events/${eventId}/polls/${pollId}/vote`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), optionId }),
  });
}

test('end-to-end: organizer creates poll → others vote → tallies update → organizer closes', async () => {
  const eventId = await proposeEvent(organizer.idToken);

  const create = await makePoll(organizer.idToken, eventId, {
    question: 'Which Saturday?',
    options: ['Jun 6', 'Jun 13', 'Jun 20'],
  });
  assert.equal(create.status, 201);
  const { pollId } = await create.json();

  let body = await listPolls(other.idToken, eventId);
  const poll = body.polls.find((p) => p.pollId === pollId);
  assert.equal(poll.options.length, 3);
  assert.equal(poll.totalVotes, 0);

  const v1 = await vote(other.idToken, eventId, pollId, poll.options[0].id);
  assert.equal(v1.status, 201);
  body = await listPolls(organizer.idToken, eventId);
  let p = body.polls.find((x) => x.pollId === pollId);
  assert.equal(p.totalVotes, 1);
  assert.equal(p.tallies[poll.options[0].id], 1);

  // Voter changes their mind
  const v2 = await vote(other.idToken, eventId, pollId, poll.options[1].id);
  assert.equal(v2.status, 201);
  body = await listPolls(other.idToken, eventId);
  p = body.polls.find((x) => x.pollId === pollId);
  assert.equal(p.totalVotes, 1);
  assert.equal(p.tallies[poll.options[0].id], 0);
  assert.equal(p.tallies[poll.options[1].id], 1);
  assert.equal(p.myVote, poll.options[1].id);

  const close = await fetch(`${config.apiUrl}/events/${eventId}/polls/${pollId}/close`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), outcome: poll.options[1].id }),
  });
  assert.equal(close.status, 201);

  body = await listPolls(organizer.idToken, eventId);
  p = body.polls.find((x) => x.pollId === pollId);
  assert.equal(p.status, 'closed');
  assert.equal(p.outcome, poll.options[1].id);
});

test('non-organizer cannot create a poll', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const res = await makePoll(other.idToken, eventId, {
    question: 'Anything?',
    options: ['Yes', 'No'],
  });
  assert.equal(res.status, 403);
});

test('voting on a closed poll → 409', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const create = await makePoll(organizer.idToken, eventId, {
    question: 'Which?',
    options: ['A', 'B'],
  });
  const { pollId } = await create.json();
  const body = await listPolls(organizer.idToken, eventId);
  const poll = body.polls[0];

  await fetch(`${config.apiUrl}/events/${eventId}/polls/${pollId}/close`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });

  const v = await vote(other.idToken, eventId, pollId, poll.options[0].id);
  assert.equal(v.status, 409);
});

test('retract vote: removes the vote and decrements tallies', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const create = await makePoll(organizer.idToken, eventId, {
    question: 'X', options: ['A','B'],
  });
  const { pollId } = await create.json();
  const initial = await listPolls(organizer.idToken, eventId);
  const opt = initial.polls[0].options[0];

  await vote(other.idToken, eventId, pollId, opt.id);
  let body = await listPolls(other.idToken, eventId);
  assert.equal(body.polls[0].totalVotes, 1);

  const ret = await fetch(`${config.apiUrl}/events/${eventId}/polls/${pollId}/vote`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(ret.status, 201);

  body = await listPolls(other.idToken, eventId);
  assert.equal(body.polls[0].totalVotes, 0);
  assert.equal(body.polls[0].tallies[opt.id], 0);
  assert.equal(body.polls[0].myVote, null);
});
