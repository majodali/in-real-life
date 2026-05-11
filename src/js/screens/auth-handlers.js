// Pure submit handlers for the auth screens.
//
// Each function validates input, calls the auth service, and routes via
// the injected navigate / showToast callbacks. Kept free of DOM access so
// the spec in auth-handlers.test.mjs can exercise the full flow.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const CODE_RE = /^\d{6}$/;

export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email);
}

export async function handleSignupSubmit({ email, password, agreed, auth, navigate, showToast }) {
  if (!isValidEmail(email)) {
    showToast('Please enter a valid email address.');
    return;
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    showToast(`Password must be at least ${MIN_PASSWORD} characters.`);
    return;
  }
  if (!agreed) {
    showToast('Please agree to the terms to continue.');
    return;
  }
  try {
    await auth.signUp({ email, password });
    navigate('confirm', encodeURIComponent(email));
  } catch (err) {
    showToast(err.message || 'Sign-up failed. Please try again.');
  }
}

export async function handleConfirmSubmit({ email, code, auth, navigate, showToast }) {
  if (!CODE_RE.test(code ?? '')) {
    showToast('Enter the 6-digit code from your email.');
    return;
  }
  try {
    await auth.confirmSignUp({ email, code });
    navigate('signin', encodeURIComponent(email));
  } catch (err) {
    showToast(err.message || 'Could not confirm code. Please try again.');
  }
}

export async function handleSigninSubmit({ email, password, auth, navigate, showToast }) {
  if (!isValidEmail(email)) {
    showToast('Please enter a valid email address.');
    return;
  }
  if (typeof password !== 'string' || password.length === 0) {
    showToast('Please enter your password.');
    return;
  }
  try {
    await auth.signIn({ email, password });
    navigate('welcome');
  } catch (err) {
    showToast(err.message || 'Sign-in failed. Please try again.');
  }
}
