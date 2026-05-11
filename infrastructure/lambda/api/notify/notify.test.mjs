// Specifications for POST /notify.
//
// Public (no auth) endpoint capturing interest from people whose postal
// code isn't yet supported. Emits a LocationNotifyRequested event under
// aggregate notify#<email-lowercased>, with seq=1 — each submission is
// its own little aggregate keyed by commandId-derived idempotency.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifyHandler } from './notify.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ body } = {}) {
  return { body: typeof body === 'string' ? body : JSON.stringify(body ?? {}) };
}

const validBody = {
  commandId: 'cmd-1',
  email: 'Curious@Example.test',
  postalCode: '94110',
};

let runner, handler;
let runCommandResult;

beforeEach(() => {
  runCommandResult = { cached: false, events: [], result: { status: 'received' } };
  runner = { runCommand: spy(async () => runCommandResult) };
  handler = createNotifyHandler({ runner });
});

// ─── Happy path ───

test('returns 201 on first submission', async () => {
  const response = await handler(makeEvent({ body: validBody }));
  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.status, 'received');
});

test('passes the right command shape to the runner', async () => {
  await handler(makeEvent({ body: validBody }));
  const [args] = runner.runCommand.calls[0];
  assert.equal(args.commandId, 'cmd-1');
  assert.equal(args.aggregateId, 'notify#curious@example.test'); // lowercased
  assert.equal(args.actorId, args.aggregateId);
  assert.equal(args.events.length, 1);
  const e = args.events[0];
  assert.equal(e.eventType, 'LocationNotifyRequested');
  assert.equal(e.version, 1);
  assert.equal(e.seq, 1);
});

test('event data carries normalised email + postalCode + country default', async () => {
  await handler(makeEvent({ body: validBody }));
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.email, 'curious@example.test');
  assert.equal(data.postalCode, '94110');
  assert.equal(data.country, 'US'); // default
});

test('preserves a custom country if supplied', async () => {
  await handler(makeEvent({ body: { ...validBody, country: 'GB' } }));
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.country, 'GB');
});

test('trims whitespace from email and postalCode', async () => {
  await handler(makeEvent({ body: { ...validBody, email: '  a@b.c ', postalCode: ' 94110 ' } }));
  const data = runner.runCommand.calls[0][0].events[0].data;
  assert.equal(data.email, 'a@b.c');
  assert.equal(data.postalCode, '94110');
});

// ─── Idempotent retry ───

test('returns 200 (not 201) when the runner reports a cached result', async () => {
  runCommandResult = { cached: true, events: [], result: { status: 'received' } };
  const response = await handler(makeEvent({ body: validBody }));
  assert.equal(response.statusCode, 200);
});

// ─── Validation ───

test('returns 400 when commandId is missing', async () => {
  const response = await handler(makeEvent({ body: { email: 'a@b.c', postalCode: '94110' } }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when email is missing', async () => {
  const response = await handler(makeEvent({ body: { commandId: 'cmd-1', postalCode: '94110' } }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when email is malformed', async () => {
  const response = await handler(makeEvent({ body: { commandId: 'cmd-1', email: 'nope', postalCode: '94110' } }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when postalCode is missing', async () => {
  const response = await handler(makeEvent({ body: { commandId: 'cmd-1', email: 'a@b.c' } }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when the body is not valid JSON', async () => {
  const response = await handler(makeEvent({ body: 'not-json' }));
  assert.equal(response.statusCode, 400);
});

// ─── Response shape ───

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent({ body: validBody }));
  assert.equal(response.headers['Content-Type'], 'application/json');
});
