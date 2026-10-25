// Sign-up screen — email, password, terms agreement.
//
// Pure validation + auth call lives in auth-handlers.js. This file is the
// DOM glue: build the form, read inputs on submit, hand off to the handler.

import { auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleSignupSubmit } from './auth-handlers.js';
import { t, text } from '../copy.js';

export function renderSignup(initialEmail = '') {
  const container = document.getElementById('screen-signup');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">${t('auth.signup.title')}</h2>
        <p class="auth-subtext">${t('auth.signup.subtext')}</p>

        <form class="auth-form" id="signupForm">
          <label class="auth-label" for="signupEmail">${t('auth.field.email')}</label>
          <input class="auth-input" id="signupEmail" type="email" autocomplete="email"
                 inputmode="email" value="${escapeAttr(initialEmail)}" required>

          <label class="auth-label" for="signupPassword">${t('auth.field.password')}</label>
          <input class="auth-input" id="signupPassword" type="password"
                 autocomplete="new-password" minlength="8" required>
          <p class="auth-hint">${t('auth.signup.passwordHint')}</p>

          <label class="auth-check">
            <input type="checkbox" id="signupAgree">
            <span>${t('auth.signup.agree', { terms: (inner) => `<a href="terms.html" target="_blank" rel="noopener" class="auth-link">${inner}</a>` })}</span>
          </label>

          <button class="btn-primary" id="signupSubmit" type="submit">${t('auth.signup.submit')}</button>
        </form>

        <p class="auth-alt">${t('auth.haveAccount', { link: (inner) => `<a href="#signin" class="auth-link">${inner}</a>` })}</p>
      </div>
    </div>
  `;

  const form = document.getElementById('signupForm');
  const submit = document.getElementById('signupSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const agreed = document.getElementById('signupAgree').checked;

    submit.disabled = true;
    submit.textContent = text('auth.signup.submitting');
    try {
      await handleSignupSubmit({ email, password, agreed, auth, navigate, showToast });
    } finally {
      submit.disabled = false;
      submit.textContent = text('auth.signup.submit');
    }
  });
}

function escapeAttr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
