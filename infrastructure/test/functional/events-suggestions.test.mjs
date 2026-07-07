// Functional tests for slice-5 suggestion endpoints.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb } from '../helpers/cleanup.mjs';
import { isoFromNow, DAY, MINUTE } from '../helpers/time.mjs';

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
    // Clean suggestions for the event.
    const sugs = await ddb.send(new QueryCommand({
      TableName: config.tables.suggestions,
      KeyConditionExpression: 'eventId = :e',
      ExpressionAttributeValues: { ':e': eventId },
    }));
    for (const s of sugs.Items ?? []) {
      await ddb.send(new DeleteCommand({
        TableName: config.tables.suggestions,
        Key: { eventId: s.eventId, suggestionId: s.suggestionId },
      }));
      for (const u of [organizer, other]) {
        await ddb.send(new DeleteCommand({
          TableName: config.tables.suggestionVotes,
          Key: { userId: u.sub, suggestionId: s.suggestionId },
        })).catch(() => {});
      }
      const sugAgg = `suggestion#${s.suggestionId}`;
      const evs = await ddb.send(new QueryCommand({
        TableName: config.tables.eventsLog,
        KeyConditionExpression: 'aggregateId = :a',
        ExpressionAttributeValues: { ':a': sugAgg },
      }));
      for (const ev of evs.Items ?? []) {
        await ddb.send(new DeleteCommand({
          TableName: config.tables.eventsLog,
          Key: { aggregateId: ev.aggregateId, seq: ev.seq },
        }));
      }
    }
    // event-aggregate log entries.
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
    startTime: isoFromNow(30 * DAY),
    endTime: isoFromNow(30 * DAY + 90 * MINUTE),
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

async function makeSuggestion(token, eventId, text, tags = []) {
  return fetch(`${config.apiUrl}/events/${eventId}/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), text, tags }),
  });
}

async function listSuggestions(token, eventId) {
  const res = await fetch(`${config.apiUrl}/events/${eventId}/suggestions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function vote(token, eventId, suggestionId, voteValue) {
  return fetch(`${config.apiUrl}/events/${eventId}/suggestions/${suggestionId}/vote`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), vote: voteValue }),
  });
}

test('end-to-end: make → list → vote → flip vote → see counts', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r1 = await makeSuggestion(other.idToken, eventId, "Let's do Saturday morning", ['time']);
  assert.equal(r1.status, 201);
  const { suggestionId } = await r1.json();

  const v1 = await vote(organizer.idToken, eventId, suggestionId, 'support');
  assert.equal(v1.status, 201);
  let body = await listSuggestions(other.idToken, eventId);
  assert.equal(body.suggestions[0].supportCount, 1);
  assert.equal(body.suggestions[0].objectCount, 0);

  const v2 = await vote(organizer.idToken, eventId, suggestionId, 'object');
  assert.equal(v2.status, 201);
  body = await listSuggestions(other.idToken, eventId);
  assert.equal(body.suggestions[0].supportCount, 0);
  assert.equal(body.suggestions[0].objectCount, 1);

  // The caller sees their own vote.
  body = await listSuggestions(organizer.idToken, eventId);
  assert.equal(body.suggestions[0].myVote, 'object');
});

test('organizer responds to a suggestion', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r = await makeSuggestion(other.idToken, eventId, 'Is this kid-friendly?');
  const { suggestionId } = await r.json();

  const resp = await fetch(`${config.apiUrl}/events/${eventId}/suggestions/${suggestionId}/response`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), response: 'Yes — kids welcome.' }),
  });
  assert.equal(resp.status, 201);
  const body = await listSuggestions(other.idToken, eventId);
  assert.equal(body.suggestions[0].organizerResponse, 'Yes — kids welcome.');
});

test('author can withdraw their own suggestion', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r = await makeSuggestion(other.idToken, eventId, 'A passing thought');
  const { suggestionId } = await r.json();

  const w = await fetch(`${config.apiUrl}/events/${eventId}/suggestions/${suggestionId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), status: 'withdrawn' }),
  });
  assert.equal(w.status, 201);
  const body = await listSuggestions(organizer.idToken, eventId);
  assert.equal(body.suggestions[0].status, 'withdrawn');
});

test('organizer can adopt; non-organizer cannot', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  const r = await makeSuggestion(other.idToken, eventId, 'Worth doing');
  const { suggestionId } = await r.json();

  const denied = await fetch(`${config.apiUrl}/events/${eventId}/suggestions/${suggestionId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), status: 'adopted' }),
  });
  assert.equal(denied.status, 403);

  const ok = await fetch(`${config.apiUrl}/events/${eventId}/suggestions/${suggestionId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), status: 'adopted' }),
  });
  assert.equal(ok.status, 201);
});

test('suggestions blocked once event is cancelled (closed → 409)', async () => {
  const eventId = await proposeEvent(organizer.idToken);
  await fetch(`${config.apiUrl}/events/${eventId}/cancel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  const r = await makeSuggestion(other.idToken, eventId, 'too late');
  assert.equal(r.status, 409);
});
