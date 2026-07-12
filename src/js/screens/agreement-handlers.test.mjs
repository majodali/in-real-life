// Specifications for the agreement re-acceptance handlers.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleAgreementMount, handleAgreementAccept } from './agreement-handlers.js';

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

let api, commands, navigate, showToast;

beforeEach(() => {
  api = {
    get: spy(async () => ({
      userId: 'u-1',
      requiresAgreementReacceptance: true,
      requiredAgreementVersion: 'v2',
    })),
  };
  commands = { reacceptAgreement: spy(async () => ({ status: 'reaccepted' })) };
  navigate = spy(() => {});
  showToast = spy(() => {});
});

// ─── handleAgreementMount ───

test('returns the required version when re-acceptance is needed', async () => {
  const facts = await handleAgreementMount({ api, navigate, showToast });
  assert.deepEqual(facts, { requiredAgreementVersion: 'v2' });
  assert.equal(navigate.calls.length, 0);
});

test('bounces to welcome when the member is already current', async () => {
  api.get = spy(async () => ({ userId: 'u-1', requiresAgreementReacceptance: false }));
  const facts = await handleAgreementMount({ api, navigate, showToast });
  assert.equal(facts, null);
  assert.deepEqual(navigate.calls, [['welcome']]);
});

test('401 sends to signin; other errors toast and stay', async () => {
  api.get = spy(async () => { throw httpError(401); });
  assert.equal(await handleAgreementMount({ api, navigate, showToast }), null);
  assert.deepEqual(navigate.calls, [['signin']]);

  navigate.calls.length = 0;
  api.get = spy(async () => { throw httpError(500, 'boom'); });
  assert.equal(await handleAgreementMount({ api, navigate, showToast }), null);
  assert.equal(navigate.calls.length, 0);
  assert.equal(showToast.calls[0][0], 'boom');
});

// ─── handleAgreementAccept ───

test('accepts the required version and continues to welcome', async () => {
  const ok = await handleAgreementAccept({
    agreementVersion: 'v2', commands, navigate, showToast,
  });
  assert.equal(ok, true);
  assert.deepEqual(commands.reacceptAgreement.calls[0][0], { agreementVersion: 'v2' });
  assert.deepEqual(navigate.calls, [['welcome']]);
});

test('409 (already accepted elsewhere) converges to welcome', async () => {
  commands.reacceptAgreement = spy(async () => { throw httpError(409); });
  const ok = await handleAgreementAccept({
    agreementVersion: 'v2', commands, navigate, showToast,
  });
  assert.equal(ok, true);
  assert.deepEqual(navigate.calls, [['welcome']]);
  assert.equal(showToast.calls.length, 0);
});

test('other errors toast and stay for a retry', async () => {
  commands.reacceptAgreement = spy(async () => { throw httpError(500, 'nope'); });
  const ok = await handleAgreementAccept({
    agreementVersion: 'v2', commands, navigate, showToast,
  });
  assert.equal(ok, false);
  assert.equal(navigate.calls.length, 0);
  assert.equal(showToast.calls[0][0], 'nope');
});
