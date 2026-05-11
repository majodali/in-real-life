// Specifications for GET /time.
//
// Returns the current wall and simulated times plus the active offset.
// Available in both modes; in production the offset is always 0 because
// the workshop-time row is never created in irl-config.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGetTimeHandler } from './get-time.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function makeEvent({ claims = { sub: 'abc' } } = {}) {
  return {
    requestContext: claims ? { authorizer: { jwt: { claims } } } : {},
  };
}

let getOffset;
let handler;

beforeEach(() => {
  getOffset = spy(async () => ({ offsetMs: 0, description: 'real time', updatedAt: null }));
  handler = createGetTimeHandler({ getOffset });
});

test('returns 200 with wallTime, simulatedTime, offsetMs, and description', async () => {
  const before = Date.now();
  const response = await handler(makeEvent());
  const after = Date.now();

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);

  const wall = new Date(body.wallTime).getTime();
  const sim = new Date(body.simulatedTime).getTime();
  assert.ok(wall >= before && wall <= after);
  assert.ok(sim >= before && sim <= after);
  assert.equal(body.offsetMs, 0);
  assert.equal(body.description, 'real time');
});

test('with a positive offset, simulatedTime is wallTime + offsetMs', async () => {
  const offsetMs = 7200000; // 2h
  getOffset = spy(async () => ({ offsetMs, description: 'advanced 2h', updatedAt: null }));
  handler = createGetTimeHandler({ getOffset });

  const before = Date.now();
  const response = await handler(makeEvent());
  const after = Date.now();

  const body = JSON.parse(response.body);
  const wall = new Date(body.wallTime).getTime();
  const sim = new Date(body.simulatedTime).getTime();

  assert.ok(wall >= before && wall <= after);
  assert.ok(sim >= before + offsetMs && sim <= after + offsetMs);
  assert.equal(body.offsetMs, offsetMs);
  assert.equal(body.description, 'advanced 2h');
});

test('returns 401 when the request has no JWT claims', async () => {
  const response = await handler({ requestContext: {} });
  assert.equal(response.statusCode, 401);
});

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent());
  assert.equal(response.headers['Content-Type'], 'application/json');
});
