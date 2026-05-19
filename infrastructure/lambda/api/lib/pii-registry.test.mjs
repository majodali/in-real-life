// Specifications for the PII field registry.
//
// Maps each event type to the data.* fields that are personal information
// and must be crypto-shredded in the event log. Structural and compliance
// fields (agreementVersion, registrationPath, booleans, timestamps) stay
// cleartext so non-PII state stays replayable/queryable without keys.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piiFieldsFor } from './pii-registry.mjs';

test('UserRegistered shreds email only', () => {
  assert.deepEqual(piiFieldsFor('UserRegistered'), ['email']);
});

test('UserProfileCreated shreds name, avatar, vibeMessage, interviewResponses', () => {
  assert.deepEqual(
    piiFieldsFor('UserProfileCreated').sort(),
    ['avatar', 'interviewResponses', 'name', 'vibeMessage'],
  );
});

test('UserProfileUpdated shreds name, avatar, vibeMessage', () => {
  assert.deepEqual(
    piiFieldsFor('UserProfileUpdated').sort(),
    ['avatar', 'name', 'vibeMessage'],
  );
});

test('LocalityVerificationRequested shreds city, postalCode, country', () => {
  assert.deepEqual(
    piiFieldsFor('LocalityVerificationRequested').sort(),
    ['city', 'country', 'postalCode'],
  );
});

test('non-PII event types return an empty list', () => {
  assert.deepEqual(piiFieldsFor('LocalityVerified'), []);
  assert.deepEqual(piiFieldsFor('UserActivated'), []);
  assert.deepEqual(piiFieldsFor('WorkshopTimeAdvanced'), []);
});

test('unknown event types return an empty list (cleartext, fail-safe-readable)', () => {
  assert.deepEqual(piiFieldsFor('SomethingNew'), []);
});

test('returns a fresh array each call (callers can sort/mutate safely)', () => {
  const a = piiFieldsFor('UserRegistered');
  a.push('mutated');
  assert.deepEqual(piiFieldsFor('UserRegistered'), ['email']);
});
