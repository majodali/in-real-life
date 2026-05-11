// Functional tests for GET /locality/check (public, no auth) against the
// real test stack.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadTestConfig } from '../helpers/config.mjs';

let config;

before(async () => {
  config = await loadTestConfig();
});

test('GET /locality/check?postalCode=98110 returns supported with the area label', async () => {
  const response = await fetch(`${config.apiUrl}/locality/check?postalCode=98110`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.supported, true);
  assert.equal(body.area, 'Bainbridge Island');
});

test('GET /locality/check?postalCode=94110 returns supported: false', async () => {
  const response = await fetch(`${config.apiUrl}/locality/check?postalCode=94110`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.supported, false);
});

test('GET /locality/check without a postalCode returns 400', async () => {
  const response = await fetch(`${config.apiUrl}/locality/check`);
  assert.equal(response.status, 400);
});

test('GET /locality/check works without an Authorization header (public endpoint)', async () => {
  const response = await fetch(`${config.apiUrl}/locality/check?postalCode=98110`, {
    headers: { 'X-No-Auth': 'true' },
  });
  assert.equal(response.status, 200);
});
