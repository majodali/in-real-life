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
//
// EventProposed (and the rest of the Event aggregate, when it grows) is also
// absent. Events organized by a user contain that user's snapshot name and
// authored content, but anonymizing those needs a cascading delete-or-rewrite
// across the state rows that other users still see. Tracked as a follow-up
// once interest/confirm/cancel are in place. Pre-launch this is fine; before
// real users sign up the cascade slice must land.

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
