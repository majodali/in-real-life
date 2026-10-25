// Pure submit handlers for the auth screens.
//
// Each function validates input, calls the auth service, and routes via
// the injected navigate / showToast callbacks. Kept free of DOM access so
// the spec in auth-handlers.test.mjs can exercise the full flow.

import { text } from '../copy.js';
import { errorText } from '../errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const CODE_RE = /^\d{6}$/;

export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email);
}

export async function handleSignupSubmit({ email, password, agreed, auth, navigate, showToast }) {
  if (!isValidEmail(email)) {
    showToast(text('auth.badEmail'));
    return;
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    showToast(text('auth.signup.shortPassword', { min: MIN_PASSWORD }));
    return;
  }
  if (!agreed) {
    showToast(text('auth.signup.mustAgree'));
    return;
  }
  try {
    await auth.signUp({ email, password });
    navigate('confirm', encodeURIComponent(email));
  } catch (err) {
    showToast(errorText(err, 'auth.signup.failed'));
  }
}

export async function handleConfirmSubmit({ email, code, auth, navigate, showToast }) {
  if (!CODE_RE.test(code ?? '')) {
    showToast(text('auth.confirm.badCode'));
    return;
  }
  try {
    await auth.confirmSignUp({ email, code });
    navigate('signin', encodeURIComponent(email));
  } catch (err) {
    showToast(errorText(err, 'auth.confirm.failed'));
  }
}

export async function handleSigninSubmit({ email, password, auth, navigate, showToast }) {
  if (!isValidEmail(email)) {
    showToast(text('auth.badEmail'));
    return;
  }
  if (typeof password !== 'string' || password.length === 0) {
    showToast(text('auth.signin.noPassword'));
    return;
  }
  try {
    await auth.signIn({ email, password });
    navigate('welcome');
  } catch (err) {
    showToast(errorText(err, 'auth.signin.failed'));
  }
}
