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
  UserProfileCreated: ['name', 'avatar', 'vibeMessage'],
  UserProfileUpdated: ['name', 'avatar', 'vibeMessage'],
  LocalityVerificationRequested: ['city', 'postalCode', 'country'],
  // The interview carrier (D42): transcript is Layer-1 narrative, extraction
  // the Layer-2 seed — the heaviest PII any event carries.
  OnboardingCompleted: ['transcript', 'extraction'],
  // The debrief is preference + relational PII (docs/debrief.md): who you
  // met, see-again marks, free text, extracted deltas. attended and the
  // conductConcern flag stay cleartext (reliability + safety-ops reads);
  // everything with content is shredded. NOTE: these events live on the
  // interaction# aggregate but encrypt under the USER's key — see
  // piiKeyIdFor in index.mjs — so account deletion shreds them.
  DebriefSubmitted: ['again', 'noShowReason', 'outcomeTexture', 'people',
    'surprise', 'reflection', 'followUp', 'conductNote', 'deltas'],
  // Reflection narrative + deltas + routed feedback are PII; the
  // perspectivesOffered cap keys are cleartext (enum keys, projected
  // onto the state row, no content).
  ReflectionRecorded: ['transcript', 'deltas', 'processFeedback', 'organizerFeedback'],
  // UserKeyShredded is intentionally absent: it's the post-shred audit
  // record and must carry no PII (its aggregate's key no longer exists).
};

export function piiFieldsFor(eventType) {
  const fields = PII_FIELDS[eventType];
  return fields ? [...fields] : [];
}
