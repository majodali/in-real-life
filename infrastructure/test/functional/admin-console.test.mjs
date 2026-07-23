// Functional tests for the operator console's backend (D64,
// docs/admin-and-support.md): health probes, member lookup, and the
// admin gate on every route. The verification queue's pending state
// can't be manufactured on a workshop stack (locality auto-verifies),
// so the queue is asserted empty-and-well-formed; the verify action's
// full path is unit-tested.

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../helpers/config.mjs';
import { createTestUser, deleteTestUser } from '../helpers/auth.mjs';
import { purgeUserAggregate } from '../helpers/cleanup.mjs';

let config;
let admin;
let member;

before(async () => {
  config = await loadTestConfig();
  admin = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `console-admin-${randomUUID()}@example.test`,
    admin: true,
  });
});

beforeEach(async () => {
  member = await createTestUser({
    userPoolId: config.userPoolId,
    userPoolClientId: config.userPoolClientId,
    email: `console-member-${randomUUID()}@example.test`,
  });
  const res = await fetch(`${config.apiUrl}/me/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.idToken}` },
    body: JSON.stringify({ commandId: randomUUID(), agreementVersion: 'v1' }),
  });
  assert.equal(res.status, 201);
});

afterEach(async () => {
  if (member) {
    try { await purgeUserAggregate({ userId: member.sub, tables: config.tables }); } catch { /* ignore */ }
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: member.email }); } catch { /* ignore */ }
  }
  member = null;
});

after(async () => {
  if (admin) {
    try { await deleteTestUser({ userPoolId: config.userPoolId, email: admin.email }); } catch { /* ignore */ }
  }
});

async function asAdmin(path) {
  const res = await fetch(`${config.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${admin.idToken}` },
  });
  return { status: res.status, body: await res.json() };
}

test('console: health reports projector, config, and store probes', async () => {
  const { status, body } = await asAdmin('/admin/health');
  assert.equal(status, 200);
  assert.equal(body.mode, 'workshop');
  assert.equal(body.projector.ok, true, JSON.stringify(body.projector));
  assert.equal(typeof body.projector.dlqDepth, 'number');
  assert.equal(body.config.ok, true);
  assert.ok(body.config.simulatedTime);
  assert.equal(body.storePulse.ok, true);
  assert.equal(typeof body.storePulse.approximateItemCounts.users, 'number');
});

test('console: verification queue is well-formed; member lookup returns state basics only', async () => {
  const queue = await asAdmin('/admin/verification-queue');
  assert.equal(queue.status, 200);
  assert.ok(Array.isArray(queue.body.pending));

  const lookup = await asAdmin(`/admin/member?email=${encodeURIComponent(member.email)}`);
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.member.userId, member.sub);
  assert.equal(lookup.body.member.localityVerified, false);
  assert.doesNotMatch(JSON.stringify(lookup.body), /vibeMessage|envelope|interest/);

  assert.equal((await asAdmin('/admin/member?email=ghost@example.test')).status, 404);
});

test('console: every route is admin-gated', async () => {
  for (const path of ['/admin/health', '/admin/verification-queue', '/admin/member?email=x@y.z']) {
    const res = await fetch(`${config.apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${member.idToken}` },
    });
    assert.equal(res.status, 403, path);
  }
});
