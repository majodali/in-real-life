// Functional tests for model legibility (D59,
// docs/profile-and-legibility.md): GET /me/model renders the member's
// own Layer 2 member-facing (never Layer 3, never a weight or score),
// and POST /me/model/correction round-trips through the command runner
// and the async projector — the member's word visibly takes.
//
// On this workshop-mode stack the onboarding extraction is the D37 stub,
// which seeds positions (groupSize small, structure activity-anchored
// with an open-conversation growth edge, familiarity needs-known-face)
// alongside the pottery interest — the fixture this suite leans on.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate } from '../helpers/cleanup.mjs';
import { waitFor } from '../helpers/poll.mjs';
import { projectorDiagnostics } from '../helpers/diagnose.mjs';

let config;
let user;

before(async () => {
  config = await loadTestConfig();
});

beforeEach(async () => {
  user = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `model-viewer-${randomUUID()}@example.test`,
  });
  const res = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(res.status, 201);
});

afterEach(async () => {
  if (user) {
    try { await purgeUserAggregate({ userId: user.sub, tables: config.tables }); } catch { /* ignore */ }
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: user.email }); } catch { /* ignore */ }
  }
  user = null;
});

async function getModel() {
  const res = await fetch(`${config.apiUrl}/me/model`, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  });
  return { status: res.status, body: await res.json() };
}

async function correctModel(correction) {
  const res = await fetch(`${config.apiUrl}/me/model/correction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), correction }),
  });
  return { status: res.status, body: await res.json() };
}

async function completeOnboarding() {
  const transcript = [
    { role: 'us', text: 'Welcome — what would you love more of in your week?' },
    { role: 'member', text: 'Making things with my hands. I loved a pottery class once.' },
  ];
  const res = await fetch(`${config.apiUrl}/me/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), transcript }),
  });
  assert.equal(res.status, 201);
}

// Poll the legibility surface itself — the projector is eventually
// consistent by design; on timeout fold in the projector's own state.
async function waitForModel(predicate, label) {
  try {
    return await waitFor(async () => {
      const { status, body } = await getModel();
      assert.equal(status, 200);
      return predicate(body.model) ? body.model : null;
    }, { label });
  } catch (err) {
    throw new Error(`${err.message}\n  ${await projectorDiagnostics(config)}`);
  }
}

test('me-model: legible before onboarding (null), seeded after, corrections take', async () => {
  // A registered-but-not-onboarded member sees an honest null, not an error.
  const empty = await getModel();
  assert.equal(empty.status, 200);
  assert.equal(empty.body.model, null);

  await completeOnboarding();

  // Seeded model appears, member-facing: positions with provenance
  // language, the growth edge, doors/interests/barriers as chips.
  const model = await waitForModel(
    (m) => m?.envelope?.groupSize?.position === 'small',
    'seeded model via GET /me/model',
  );
  assert.equal(model.envelope.structure.position, 'activity-anchored');
  assert.equal(model.envelope.structure.edgeToward, 'open-conversation');
  assert.equal(model.envelope.familiarity.position, 'needs-known-face');
  assert.equal(model.envelope.groupSize.source, "we've noticed");
  assert.ok(model.interests.some((i) => i.tag === 'pottery'));
  assert.ok(model.barriers.some((b) => b.what === 'walking into rooms of strangers'));
  assert.ok(model.doors.some((d) => d.door === 'connect'));

  // Never-shown rules, asserted on the raw response text: no weights,
  // no scores, no Layer 3 vocabulary anywhere.
  const raw = await fetch(`${config.apiUrl}/me/model`, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  });
  const rawText = await raw.text();
  assert.doesNotMatch(rawText, /"weight"|"score"|affinity|crew|stats|rating|tapsGiven/);

  // An envelope correction: the member's word about their own placement.
  const corrected = await correctModel({
    type: 'envelope', dimension: 'groupSize', position: 'large',
  });
  assert.equal(corrected.status, 201);
  assert.equal(corrected.body.status, 'correction-recorded');

  const after = await waitForModel(
    (m) => m?.envelope?.groupSize?.position === 'large',
    'corrected position visible',
  );
  assert.equal(after.envelope.groupSize.source, 'you told us');
  assert.ok(after.envelope.groupSize.correctedAt, 'correction date shown');

  // Interest add + barrier remove (the one-tap dignity path).
  assert.equal((await correctModel({ type: 'interest-add', tag: 'chess' })).status, 201);
  await waitForModel(
    (m) => m?.interests?.some((i) => i.tag === 'chess'),
    'added interest visible',
  );
  assert.equal((await correctModel({
    type: 'barrier-remove', what: 'walking into rooms of strangers',
  })).status, 201);
  await waitForModel(
    (m) => !m?.barriers?.some((b) => b.what === 'walking into rooms of strangers'),
    'removed barrier gone',
  );
});

test('me-model: corrections are vocabulary-validated and auth-gated', async () => {
  assert.equal((await correctModel({ type: 'envelope', dimension: 'shoeSize', position: 'small' })).status, 400);
  assert.equal((await correctModel({ type: 'envelope', dimension: 'groupSize', position: 'enormous' })).status, 400);
  assert.equal((await correctModel({ type: 'nonsense' })).status, 400);

  const unauthed = await fetch(`${config.apiUrl}/me/model`);
  assert.equal(unauthed.status, 401);
});
