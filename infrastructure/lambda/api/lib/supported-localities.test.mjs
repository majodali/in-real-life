// Specifications for the supported-localities allowlist.
//
// One source of truth for "do we serve this postal code?" — used by the
// public /locality/check gate AND the authenticated /me/locality handler
// (defence in depth: even if the gate is bypassed, the locality command
// itself rejects unsupported areas).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSupportedArea,
  isSupportedPostalCode,
} from './supported-localities.mjs';

// ─── getSupportedArea ───

test('returns the area label for a supported postal code', () => {
  assert.equal(getSupportedArea('98110'), 'Bainbridge Island');
});

test('returns null for a postal code not in the allowlist', () => {
  assert.equal(getSupportedArea('94110'), null);
});

test('trims whitespace before matching', () => {
  assert.equal(getSupportedArea('  98110  '), 'Bainbridge Island');
});

test('returns null for undefined / null / empty input', () => {
  assert.equal(getSupportedArea(undefined), null);
  assert.equal(getSupportedArea(null), null);
  assert.equal(getSupportedArea(''), null);
  assert.equal(getSupportedArea('   '), null);
});

test('coerces non-string input safely', () => {
  assert.equal(getSupportedArea(98110), 'Bainbridge Island');
});

// ─── isSupportedPostalCode ───

test('isSupportedPostalCode: true for supported, false for unsupported', () => {
  assert.equal(isSupportedPostalCode('98110'), true);
  assert.equal(isSupportedPostalCode('94110'), false);
});
