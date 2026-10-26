// What a member reads when something fails (src/js/errors.js decides
// which). Each screen also has its own "couldn't do X" line, used when
// nothing more specific is known; those live with the screen's copy.

export default {
  'errors.network': "Can't reach in·real·life right now. Check your connection and try again.",
  'errors.sessionExpired': 'Your session expired. Sign in again.',
  'errors.agreementRequired': 'Our terms have changed. Accept the new version to keep going.',
  'errors.notYours': 'Only the organizer can do that.',
  'errors.eventGone': 'This event is no longer available.',
  'errors.retry': 'Someone changed this at the same moment. Try again.',
  'errors.eventFull': "This one's full. You can still say you're interested.",
  'errors.ideaConfirm': "Still an idea — set a time and place before confirming it's happening.",
  'errors.ideaInterest': 'Still an idea — say you’re interested until a time and place are set.',
  'errors.eventMovedOn': 'This event has moved on since you opened it. Go back and open it again to see where it stands.',
  'errors.suggestionSettled': 'That suggestion has already been settled.',
  'errors.pollClosed': 'That poll has closed.',
  'errors.debriefFirst': 'Tell us how it went first, then you can add more.',
  'errors.debriefConfirmedOnly': 'Only people who said they’d be there can say how it went.',

  // Sign-up and sign-in (Cognito). The fixed ones keep Cognito's own
  // wording, which members already see today.
  'errors.auth.emailTaken': 'An account with the given email already exists.',
  'errors.auth.wrongPassword': 'Incorrect username or password.',
  'errors.auth.notConfirmed': 'Confirm your email first — enter the code we sent you.',
  'errors.auth.codeMismatch': 'Invalid verification code provided, please try again.',
  'errors.auth.codeExpired': 'That code has expired. Start over from sign-up to get a new one.',
  'errors.auth.weakPassword': 'Choose a stronger password: at least 8 characters.',
  'errors.auth.tooMany': 'Too many tries. Wait a few minutes, then try again.',
};
