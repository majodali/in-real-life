// Specifications for the ULID generator.
//
// ULIDs are 26-char Crockford base32 strings: 10-char timestamp + 16-char random.
// They sort lexicographically by generation time and are strictly monotonic
// within a millisecond.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ulid, decodeTime } from './ulid.mjs';

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TIME_MAX = Math.pow(2, 48) - 1;

test('ulid produces a 26-character string', () => {
  assert.equal(ulid().length, 26);
});

test('ulid uses only Crockford base32 alphabet (no I, L, O, U)', () => {
  for (let i = 0; i < 100; i++) {
    assert.match(ulid(), CROCKFORD);
  }
});

test('ulid encodes the current timestamp when called without args', () => {
  const before = Date.now();
  const id = ulid();
  const after = Date.now();
  const decoded = decodeTime(id);
  assert.ok(decoded >= before, `decoded ${decoded} should be >= ${before}`);
  assert.ok(decoded <= after, `decoded ${decoded} should be <= ${after}`);
});

test('ulid encodes an explicit timestamp when provided', () => {
  const ts = 1717200000000;
  assert.equal(decodeTime(ulid(ts)), ts);
});

test('ulid: two consecutive calls produce different values', () => {
  assert.notEqual(ulid(), ulid());
});

test('ulid: a later timestamp sorts after an earlier timestamp', () => {
  const earlier = ulid(1000);
  const later = ulid(2000);
  assert.ok(earlier < later, `expected ${earlier} < ${later}`);
});

test('ulid: strictly monotonic when generated multiple times within the same millisecond', () => {
  const ts = 1717200000000;
  const ids = Array.from({ length: 100 }, () => ulid(ts));
  assert.equal(new Set(ids).size, 100, 'all ULIDs should be distinct');
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted, 'ULIDs should be in monotonically increasing order');
});

test('ulid rejects timestamps outside the valid range', () => {
  assert.throws(() => ulid(-1), /timestamp out of range/);
  assert.throws(() => ulid(TIME_MAX + 1), /timestamp out of range/);
});

test('decodeTime round-trips arbitrary valid timestamps', () => {
  for (const ts of [0, 1, 1000, 1717200000000, TIME_MAX]) {
    assert.equal(decodeTime(ulid(ts)), ts);
  }
});

test('decodeTime rejects strings of the wrong length', () => {
  assert.throws(() => decodeTime('TOOSHORT'), /invalid ULID/);
  assert.throws(() => decodeTime('A'.repeat(27)), /invalid ULID/);
});

test('decodeTime rejects strings containing invalid characters', () => {
  // 'I' is not in Crockford base32
  const invalid = 'I' + 'A'.repeat(25);
  assert.throws(() => decodeTime(invalid), /invalid ULID/);
});
