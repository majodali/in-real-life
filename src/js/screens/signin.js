// Sign-in screen — email + password.

import { auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleSigninSubmit } from './auth-handlers.js';
import { t, text, escapeAttr } from '../copy.js';

const signupLink = (inner) => `<a href="#signup" class="auth-link">${inner}</a>`;

export function renderSignin(emailParam = '') {
  const initialEmail = emailParam ? decodeURIComponent(emailParam) : '';
  const container = document.getElementById('screen-signin');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">${t('auth.signin.title')}</h2>
        <p class="auth-subtext">${t('auth.signin.subtext')}</p>

        <form class="auth-form" id="signinForm">
          <label class="auth-label" for="signinEmail">${t('auth.field.email')}</label>
          <input class="auth-input" id="signinEmail" type="email"
                 autocomplete="email" inputmode="email"
                 value="${escapeAttr(initialEmail)}" required>

          <label class="auth-label" for="signinPassword">${t('auth.field.password')}</label>
          <input class="auth-input" id="signinPassword" type="password"
                 autocomplete="current-password" required>

          <button class="btn-primary" id="signinSubmit" type="submit">${t('auth.signin.submit')}</button>
        </form>

        <p class="auth-alt">${t('auth.signin.newHere', { link: signupLink })}</p>
      </div>
    </div>
  `;

  const form = document.getElementById('signinForm');
  const submit = document.getElementById('signinSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signinEmail').value.trim();
    const password = document.getElementById('signinPassword').value;

    submit.disabled = true;
    submit.textContent = text('auth.signin.submitting');
    try {
      await handleSigninSubmit({ email, password, auth, navigate, showToast });
    } finally {
      submit.disabled = false;
      submit.textContent = text('auth.signin.submit');
    }
  });
}
