// What a member reads when something fails (docs/page-copy.md §4).
//
// Server text is not page copy: the API answers in English written for
// developers ("internal server error", "event is over; can no longer
// change interest") and Cognito answers in its own English. Neither can
// be translated or reviewed, so neither is shown as-is. Instead:
//
//   1. no response at all (offline, blocked)  → errors.network
//   2. a Cognito error with a known __type     → that code's key
//   3. an API error a member can actually meet → its key, matched on the
//      status and the server's message (errors.test.mjs checks every
//      pattern still matches a message the backend sends)
//   4. anything else                           → the caller's own key,
//      which says what failed in the screen's words
//
// `overrides` maps a Cognito code or an HTTP status to a key for one call
// site, where the same code means something different there.

import { text } from './copy.js';

const COGNITO = {
  UsernameExistsException: 'errors.auth.emailTaken',
  NotAuthorizedException: 'errors.auth.wrongPassword',
  UserNotFoundException: 'errors.auth.wrongPassword',
  UserNotConfirmedException: 'errors.auth.notConfirmed',
  CodeMismatchException: 'errors.auth.codeMismatch',
  ExpiredCodeException: 'errors.auth.codeExpired',
  InvalidPasswordException: 'errors.auth.weakPassword',
  LimitExceededException: 'errors.auth.tooMany',
  TooManyRequestsException: 'errors.auth.tooMany',
  TooManyFailedAttemptsException: 'errors.auth.tooMany',
};

// [status, pattern on the server's message, key]. First match wins.
export const API_ERRORS = [
  [401, /^unauthorized$/, 'errors.sessionExpired'],
  [403, /^email not verified$/, 'errors.auth.notConfirmed'],
  [403, /^agreement re-acceptance required$/, 'errors.agreementRequired'],
  [403, /^only the (organizer|author) can /, 'errors.notYours'],
  [404, /^event not found$/, 'errors.eventGone'],
  [409, /^(concurrent update, retry|profile update conflict)$/, 'errors.retry'],
  [409, /^event is full/, 'errors.eventFull'],
  [409, /^still an idea — set a time and place/, 'errors.ideaConfirm'],
  [409, /^still an idea — register interest/, 'errors.ideaInterest'],
  [409, /^(event is |event was cancelled|suggestions are closed|polls only apply)/, 'errors.eventMovedOn'],
  [409, /^suggestion is /, 'errors.suggestionSettled'],
  [409, /^poll is /, 'errors.pollClosed'],
  [409, /^reflection opens from a debrief/, 'errors.debriefFirst'],
  [409, /^only confirmed attendees can debrief$/, 'errors.debriefConfirmedOnly'],
];

/** The key for an error, or the caller's fallback (see the rules above). */
export function errorKey(err, fallbackKey, overrides = {}) {
  if (err?.code && overrides[err.code]) return overrides[err.code];
  if (err?.status && overrides[err.status]) return overrides[err.status];
  // fetch rejects with a TypeError when no response arrives; the message
  // differs by browser ("Failed to fetch", "Load failed", "NetworkError…").
  if (!err?.status && err instanceof TypeError && /fetch|load failed|network/i.test(err.message)) return 'errors.network';
  if (err?.code && COGNITO[err.code]) return COGNITO[err.code];
  const message = err?.body?.error ?? '';
  const known = API_ERRORS.find(([status, pattern]) => err?.status === status && pattern.test(message));
  return known ? known[2] : fallbackKey;
}

/** Plain text for a toast or a status line. */
export function errorText(err, fallbackKey, overrides) {
  return text(errorKey(err, fallbackKey, overrides));
}
