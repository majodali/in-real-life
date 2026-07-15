// Functional tests for agreement versioning (docs/event-sourcing.md →
// Agreement versioning): POST /admin/agreement-version (the required-version
// bump), the gate on agreement-gated routes (403 +
// agreement_reacceptance_required), and POST /me/agreement (re-accept).
//
// This suite mutates SHARED stack state (the required version in
// irl-config), so it is written to restore it: the bump target is derived
// from the current version, and the restore runs in afterEach best-effort
// as well as inline. Tests run serially (--test-concurrency=1), so no other
// file observes the bumped window unless this file crashes mid-test — in
// which case the next run's afterEach restore heals it.

import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { ddb, purgeUserAggregate } from '../helpers/cleanup.mjs';

let config;
let admin;
let member;
let baseVersion;   // required version before this test touched anything
let restoreTo;     // what afterEach restores ('v1' when nothing was set)

before(async () => {
  config = await loadTestConfig();
});

async function requiredVersionNow() {
  const out = await ddb.send(new GetCommand({
    TableName: config.tables.config,
    Key: { configKey: 'required_user_agreement_version' },
    ConsistentRead: true,
  }));
  return out.Item?.version ?? null;
}

async function bumpRequired(token, version) {
  return fetch(`${config.apiUrl}/admin/agreement-version`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ commandId: randomUUID(), version }),
  });
}

beforeEach(async () => {
  admin = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `admin-${randomUUID()}@example.test`,
    admin: true,
  });
  member = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `member-${randomUUID()}@example.test`,
  });

  baseVersion = await requiredVersionNow();
  // A member accepted under v1 must fail the bumped gate, so the base has
  // to be v1-compatible; a leftover higher version from a crashed run is
  // healed here rather than failing mysteriously later.
  if (baseVersion !== null && baseVersion !== 'v1') {
    await bumpRequired(admin.idToken, 'v1');
    baseVersion = 'v1';
  }
  restoreTo = baseVersion ?? 'v1';

  // Register while the required version is still satisfied by v1.
  const res = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(res.status, 201);
});

afterEach(async () => {
  // Restore the shared required version whatever happened above.
  try {
    if (await requiredVersionNow() !== restoreTo) {
      await bumpRequired(admin.idToken, restoreTo);
    }
  } catch { /* best effort */ }

  if (member) {
    try { await purgeUserAggregate({ userId: member.sub, tables: config.tables }); } catch { /* ignore */ }
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: member.email }); } catch { /* ignore */ }
  }
  if (admin) {
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: admin.email }); } catch { /* ignore */ }
  }
  admin = null; member = null;
});

test('agreement: bump gates members until they re-accept the shown version', async () => {
  // Non-admins cannot move the required version.
  const forbidden = await bumpRequired(member.idToken, 'v2');
  assert.equal(forbidden.status, 403);

  // Admin bumps to v2.
  const bump = await bumpRequired(admin.idToken, 'v2');
  assert.equal(bump.status, 201);
  assert.equal((await bump.json()).requiredAgreementVersion, 'v2');

  // A v1 member now hits the gate on any agreement-gated route.
  const gated = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.equal(gated.status, 403);
  const gateBody = await gated.json();
  assert.equal(gateBody.code, 'agreement_reacceptance_required');
  assert.equal(gateBody.requiredAgreementVersion, 'v2');

  // Re-accepting must name the version the member was shown.
  const stale = await fetch(`${config.apiUrl}/me/agreement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(stale.status, 400);

  const accept = await fetch(`${config.apiUrl}/me/agreement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v2' }),
  });
  assert.equal(accept.status, 201);

  // Current again: a second re-accept is refused, and the gate opens
  // (the gated route now fails on its own validation, not the gate).
  const again = await fetch(`${config.apiUrl}/me/agreement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v2' }),
  });
  assert.equal(again.status, 409);

  const ungated = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.notEqual(ungated.status, 403);

  // Rollback (restore): accepted v2 still satisfies required v1 — the
  // admin walking the version back re-prompts no one.
  const rollback = await bumpRequired(admin.idToken, restoreTo);
  assert.ok([200, 201].includes(rollback.status), `rollback: ${rollback.status}`);
  const gatedAfterRollback = await fetch(`${config.apiUrl}/me/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID() }),
  });
  assert.notEqual(gatedAfterRollback.status, 403);
});

test('agreement: bump validation — version form and no-op bumps', async () => {
  const badForm = await bumpRequired(admin.idToken, 'version-2');
  assert.equal(badForm.status, 400);

  if (baseVersion !== null) {
    const sameVersion = await bumpRequired(admin.idToken, baseVersion);
    assert.equal(sameVersion.status, 409, 'bumping to the current version is a no-op conflict');
  }
});
