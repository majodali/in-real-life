// Projections for the User aggregate.
//
// Each function takes an event + tables config and returns a DynamoDB write
// op suitable for inclusion in a TransactWriteItems request. See
// projections.test.mjs for specs.

export function projectUserRegistered(event, tables) {
  return {
    Put: {
      TableName: tables.usersTable,
      Item: {
        userId: event.data.userId,
        email: event.data.email,
        agreementVersion: event.data.agreementVersion,
        agreementAcceptedAt: event.wallTime,
        registrationPath: event.data.path,
        seq: event.seq,
        createdAt: event.wallTime,
      },
      ConditionExpression: 'attribute_not_exists(userId)',
    },
  };
}

// UserProfileCreated updates the existing user state row with profile data.
// Condition: row's seq matches the previous event's seq, AND no name is
// already set (rejects duplicate profile creation).
export function projectUserProfileCreated(event, tables) {
  return {
    Update: {
      TableName: tables.usersTable,
      Key: { userId: event.data.userId },
      UpdateExpression:
        'SET #name = :name, avatar = :avatar, vibeMessage = :vibeMessage, '
        + 'interviewResponses = :interviewResponses, #seq = :seq, updatedAt = :updatedAt',
      ConditionExpression: '#seq = :expectedSeq AND attribute_not_exists(#name)',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#seq': 'seq',
      },
      ExpressionAttributeValues: {
        ':name': event.data.name,
        ':avatar': event.data.avatar,
        ':vibeMessage': event.data.vibeMessage,
        ':interviewResponses': event.data.interviewResponses,
        ':seq': event.seq,
        ':expectedSeq': event.seq - 1,
        ':updatedAt': event.wallTime,
      },
    },
  };
}

// UserProfileUpdated overwrites the profile fields (name, avatar, vibeMessage)
// after initial creation. Condition: existing seq matches the previous event's
// seq AND a name is already present (rejects an update before profile creation).
// interviewResponses is intentionally untouched here — those evolve via a
// separate event type.
export function projectUserProfileUpdated(event, tables) {
  return {
    Update: {
      TableName: tables.usersTable,
      Key: { userId: event.data.userId },
      UpdateExpression:
        'SET #name = :name, avatar = :avatar, vibeMessage = :vibeMessage, '
        + '#seq = :seq, updatedAt = :updatedAt',
      ConditionExpression: '#seq = :expectedSeq AND attribute_exists(#name)',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#seq': 'seq',
      },
      ExpressionAttributeValues: {
        ':name': event.data.name,
        ':avatar': event.data.avatar,
        ':vibeMessage': event.data.vibeMessage,
        ':seq': event.seq,
        ':expectedSeq': event.seq - 1,
        ':updatedAt': event.wallTime,
      },
    },
  };
}

// LocalityVerificationRequested records the user's locality submission.
// Condition rejects re-submission via attribute_not_exists(city).
export function projectLocalityVerificationRequested(event, tables) {
  return {
    Update: {
      TableName: tables.usersTable,
      Key: { userId: event.data.userId },
      UpdateExpression:
        'SET city = :city, postalCode = :postalCode, country = :country, '
        + 'localityRequestedAt = :localityRequestedAt, #seq = :seq',
      ConditionExpression: '#seq = :expectedSeq AND attribute_not_exists(city)',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':city': event.data.city,
        ':postalCode': event.data.postalCode,
        ':country': event.data.country,
        ':localityRequestedAt': event.wallTime,
        ':seq': event.seq,
        ':expectedSeq': event.seq - 1,
      },
    },
  };
}

// LocalityVerified flags the user as locality-verified.
// Condition rejects re-verification via attribute_not_exists(localityVerified).
export function projectLocalityVerified(event, tables) {
  return {
    Update: {
      TableName: tables.usersTable,
      Key: { userId: event.data.userId },
      UpdateExpression:
        'SET localityVerified = :localityVerified, localityVerifiedAt = :localityVerifiedAt, '
        + 'localityVerifiedBy = :localityVerifiedBy, localityVerifiedMethod = :localityVerifiedMethod, '
        + '#seq = :seq',
      ConditionExpression: '#seq = :expectedSeq AND attribute_not_exists(localityVerified)',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':localityVerified': true,
        ':localityVerifiedAt': event.wallTime,
        ':localityVerifiedBy': event.data.verifiedBy,
        ':localityVerifiedMethod': event.data.method,
        ':seq': event.seq,
        ':expectedSeq': event.seq - 1,
      },
    },
  };
}

// UserActivated marks the user as fully activated. Emitted only after the
// prerequisites (registration, profile, locality verification) have been met.
// Condition rejects re-activation via attribute_not_exists(activated).
export function projectUserActivated(event, tables) {
  return {
    Update: {
      TableName: tables.usersTable,
      Key: { userId: event.data.userId },
      UpdateExpression: 'SET activated = :activated, activatedAt = :activatedAt, #seq = :seq',
      ConditionExpression: '#seq = :expectedSeq AND attribute_not_exists(activated)',
      ExpressionAttributeNames: { '#seq': 'seq' },
      ExpressionAttributeValues: {
        ':activated': true,
        ':activatedAt': event.wallTime,
        ':seq': event.seq,
        ':expectedSeq': event.seq - 1,
      },
    },
  };
}

// UserDeleted tears down the read model: the state row is hard-deleted
// (it's PII at rest and not needed for replay). The event itself stays in
// the log for the deletion audit trail; the user's crypto-shred key is
// deleted separately by the handler, rendering all their prior events'
// PII permanently unreadable.
export function projectUserDeleted(event, tables) {
  return {
    Delete: {
      TableName: tables.usersTable,
      Key: { userId: event.data.userId },
    },
  };
}
