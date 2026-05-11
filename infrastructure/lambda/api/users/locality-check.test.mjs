// Specifications for GET /locality/check.
//
// Public endpoint (no auth) the sign-up gate calls before creating a
// Cognito user. Given a postal code, returns whether we serve that area
// and (if so) the human-readable area label. Postal code allowlist lives
// inside the handler module — initially just 98110 (Bainbridge Island).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalityCheckHandler } from './locality-check.mjs';

function makeEvent({ postalCode } = {}) {
  return {
    queryStringParameters: postalCode === undefined ? null : { postalCode },
  };
}

const handler = createLocalityCheckHandler();

// ─── Supported ───

test('returns supported: true with area label for 98110', async () => {
  const response = await handler(makeEvent({ postalCode: '98110' }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.supported, true);
  assert.equal(body.area, 'Bainbridge Island');
});

test('trims and normalises the postal code before checking', async () => {
  const response = await handler(makeEvent({ postalCode: '  98110  ' }));
  const body = JSON.parse(response.body);
  assert.equal(body.supported, true);
});

// ─── Not supported ───

test('returns supported: false for a postal code outside the allowlist', async () => {
  const response = await handler(makeEvent({ postalCode: '94110' }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.supported, false);
  assert.equal(body.area, undefined);
});

test('returns supported: false for a nearby-but-not-supported code', async () => {
  // Poulsbo (98370) is in Kitsap County but not Bainbridge Island.
  const response = await handler(makeEvent({ postalCode: '98370' }));
  const body = JSON.parse(response.body);
  assert.equal(body.supported, false);
});

// ─── Validation ───

test('returns 400 when postalCode is missing', async () => {
  const response = await handler(makeEvent({}));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when postalCode is empty', async () => {
  const response = await handler(makeEvent({ postalCode: '' }));
  assert.equal(response.statusCode, 400);
});

test('returns 400 when queryStringParameters is null', async () => {
  const response = await handler({});
  assert.equal(response.statusCode, 400);
});

// ─── Response shape ───

test('responses set Content-Type: application/json', async () => {
  const response = await handler(makeEvent({ postalCode: '98110' }));
  assert.equal(response.headers['Content-Type'], 'application/json');
});
