// Specifications for GET /admin/notify-list.
//
// Admin-only browser of the notify-list capture. Scans the event log for
// LocationNotifyRequested entries (cleartext — they aren't in the PII
// registry), normalises to a simple shape, sorts newest first.
//
// Scan is acceptable at workshop scale; populating the events-by-time-
// bucket GSI for real queries is a separate follow-up.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifyListHandler } from './notify-list.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims } = {}) {
  return { requestContext: claims ? { authorizer: { jwt: { claims } } } : {} };
}

const adminClaims = { sub: 'admin-1', 'custom:role': 'admin', email_verified: 'true' };

let client, handler;
let scanPages;

function buildClient() {
  let call = 0;
  return {
    send: spy(async (cmd) => {
      if (cmd.constructor.name !== 'ScanCommand') throw new Error('expected ScanCommand');
      return scanPages[call++];
    }),
  };
}

beforeEach(() => {
  scanPages = [{
    Items: [
      {
        eventId: 'e2', eventType: 'LocationNotifyRequested',
        wallTime: '2026-05-16T09:00:00.000Z',
        data: { email: 'b@example.test', postalCode: '94110', country: 'US' },
      },
      {
        eventId: 'e1', eventType: 'LocationNotifyRequested',
        wallTime: '2026-05-15T08:00:00.000Z',
        data: { email: 'a@example.test', postalCode: '02139', country: 'US' },
      },
    ],
  }];
  client = buildClient();
  handler = createNotifyListHandler({ client, eventsLogTable: 'irl-events-log-test' });
});

// ─── Happy path ───

test('returns 200 with normalised entries', async () => {
  const response = await handler(makeEvent({ claims: adminClaims }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.count, 2);
  assert.equal(body.entries.length, 2);
  // Each entry carries the public-facing shape, not the raw event.
  assert.deepEqual(Object.keys(body.entries[0]).sort(),
    ['country', 'email', 'eventId', 'postalCode', 'requestedAt']);
});

test('sorts entries newest first by wallTime', async () => {
  const response = await handler(makeEvent({ claims: adminClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.entries[0].email, 'b@example.test'); // 2026-05-16
  assert.equal(body.entries[1].email, 'a@example.test'); // 2026-05-15
});

test('scans the events-log table with a filter on eventType', async () => {
  await handler(makeEvent({ claims: adminClaims }));
  const cmd = client.send.calls[0][0];
  assert.equal(cmd.input.TableName, 'irl-events-log-test');
  assert.match(cmd.input.FilterExpression, /eventType/);
  assert.equal(cmd.input.ExpressionAttributeValues[':t'], 'LocationNotifyRequested');
});

test('paginates through every page', async () => {
  scanPages = [
    { Items: [{ eventId: 'e1', eventType: 'LocationNotifyRequested', wallTime: '2026-05-15T08:00:00.000Z', data: { email: 'a@x', postalCode: '1', country: 'US' } }], LastEvaluatedKey: { x: 1 } },
    { Items: [{ eventId: 'e2', eventType: 'LocationNotifyRequested', wallTime: '2026-05-16T08:00:00.000Z', data: { email: 'b@x', postalCode: '2', country: 'US' } }] },
  ];
  client = buildClient();
  handler = createNotifyListHandler({ client, eventsLogTable: 'irl-events-log-test' });

  const response = await handler(makeEvent({ claims: adminClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.count, 2);
  const cmds = client.send.calls.map(([c]) => c);
  assert.equal(cmds.length, 2);
  assert.deepEqual(cmds[1].input.ExclusiveStartKey, { x: 1 });
});

test('returns an empty list (count 0) when no notify events exist', async () => {
  scanPages = [{ Items: [] }];
  client = buildClient();
  handler = createNotifyListHandler({ client, eventsLogTable: 'irl-events-log-test' });

  const response = await handler(makeEvent({ claims: adminClaims }));
  const body = JSON.parse(response.body);
  assert.equal(body.count, 0);
  assert.deepEqual(body.entries, []);
});

// ─── Auth guards ───

test('returns 401 without JWT claims', async () => {
  const response = await handler({});
  assert.equal(response.statusCode, 401);
  assert.equal(client.send.calls.length, 0);
});

test('returns 403 when custom:role is not admin', async () => {
  const response = await handler(makeEvent({
    claims: { sub: 'u-1', 'custom:role': 'user', email_verified: 'true' },
  }));
  assert.equal(response.statusCode, 403);
  assert.equal(client.send.calls.length, 0);
});

test('returns 403 when custom:role is missing entirely', async () => {
  const response = await handler(makeEvent({
    claims: { sub: 'u-1', email_verified: 'true' },
  }));
  assert.equal(response.statusCode, 403);
});

// ─── Response shape ───

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent({ claims: adminClaims }));
  assert.equal(response.headers['Content-Type'], 'application/json');
});
