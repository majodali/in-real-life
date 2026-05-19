// PII field registry.
//
// For each event type, the data.* fields that are personal information and
// must be crypto-shredded in the event log. Everything not listed stays
// cleartext on purpose: structural fields (seq, eventId, timestamps) and
// compliance fields (agreementVersion, registrationPath) need to stay
// queryable and replayable without a per-user key.
//
// LocationNotifyRequested is intentionally absent — the notify-list is a
// pre-signup, non-account-linked aggregate and is out of scope for account
// deletion (tracked separately).

const PII_FIELDS = {
  UserRegistered: ['email'],
  UserProfileCreated: ['name', 'avatar', 'vibeMessage', 'interviewResponses'],
  UserProfileUpdated: ['name', 'avatar', 'vibeMessage'],
  LocalityVerificationRequested: ['city', 'postalCode', 'country'],
};

export function piiFieldsFor(eventType) {
  const fields = PII_FIELDS[eventType];
  return fields ? [...fields] : [];
}
