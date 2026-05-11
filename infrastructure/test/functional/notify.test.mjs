// Functional tests for POST /notify (public, no auth) against the real
// test stack.

import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { loadTestConfig } from '../helpers/config.mjs';
import { ddb } from '../helpers/cleanup.mjs';

let config;
let lastEmail;

before(async () => {
  config = await loadTestConfig();
});

afterEach(async () => {
  if (!lastEmail) return;
  const aggregateId = `notify#${lastEmail}`;
  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': aggregateId },
  }));
  for (const item of events.Items ?? []) {
    await ddb.send(new DeleteCommand({
      TableName: config.tables.eventsLog,
      Key: { aggregateId: item.aggregateId, seq: item.seq },
    }));
  }
  lastEmail = null;
});

test('POST /notify: captures interest and writes a LocationNotifyRequested event', async () => {
  lastEmail = `notify-${randomUUID()}@example.test`.toLowerCase();

  const response = await fetch(`${config.apiUrl}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commandId: randomUUID(),
      email: lastEmail,
      postalCode: '94110',
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, 'received');

  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `notify#${lastEmail}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 1);
  const evt = events.Items[0];
  assert.equal(evt.eventType, 'LocationNotifyRequested');
  assert.equal(evt.seq, 1);
  assert.equal(evt.data.email, lastEmail);
  assert.equal(evt.data.postalCode, '94110');
  assert.equal(evt.data.country, 'US');
});

test('POST /notify: idempotent retry with same commandId returns 200 without a second event', async () => {
  lastEmail = `notify-${randomUUID()}@example.test`.toLowerCase();
  const cmd = randomUUID();
  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({ commandId: cmd, email: lastEmail, postalCode: '94110' });

  const r1 = await fetch(`${config.apiUrl}/notify`, { method: 'POST', headers, body });
  assert.equal(r1.status, 201);

  const r2 = await fetch(`${config.apiUrl}/notify`, { method: 'POST', headers, body });
  assert.equal(r2.status, 200);

  const events = await ddb.send(new QueryCommand({
    TableName: config.tables.eventsLog,
    KeyConditionExpression: 'aggregateId = :a',
    ExpressionAttributeValues: { ':a': `notify#${lastEmail}` },
    ConsistentRead: true,
  }));
  assert.equal(events.Items.length, 1);
});

test('POST /notify: returns 400 on malformed email', async () => {
  const response = await fetch(`${config.apiUrl}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID(), email: 'not-an-email', postalCode: '94110' }),
  });
  assert.equal(response.status, 400);
});

test('POST /notify: works without an Authorization header (public endpoint)', async () => {
  lastEmail = `notify-${randomUUID()}@example.test`.toLowerCase();
  const response = await fetch(`${config.apiUrl}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commandId: randomUUID(),
      email: lastEmail,
      postalCode: '94110',
    }),
  });
  assert.equal(response.status, 201);
});
