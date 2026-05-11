// Specifications for the locality-screen submit handler.
//
// Pure logic extracted from locality.js so the validation + routing tree
// is unit-testable. Validates the city input, calls verifyLocality, and
// routes via the injected navigate / showToast callbacks.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleLocalitySubmit } from './locality-handlers.js';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function httpError(status, message) {
  const err = new Error(message || `HTTP ${status}`);
  err.status = status;
  return err;
}

let commands;
let navigate;
let showToast;

beforeEach(() => {
  commands = { verifyLocality: spy(async () => ({ userId: 'u-1', status: 'activated' })) };
  navigate = spy(() => {});
  showToast = spy(() => {});
});

// ─── Validation ───

test('rejects an empty city with a toast and no API call', async () => {
  await handleLocalitySubmit({ city: '', postalCode: '98110', country: '', commands, navigate, showToast });
  assert.equal(commands.verifyLocality.calls.length, 0);
  assert.equal(navigate.calls.length, 0);
  assert.match(showToast.calls[0][0], /city|town/i);
});

test('rejects a whitespace-only city', async () => {
  await handleLocalitySubmit({ city: '   ', postalCode: '98110', commands, navigate, showToast });
  assert.equal(commands.verifyLocality.calls.length, 0);
  assert.match(showToast.calls[0][0], /city|town/i);
});

test('rejects an empty postalCode with a toast and no API call', async () => {
  await handleLocalitySubmit({
    city: 'Bainbridge Island', postalCode: '', commands, navigate, showToast,
  });
  assert.equal(commands.verifyLocality.calls.length, 0);
  assert.equal(navigate.calls.length, 0);
  assert.match(showToast.calls[0][0], /postal code/i);
});

test('rejects a whitespace-only postalCode', async () => {
  await handleLocalitySubmit({
    city: 'Bainbridge Island', postalCode: '   ', commands, navigate, showToast,
  });
  assert.equal(commands.verifyLocality.calls.length, 0);
  assert.match(showToast.calls[0][0], /postal code/i);
});

// ─── Happy path ───

test('on success: calls verifyLocality with trimmed values and navigates to welcome', async () => {
  // Going via 'welcome' lets the post-sign-in router refresh GET /me, save
  // the user locally with the freshly-activated state, and then forward to
  // the feed — keeping the routing logic in one place.
  await handleLocalitySubmit({
    city: '  Bainbridge Island  ',
    postalCode: '  98110  ',
    country: 'US',
    commands, navigate, showToast,
  });

  assert.equal(commands.verifyLocality.calls.length, 1);
  assert.deepEqual(commands.verifyLocality.calls[0][0], {
    city: 'Bainbridge Island',
    postalCode: '98110',
    country: 'US',
  });
  assert.equal(navigate.calls[0][0], 'welcome');
});

test('omits empty country from the request', async () => {
  await handleLocalitySubmit({
    city: 'Bainbridge Island',
    postalCode: '98110',
    country: '',
    commands, navigate, showToast,
  });

  const args = commands.verifyLocality.calls[0][0];
  assert.equal(args.city, 'Bainbridge Island');
  assert.equal(args.postalCode, '98110');
  assert.equal(args.country, undefined);
});

// ─── Error handling ───

test('on 404: prompts re-sign-in and navigates to signin', async () => {
  commands.verifyLocality = spy(async () => { throw httpError(404, 'user not registered'); });

  await handleLocalitySubmit({
    city: 'Bainbridge Island', postalCode: '98110', commands, navigate, showToast,
  });

  assert.equal(navigate.calls[0][0], 'signin');
  assert.equal(showToast.calls.length, 1);
});

test('on 409 (already verified): navigates to welcome anyway', async () => {
  commands.verifyLocality = spy(async () => { throw httpError(409, 'already activated'); });

  await handleLocalitySubmit({
    city: 'Bainbridge Island', postalCode: '98110', commands, navigate, showToast,
  });

  assert.equal(navigate.calls[0][0], 'welcome');
});

test('on 422 (postal code not supported): shows toast and does not navigate', async () => {
  commands.verifyLocality = spy(async () => { throw httpError(422, 'postal code not supported'); });

  await handleLocalitySubmit({
    city: 'San Francisco', postalCode: '94110', commands, navigate, showToast,
  });

  assert.equal(navigate.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
  assert.match(showToast.calls[0][0], /support|area|reach/i);
});

test('on other error: shows toast and does not navigate', async () => {
  commands.verifyLocality = spy(async () => { throw httpError(500, 'boom'); });

  await handleLocalitySubmit({
    city: 'Bainbridge Island', postalCode: '98110', commands, navigate, showToast,
  });

  assert.equal(navigate.calls.length, 0);
  assert.equal(showToast.calls.length, 1);
});
