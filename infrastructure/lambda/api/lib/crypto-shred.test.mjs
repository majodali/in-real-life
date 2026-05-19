// Specifications for the crypto-shred primitives.
//
// Per-user AES-256-GCM. PII fields in events are encrypted with the user's
// data key before they hit the immutable log; deleting the key (account
// deletion) makes the ciphertext permanently undecryptable while the
// event's structure survives for replay/audit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDataKey,
  encryptValue,
  decryptValue,
  encryptPii,
  decryptPii,
} from './crypto-shred.mjs';

// ─── generateDataKey ───

test('generateDataKey returns a base64 string decoding to 32 bytes', () => {
  const key = generateDataKey();
  assert.equal(typeof key, 'string');
  assert.equal(Buffer.from(key, 'base64').length, 32);
});

test('generateDataKey is non-deterministic', () => {
  assert.notEqual(generateDataKey(), generateDataKey());
});

// ─── round-trips ───

const key = generateDataKey();

test('encrypt/decrypt round-trips a string', () => {
  const ct = encryptValue('a@b.c', key);
  assert.notEqual(ct, 'a@b.c');
  assert.equal(decryptValue(ct, key), 'a@b.c');
});

test('encrypt/decrypt round-trips an array (interviewResponses)', () => {
  const value = [{ questionId: 'name', response: 'Matthew' }];
  assert.deepEqual(decryptValue(encryptValue(value, key), key), value);
});

test('encrypt/decrypt round-trips an object', () => {
  const value = { a: 1, b: 'two', c: [3] };
  assert.deepEqual(decryptValue(encryptValue(value, key), key), value);
});

test('encryption is non-deterministic (fresh IV per call)', () => {
  assert.notEqual(encryptValue('same', key), encryptValue('same', key));
});

// ─── tamper / wrong-key resistance ───

test('decrypting with the wrong key throws', () => {
  const ct = encryptValue('secret', key);
  assert.throws(() => decryptValue(ct, generateDataKey()));
});

test('decrypting tampered ciphertext throws (GCM auth tag)', () => {
  const ct = encryptValue('secret', key);
  const tampered = ct.slice(0, -2) + (ct.endsWith('AA') ? 'BB' : 'AA');
  assert.throws(() => decryptValue(tampered, key));
});

// ─── encryptPii / decryptPii ───

test('encryptPii encrypts only the listed fields that are present', () => {
  const data = { userId: 'abc', email: 'a@b.c', path: 'self' };
  const out = encryptPii(data, ['email'], key);

  assert.equal(out.userId, 'abc');       // untouched
  assert.equal(out.path, 'self');        // untouched
  assert.notEqual(out.email, 'a@b.c');   // encrypted
  assert.equal(decryptValue(out.email, key), 'a@b.c');
});

test('encryptPii skips fields that are absent', () => {
  const data = { userId: 'abc', city: 'Bainbridge Island' };
  const out = encryptPii(data, ['city', 'postalCode', 'country'], key);
  assert.ok(!('postalCode' in out));
  assert.ok(!('country' in out));
  assert.notEqual(out.city, 'Bainbridge Island');
});

test('encryptPii does not mutate its input', () => {
  const data = { email: 'a@b.c' };
  encryptPii(data, ['email'], key);
  assert.equal(data.email, 'a@b.c');
});

test('decryptPii is the inverse of encryptPii', () => {
  const data = {
    userId: 'abc',
    name: 'Matthew',
    avatar: '\u{1F33F}',
    interviewResponses: [{ q: 1 }],
    seq: 2,
  };
  const fields = ['name', 'avatar', 'interviewResponses'];
  const round = decryptPii(encryptPii(data, fields, key), fields, key);
  assert.deepEqual(round, data);
});

test('decryptPii leaves non-PII fields untouched', () => {
  const data = { email: 'a@b.c', agreementVersion: 'v1' };
  const enc = encryptPii(data, ['email'], key);
  const dec = decryptPii(enc, ['email'], key);
  assert.equal(dec.agreementVersion, 'v1');
});
