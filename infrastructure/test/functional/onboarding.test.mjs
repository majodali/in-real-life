// Functional tests for the onboarding interview
// (docs/onboarding-interview.md): the ephemeral per-turn loop
// (POST /me/interview/turn), completion (POST /me/onboarding →
// OnboardingCompleted with the extraction frozen in the event), and the
// async Streams projector seeding the irl-user-model read store — polled,
// because it is eventually consistent by design. On this workshop-mode
// stack the LLM seam answers with the deterministic stub (D37), whose
// extraction seeds a 'pottery' interest — which this suite then follows
// all the way into GET /events recommendations (feed ranking,
// docs/matching-spec.md).

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb, purgeUserAggregate, purgeEventAggregate, readDataKey } from '../helpers/cleanup.mjs';
import { waitFor } from '../helpers/poll.mjs';
import { HOUR } from '../helpers/time.mjs';
import { decryptValue } from '../../lambda/api/lib/crypto-shred.mjs';

let config;
let user;
let createdEventIds;

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  user = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `onboardee-${randomUUID()}@example.test`,
  });
  createdEventIds = [];

  const res = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(res.status, 201);
});

afterEach(async () => {
  for (const eventId of createdEventIds) {
    await purgeEventAggregate({
      eventId, userIds: [user?.sub].filter(Boolean), tables: config.tables,
    }).catch(() => {});
  }
  if (user) {
    try { await purgeUserAggregate({ userId: user.sub, tables: config.tables }); } catch { /* ignore */ }
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: user.email }); } catch { /* ignore */ }
  }
  user = null;
});

async function interviewTurn(transcript) {
  const res = await fetch(`${config.apiUrl}/me/interview/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ transcript }),
  });
  return { status: res.status, body: await res.json() };
}

async function completeOnboarding(commandId, transcript) {
  const res = await fetch(`${config.apiUrl}/me/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ commandId, transcript }),
  });
  return { status: res.status, body: await res.json() };
}

const TRANSCRIPT = [
  { role: 'us', text: 'Welcome — what would you love more of in your week?' },
  { role: 'member', text: 'Honestly, making things with my hands. I loved a pottery class once.' },
  { role: 'us', text: 'Tell us about a recent time being around people felt easy.' },
  { role: 'member', text: 'Small pottery class — everyone had something to do.' },
  { role: 'us', text: 'How often would getting out feel right?' },
  { role: 'member', text: 'Once a week, evenings.' },
];

test('onboarding: turn loop runs to a close, completion lands, and the projector seeds the model', async () => {
  // Ephemeral turn loop: first turn opens with a card…
  const first = await interviewTurn([]);
  assert.equal(first.status, 200);
  assert.equal(first.body.done, false);
  assert.equal(typeof first.body.card?.prompt, 'string');

  // …and a transcript with three member turns reaches the close (stub script).
  const last = await interviewTurn(TRANSCRIPT);
  assert.equal(last.status, 200);
  assert.equal(last.body.done, true);
  assert.equal(typeof last.body.closing?.message, 'string');

  // Completion: one extraction call at command time, frozen in the event.
  const commandId = randomUUID();
  const done = await completeOnboarding(commandId, TRANSCRIPT);
  assert.equal(done.status, 201);
  assert.equal(done.body.status, 'onboarding-complete');

  // Idempotent retry converges; a fresh command is refused.
  assert.equal((await completeOnboarding(commandId, TRANSCRIPT)).status, 200);
  assert.equal((await completeOnboarding(randomUUID(), TRANSCRIPT)).status, 409);

  // The interview is closed once onboarding completes.
  assert.equal((await interviewTurn([])).status, 409);

  // Async projector: poll the read store until the seed lands. Items are
  // encrypted under the member's key — decrypt to prove the store is real,
  // not just present.
  const readModelRow = async (sk) => {
    const out = await ddb.send(new GetCommand({
      TableName: config.tables.userModel,
      Key: { userId: user.sub, sk },
      ConsistentRead: true,
    }));
    return out.Item ?? null;
  };
  const core = await waitFor(() => readModelRow('profile#core'), { label: 'profile#core seed' });
  const interest = await waitFor(() => readModelRow('interest#pottery'), { label: 'interest seed' });

  const dataKey = await readDataKey({ aggregateId: `user#${user.sub}`, tables: config.tables });
  assert.ok(dataKey, 'user data key expected');
  const corePayload = decryptValue(core.model, dataKey);
  assert.ok(corePayload.envelope, 'profile#core should carry the envelope');
  const interestPayload = decryptValue(interest.model, dataKey);
  assert.equal(interestPayload.tag, 'pottery');

  // Feed ranking consumes the model: a pottery event is a feasible,
  // recommended candidate for this member. Times are anchored to the
  // SIMULATED clock so a stale workshop offset can't age the event.
  const timeRes = await fetch(`${config.apiUrl}/time`, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  });
  const simulatedNow = Date.parse((await timeRes.json()).simulatedTime);
  const proposeRes = await fetch(`${config.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({
      commandId: randomUUID(),
      title: `Pottery wheel intro ${randomUUID().slice(0, 6)}`,
      startTime: new Date(simulatedNow + 2 * HOUR).toISOString(),
      endTime: new Date(simulatedNow + 3 * HOUR).toISOString(),
      location: 'The studio',
      organizerName: 'Onboardee',
    }),
  });
  assert.equal(proposeRes.status, 201);
  const { eventId } = await proposeRes.json();
  createdEventIds.push(eventId);

  const feedRes = await fetch(`${config.apiUrl}/events`, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  });
  const feed = await feedRes.json();
  assert.ok(Array.isArray(feed.recommendations), 'recommendations must be an array');
  assert.ok(feed.recommendations.includes(eventId),
    'the pottery event should be among this member\'s recommendations');
});

test('onboarding: completion requires a registered user and a transcript', async () => {
  const noTranscript = await completeOnboarding(randomUUID(), []);
  assert.equal(noTranscript.status, 400);

  const badEntries = await fetch(`${config.apiUrl}/me/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), transcript: [{ nope: true }] }),
  });
  assert.equal(badEntries.status, 400);
});
