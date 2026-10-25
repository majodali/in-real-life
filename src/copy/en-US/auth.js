// Getting in: the postal-code gate, sign-up, confirm, sign-in, the
// locality step, the welcome router and the terms re-acceptance screen
// (src/js/screens/). Links and emphasis stay inside their sentences.

export default {
  'auth.field.email': 'Email',
  'auth.field.password': 'Password',
  'auth.field.postalCode': 'Postal code',
  'auth.haveAccount': 'Already have an account? {link:Sign in}',
  'auth.badEmail': 'Please enter a valid email address.',
  'auth.needPostal': 'Please enter your postal code.',
  'auth.notRegistered': 'Account not registered yet — please sign in again.',
  'auth.loadAccountFailed': 'Could not load your account.',

  // The postal-code gate before sign-up, and the notify-me capture when
  // we are not in the visitor's area yet.
  'auth.location.title': 'Where do you live?',
  'auth.location.subtext': "We start with one neighborhood at a time. Tell us your postal code and we'll let you in if we're already there — or save your spot if we're not.",
  'auth.location.checking': 'Checking…',
  'auth.location.checkFailed': 'Could not check your location. Please try again.',
  'auth.notify.title': 'Not there yet',
  // {postalCode} is shown in bold.
  'auth.notify.subtext': "We're not in {postalCode} yet. Leave us your email and we'll be in touch when in·real·life arrives in your neighborhood.",
  'auth.notify.submit': 'Keep me posted',
  'auth.notify.back': 'Use a different postal code',
  'auth.notify.failed': 'Could not add you to the list. Please try again.',
  'auth.notify.thanksTitle': 'Thank you',
  'auth.notify.thanks': "We'll be in touch when in·real·life arrives in your neighborhood.",
  'auth.notify.home': 'Back to home',

  'auth.signup.title': 'Create your account',
  'auth.signup.subtext': 'Real meetups for real people on Bainbridge Island.',
  'auth.signup.passwordHint': 'At least 8 characters.',
  'auth.signup.agree': "I agree to the {terms:Terms of Use} and confirm I'm 18 or older.",
  'auth.signup.submit': 'Create account',
  'auth.signup.submitting': 'Creating account…',
  'auth.signup.shortPassword': 'Password must be at least {min} characters.',
  'auth.signup.mustAgree': 'Please agree to the terms to continue.',
  'auth.signup.failed': 'Sign-up failed. Please try again.',

  'auth.confirm.title': 'Confirm your email',
  // {email} is shown in bold.
  'auth.confirm.subtext': 'We sent a 6-digit code to {email}. Enter it below to finish creating your account.',
  'auth.confirm.yourEmail': 'your email',
  'auth.confirm.code': 'Confirmation code',
  'auth.confirm.submit': 'Confirm',
  'auth.confirm.submitting': 'Confirming…',
  'auth.confirm.wrongEmail': 'Wrong email? {link:Start over}',
  'auth.confirm.noEmail': 'Missing email — please start over from sign-up.',
  'auth.confirm.badCode': 'Enter the 6-digit code from your email.',
  'auth.confirm.failed': 'Could not confirm code. Please try again.',

  'auth.signin.title': 'Welcome back',
  'auth.signin.subtext': "Sign in to see what's happening nearby.",
  'auth.signin.submit': 'Sign in',
  'auth.signin.submitting': 'Signing in…',
  'auth.signin.newHere': 'New to in·real·life? {link:Create an account}',
  'auth.signin.noPassword': 'Please enter your password.',
  'auth.signin.failed': 'Sign-in failed. Please try again.',

  // After sign-up: where the member lives, checked against the
  // communities we serve.
  'auth.locality.title': 'Where are you?',
  'auth.locality.subtext': 'We use this to surface meetups within reach. Right now in·real·life is just on Bainbridge Island, so a nearby answer works best.',
  'auth.locality.city': 'City or town',
  'auth.locality.country': 'Country {optional:(optional)}',
  'auth.locality.verifying': 'Verifying…',
  'auth.locality.needCity': 'Please enter your city or town.',
  'auth.locality.notServed': "We're not in your area yet — please reach out if this is unexpected.",
  'auth.locality.failed': 'Could not verify your locality.',

  'auth.welcome.title': 'Welcome',
  'auth.welcome.loading': 'Loading your account…',
  'auth.welcome.retry': 'Try again',
  'auth.welcome.setupFailed': 'Could not set up your account.',

  'auth.agreement.title': 'Our terms have changed',
  'auth.agreement.body': 'We’ve updated the Terms of Use (now {version}, last updated {updated}). Please take a look and accept the new version to keep using in·real·life. Until then you can still browse, export your data, or delete your account.',
  'auth.agreement.read': 'Read the Terms of Use',
  'auth.agreement.accept': 'I agree',
  'auth.agreement.signOut': 'Sign out instead',
  'auth.agreement.failed': 'Could not record your acceptance.',
};
