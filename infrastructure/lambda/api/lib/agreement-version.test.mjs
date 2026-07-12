// Specifications for the required-agreement-version loader + comparison.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequiredAgreementLoader, meetsRequiredAgreement } from './agreement-version.mjs';

// ─── meetsRequiredAgreement ───

test('no required version configured: everything passes', () => {
  assert.equal(meetsRequiredAgreement('v1', null), true);
  assert.equal(meetsRequiredAgreement(undefined, null), true);
});

test('equal or newer accepted version passes; older fails', () => {
  assert.equal(meetsRequiredAgreement('v2', 'v2'), true);
  assert.equal(meetsRequiredAgreement('v3', 'v2'), true, 'rollback must not re-prompt');
  assert.equal(meetsRequiredAgreement('v1', 'v2'), false);
  assert.equal(meetsRequiredAgreement('v9', 'v10'), false, 'numeric, not lexicographic');
});

test('missing accepted version fails when a version is required', () => {
  assert.equal(meetsRequiredAgreement(undefined, 'v1'), false);
  assert.equal(meetsRequiredAgreement('', 'v1'), false);
});

test('non-v<n> versions pass only on exact match', () => {
  assert.equal(meetsRequiredAgreement('2026-05-14', '2026-05-14'), true);
  assert.equal(meetsRequiredAgreement('2026-05-14', 'v2'), false);
  assert.equal(meetsRequiredAgreement('v2', 'draft'), false);
});

// ─── loader ───

function clientReturning(item) {
  return {
    send: async (cmd) => {
      assert.equal(cmd.input.Key.configKey, 'required_user_agreement_version');
      return item ? { Item: item } : {};
    },
  };
}

test('loader returns the config row fields', async () => {
  const getRequiredAgreement = createRequiredAgreementLoader({
    client: clientReturning({
      configKey: 'required_user_agreement_version',
      version: 'v2',
      updatedAt: '2026-07-01T00:00:00.000Z',
      seq: 3,
    }),
    configTable: 'irl-config-test',
  });
  assert.deepEqual(await getRequiredAgreement(), {
    version: 'v2',
    updatedAt: '2026-07-01T00:00:00.000Z',
    seq: 3,
  });
});

test('loader defaults to no requirement when the row is absent', async () => {
  const getRequiredAgreement = createRequiredAgreementLoader({
    client: clientReturning(null),
    configTable: 'irl-config-test',
  });
  assert.deepEqual(await getRequiredAgreement(), { version: null, updatedAt: null, seq: 0 });
});
