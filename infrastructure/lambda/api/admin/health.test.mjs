// Specifications for GET /admin/health (docs/admin-and-support.md):
// admin-gated, probe-per-section, every probe independently
// failure-tolerant.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminHealthHandler } from './health.mjs';

function makeEvent(claims) {
  return { requestContext: claims ? { authorizer: { jwt: { claims } } } : {} };
}

const admin = { sub: 'adm', 'custom:role': 'admin' };

class FakeGetQueueAttributes { constructor(input) { this.input = input; } }
class FakeDescribeTable { constructor(input) { this.input = input; } }

let handler, sqsCalls, ddbCalls, sqsFail;

beforeEach(() => {
  sqsCalls = [];
  ddbCalls = [];
  sqsFail = false;
  handler = createAdminHealthHandler({
    client: {
      send: async () => ({ Item: { configKey: 'required_user_agreement_version', value: 'v3' } }),
    },
    tables: {
      usersTable: 'users-t', eventsTable: 'events-t', interactionsTable: 'ix-t',
      eventsLogTable: 'log-t', userModelTable: 'model-t', commandsTable: 'cmd-t',
      configTable: 'config-t',
    },
    stage: 'workshop',
    mode: 'workshop',
    sqs: {
      send: async (cmd) => {
        if (sqsFail) throw new Error('sqs unreachable');
        sqsCalls.push(cmd.input);
        return { Attributes: { ApproximateNumberOfMessages: '7', ApproximateNumberOfMessagesNotVisible: '1' } };
      },
    },
    getQueueAttributesCommand: FakeGetQueueAttributes,
    dlqUrl: 'https://sqs/dlq',
    ddbControl: {
      send: async (cmd) => {
        ddbCalls.push(cmd.input.TableName);
        return { Table: { ItemCount: 42 } };
      },
    },
    describeTableCommand: FakeDescribeTable,
    getOffset: async () => ({ offsetMs: 3_600_000 }),
  });
});

test('admin-gated: 401 without auth, 403 without the role', async () => {
  assert.equal((await handler(makeEvent())).statusCode, 401);
  assert.equal((await handler(makeEvent({ sub: 'u1', 'custom:role': 'member' }))).statusCode, 403);
});

test('reports DLQ depth, config sanity, and the table pulse', async () => {
  const res = await handler(makeEvent(admin));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);

  assert.equal(body.mode, 'workshop');
  assert.equal(body.projector.ok, true);
  assert.equal(body.projector.dlqDepth, 7);
  assert.equal(body.projector.dlqInFlight, 1);
  assert.equal(sqsCalls[0].QueueUrl, 'https://sqs/dlq');

  assert.equal(body.config.ok, true);
  assert.equal(body.config.requiredAgreementVersion, 'v3');
  assert.equal(body.config.workshopOffsetMs, 3_600_000);

  assert.equal(body.storePulse.ok, true);
  assert.equal(body.storePulse.approximateItemCounts.users, 42);
  assert.equal(ddbCalls.length, 6, 'all six watched tables described');
});

test('a broken probe reports itself broken and never takes the panel down', async () => {
  sqsFail = true;
  const res = await handler(makeEvent(admin));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.projector.ok, false);
  assert.match(body.projector.error, /sqs unreachable/);
  assert.equal(body.config.ok, true, 'other probes unaffected');
  assert.equal(body.storePulse.ok, true);
});
