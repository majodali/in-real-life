// Specifications for User aggregate projections.
//
// Each projection takes a UserRegistered/UserProfileCreated/etc. event and
// returns a DynamoDB write op (or array of ops) for the irl-users state row.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectUserRegistered,
  projectUserProfileCreated,
  projectUserProfileUpdated,
  projectLocalityVerificationRequested,
  projectLocalityVerified,
  projectUserActivated,
  projectUserDeleted,
} from './projections.mjs';

const sampleEvent = {
  eventType: 'UserRegistered',
  version: 1,
  seq: 1,
  aggregateId: 'user#abc',
  wallTime: '2026-05-05T10:00:00.000Z',
  data: {
    userId: 'abc',
    email: 'a@b.c',
    agreementVersion: 'v1',
    path: 'self',
  },
};

test('projectUserRegistered: returns a Put on the users table', () => {
  const write = projectUserRegistered(sampleEvent, { usersTable: 'irl-users-test' });
  assert.ok(write.Put, 'expected a Put op');
  assert.equal(write.Put.TableName, 'irl-users-test');
});

test('projectUserRegistered: Item carries identity, agreement, path, seq, and createdAt', () => {
  const item = projectUserRegistered(sampleEvent, { usersTable: 't' }).Put.Item;
  assert.equal(item.userId, 'abc');
  assert.equal(item.email, 'a@b.c');
  assert.equal(item.agreementVersion, 'v1');
  assert.equal(item.agreementAcceptedAt, '2026-05-05T10:00:00.000Z');
  assert.equal(item.registrationPath, 'self');
  assert.equal(item.seq, 1);
  assert.equal(item.createdAt, '2026-05-05T10:00:00.000Z');
});

test('projectUserRegistered: condition prevents overwriting an existing userId', () => {
  const write = projectUserRegistered(sampleEvent, { usersTable: 't' });
  assert.match(write.Put.ConditionExpression, /attribute_not_exists/);
  assert.match(write.Put.ConditionExpression, /userId/);
});

// ─── UserProfileCreated ───

const profileEvent = {
  eventType: 'UserProfileCreated',
  version: 1,
  seq: 2,
  aggregateId: 'user#abc',
  wallTime: '2026-05-08T10:00:00.000Z',
  data: {
    userId: 'abc',
    name: 'Matthew',
    avatar: '\u{1F33F}',
    vibeMessage: 'Always up for a walk',
    interviewResponses: [
      { questionId: 'name', questionText: 'What should we call you?', response: 'Matthew', timestamp: '2026-05-08T09:55:00.000Z' },
    ],
  },
};

test('projectUserProfileCreated: returns an Update on the users table', () => {
  const write = projectUserProfileCreated(profileEvent, { usersTable: 'irl-users-test' });
  assert.ok(write.Update, 'expected an Update op');
  assert.equal(write.Update.TableName, 'irl-users-test');
});

test('projectUserProfileCreated: keys by userId', () => {
  const write = projectUserProfileCreated(profileEvent, { usersTable: 't' });
  assert.deepEqual(write.Update.Key, { userId: 'abc' });
});

test('projectUserProfileCreated: SET sets name, avatar, vibeMessage, interviewResponses, seq, updatedAt', () => {
  const write = projectUserProfileCreated(profileEvent, { usersTable: 't' });
  const ue = write.Update.UpdateExpression;
  assert.match(ue, /^SET/);
  assert.match(ue, /#name/);   // name is reserved → placeholder
  assert.match(ue, /avatar/);
  assert.match(ue, /vibeMessage/);
  assert.match(ue, /interviewResponses/);
  assert.match(ue, /#seq/);    // seq treated as reserved (placeholder)
  assert.match(ue, /updatedAt/);

  const v = write.Update.ExpressionAttributeValues;
  assert.equal(v[':name'], 'Matthew');
  assert.equal(v[':avatar'], '\u{1F33F}');
  assert.equal(v[':vibeMessage'], 'Always up for a walk');
  assert.deepEqual(v[':interviewResponses'], profileEvent.data.interviewResponses);
  assert.equal(v[':seq'], 2);
  assert.equal(v[':updatedAt'], '2026-05-08T10:00:00.000Z');

  const n = write.Update.ExpressionAttributeNames;
  assert.equal(n['#name'], 'name');
  assert.equal(n['#seq'], 'seq');
});

test('projectUserProfileCreated: condition requires seq=expectedSeq AND no existing name', () => {
  const write = projectUserProfileCreated(profileEvent, { usersTable: 't' });
  const ce = write.Update.ConditionExpression;
  assert.match(ce, /#seq\s*=\s*:expectedSeq/);
  assert.match(ce, /attribute_not_exists\(#name\)/);
  assert.equal(write.Update.ExpressionAttributeValues[':expectedSeq'], 1); // event.seq - 1
});

// ─── UserProfileUpdated ───

const profileUpdatedEvent = {
  eventType: 'UserProfileUpdated',
  version: 1,
  seq: 6,
  aggregateId: 'user#abc',
  wallTime: '2026-05-10T12:00:00.000Z',
  data: {
    userId: 'abc',
    name: 'Matt',
    avatar: '\u{1F340}',
    vibeMessage: 'experimenting with sourdough',
  },
};

test('projectUserProfileUpdated: returns an Update on the users table keyed by userId', () => {
  const write = projectUserProfileUpdated(profileUpdatedEvent, { usersTable: 'irl-users-test' });
  assert.ok(write.Update);
  assert.equal(write.Update.TableName, 'irl-users-test');
  assert.deepEqual(write.Update.Key, { userId: 'abc' });
});

test('projectUserProfileUpdated: sets name, avatar, vibeMessage, seq, updatedAt', () => {
  const write = projectUserProfileUpdated(profileUpdatedEvent, { usersTable: 't' });
  const ue = write.Update.UpdateExpression;
  assert.match(ue, /#name\s*=\s*:name/);
  assert.match(ue, /avatar\s*=\s*:avatar/);
  assert.match(ue, /vibeMessage\s*=\s*:vibeMessage/);
  assert.match(ue, /#seq\s*=\s*:seq/);
  assert.match(ue, /updatedAt\s*=\s*:updatedAt/);

  const v = write.Update.ExpressionAttributeValues;
  assert.equal(v[':name'], 'Matt');
  assert.equal(v[':avatar'], '\u{1F340}');
  assert.equal(v[':vibeMessage'], 'experimenting with sourdough');
  assert.equal(v[':seq'], 6);
  assert.equal(v[':expectedSeq'], 5);
  assert.equal(v[':updatedAt'], '2026-05-10T12:00:00.000Z');

  const n = write.Update.ExpressionAttributeNames;
  assert.equal(n['#name'], 'name');
  assert.equal(n['#seq'], 'seq');
});

test('projectUserProfileUpdated: condition requires seq=expectedSeq AND an existing name', () => {
  const write = projectUserProfileUpdated(profileUpdatedEvent, { usersTable: 't' });
  const ce = write.Update.ConditionExpression;
  assert.match(ce, /#seq\s*=\s*:expectedSeq/);
  assert.match(ce, /attribute_exists\(#name\)/);
});

test('projectUserProfileUpdated: does NOT touch interviewResponses (handled separately)', () => {
  const write = projectUserProfileUpdated(profileUpdatedEvent, { usersTable: 't' });
  const ue = write.Update.UpdateExpression;
  assert.doesNotMatch(ue, /interviewResponses/);
});

// ─── LocalityVerificationRequested ───

const requestedEvent = {
  eventType: 'LocalityVerificationRequested',
  version: 1,
  seq: 3,
  aggregateId: 'user#abc',
  wallTime: '2026-05-08T11:00:00.000Z',
  data: { userId: 'abc', city: 'Bainbridge Island', postalCode: '98110', country: 'US' },
};

test('projectLocalityVerificationRequested: Update sets locality fields, bumps seq, conditions on prior seq', () => {
  const write = projectLocalityVerificationRequested(requestedEvent, { usersTable: 't' });
  assert.ok(write.Update);
  assert.equal(write.Update.TableName, 't');
  assert.deepEqual(write.Update.Key, { userId: 'abc' });

  const ue = write.Update.UpdateExpression;
  assert.match(ue, /city/);
  assert.match(ue, /postalCode/);
  assert.match(ue, /country/);
  assert.match(ue, /localityRequestedAt/);
  assert.match(ue, /#seq/);

  const v = write.Update.ExpressionAttributeValues;
  assert.equal(v[':city'], 'Bainbridge Island');
  assert.equal(v[':postalCode'], '98110');
  assert.equal(v[':country'], 'US');
  assert.equal(v[':localityRequestedAt'], '2026-05-08T11:00:00.000Z');
  assert.equal(v[':seq'], 3);
  assert.equal(v[':expectedSeq'], 2);

  assert.match(write.Update.ConditionExpression, /#seq\s*=\s*:expectedSeq/);
  assert.match(write.Update.ConditionExpression, /attribute_not_exists/);
});

// ─── LocalityVerified ───

const verifiedEvent = {
  eventType: 'LocalityVerified',
  version: 1,
  seq: 4,
  aggregateId: 'user#abc',
  wallTime: '2026-05-08T11:01:00.000Z',
  data: { userId: 'abc', verifiedBy: 'system', method: 'auto' },
};

test('projectLocalityVerified: Update sets verified flag + metadata, bumps seq', () => {
  const write = projectLocalityVerified(verifiedEvent, { usersTable: 't' });
  assert.deepEqual(write.Update.Key, { userId: 'abc' });

  const ue = write.Update.UpdateExpression;
  assert.match(ue, /localityVerified/);
  assert.match(ue, /localityVerifiedAt/);
  assert.match(ue, /localityVerifiedBy/);
  assert.match(ue, /localityVerifiedMethod/);
  assert.match(ue, /#seq/);

  const v = write.Update.ExpressionAttributeValues;
  assert.equal(v[':localityVerified'], true);
  assert.equal(v[':localityVerifiedAt'], '2026-05-08T11:01:00.000Z');
  assert.equal(v[':localityVerifiedBy'], 'system');
  assert.equal(v[':localityVerifiedMethod'], 'auto');
  assert.equal(v[':seq'], 4);
  assert.equal(v[':expectedSeq'], 3);

  assert.match(write.Update.ConditionExpression, /#seq\s*=\s*:expectedSeq/);
  assert.match(write.Update.ConditionExpression, /attribute_not_exists/);
});

// ─── UserActivated ───

const activatedEvent = {
  eventType: 'UserActivated',
  version: 1,
  seq: 5,
  aggregateId: 'user#abc',
  wallTime: '2026-05-08T11:02:00.000Z',
  data: { userId: 'abc' },
};

test('projectUserActivated: Update sets activated flag + activatedAt, bumps seq', () => {
  const write = projectUserActivated(activatedEvent, { usersTable: 't' });
  assert.deepEqual(write.Update.Key, { userId: 'abc' });

  const ue = write.Update.UpdateExpression;
  assert.match(ue, /activated/);
  assert.match(ue, /activatedAt/);
  assert.match(ue, /#seq/);

  const v = write.Update.ExpressionAttributeValues;
  assert.equal(v[':activated'], true);
  assert.equal(v[':activatedAt'], '2026-05-08T11:02:00.000Z');
  assert.equal(v[':seq'], 5);
  assert.equal(v[':expectedSeq'], 4);

  assert.match(write.Update.ConditionExpression, /#seq\s*=\s*:expectedSeq/);
  assert.match(write.Update.ConditionExpression, /attribute_not_exists/);
});

// ─── UserDeleted ───

const deletedEvent = {
  eventType: 'UserDeleted',
  version: 1,
  seq: 6,
  aggregateId: 'user#abc',
  wallTime: '2026-05-19T12:00:00.000Z',
  data: { userId: 'abc' },
};

test('projectUserDeleted: returns an unconditional Delete on the users row', () => {
  const write = projectUserDeleted(deletedEvent, { usersTable: 'irl-users-test' });
  assert.ok(write.Delete, 'expected a Delete op');
  assert.equal(write.Delete.TableName, 'irl-users-test');
  assert.deepEqual(write.Delete.Key, { userId: 'abc' });
  // No ConditionExpression — deletion is idempotent / converging.
  assert.equal(write.Delete.ConditionExpression, undefined);
});
