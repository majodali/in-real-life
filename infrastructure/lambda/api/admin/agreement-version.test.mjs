// Specifications for POST /admin/agreement-version
// (UpdateRequiredAgreementVersion on system#config) and its projection.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateAgreementVersionHandler } from './agreement-version.mjs';
import { projectRequiredAgreementVersionUpdated } from './agreement-projections.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims, body } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
    body: JSON.stringify(body ?? {}),
  };
}

const adminClaims = { sub: 'admin-1', 'custom:role': 'admin' };

let runner, current, handler;

beforeEach(() => {
  runner = { runCommand: spy(async (input) => ({ cached: false, events: [], result: input.result })) };
  current = { version: 'v1', seq: 2, updatedAt: null };
  handler = createUpdateAgreementVersionHandler({
    runner,
    getRequiredAgreement: async () => current,
  });
});

test('emits RequiredAgreementVersionUpdated on system#config with the next seq', async () => {
  const response = await handler(makeEvent({
    claims: adminClaims,
    body: { commandId: 'cmd-1', version: 'v2' },
  }));

  assert.equal(response.statusCode, 201);
  assert.deepEqual(JSON.parse(response.body), { requiredAgreementVersion: 'v2' });

  const [input] = runner.runCommand.calls[0];
  assert.equal(input.aggregateId, 'system#config');
  assert.equal(input.actorId, 'user#admin-1');
  const [event] = input.events;
  assert.equal(event.eventType, 'RequiredAgreementVersionUpdated');
  assert.equal(event.seq, 3);
  assert.deepEqual(event.data, { version: 'v2', previousVersion: 'v1' });
});

test('first ever bump starts from seq 1 with null previousVersion', async () => {
  current = { version: null, seq: 0, updatedAt: null };
  await handler(makeEvent({ claims: adminClaims, body: { commandId: 'c', version: 'v1' } }));
  const [event] = runner.runCommand.calls[0][0].events;
  assert.equal(event.seq, 1);
  assert.deepEqual(event.data, { version: 'v1', previousVersion: null });
});

test('rejects non-admins and missing auth', async () => {
  const member = await handler(makeEvent({ claims: { sub: 'u1' }, body: { commandId: 'c', version: 'v2' } }));
  assert.equal(member.statusCode, 403);
  const anon = await handler(makeEvent({ body: { commandId: 'c', version: 'v2' } }));
  assert.equal(anon.statusCode, 401);
});

test('rejects malformed versions and missing commandId', async () => {
  for (const version of ['2', 'v', 'v1.2', '', undefined]) {
    const response = await handler(makeEvent({ claims: adminClaims, body: { commandId: 'c', version } }));
    assert.equal(response.statusCode, 400, `version ${version}`);
  }
  const noCmd = await handler(makeEvent({ claims: adminClaims, body: { version: 'v2' } }));
  assert.equal(noCmd.statusCode, 400);
});

test('409 when the version is already required', async () => {
  const response = await handler(makeEvent({ claims: adminClaims, body: { commandId: 'c', version: 'v1' } }));
  assert.equal(response.statusCode, 409);
  assert.equal(runner.runCommand.calls.length, 0);
});

test('projection writes the required_user_agreement_version config row', () => {
  const write = projectRequiredAgreementVersionUpdated({
    eventId: '01E',
    seq: 3,
    wallTime: '2026-07-12T00:00:00.000Z',
    data: { version: 'v2', previousVersion: 'v1' },
  }, { configTable: 'irl-config-test' });

  assert.deepEqual(write, {
    Put: {
      TableName: 'irl-config-test',
      Item: {
        configKey: 'required_user_agreement_version',
        version: 'v2',
        previousVersion: 'v1',
        updatedAt: '2026-07-12T00:00:00.000Z',
        seq: 3,
        eventId: '01E',
      },
    },
  });
});
