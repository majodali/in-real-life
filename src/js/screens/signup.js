// Sign-up screen — email, password, terms agreement.
//
// Pure validation + auth call lives in auth-handlers.js. This file is the
// DOM glue: build the form, read inputs on submit, hand off to the handler.

import { auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleSignupSubmit } from './auth-handlers.js';

export function renderSignup(initialEmail = '') {
  const container = document.getElementById('screen-signup');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">Create your account</h2>
        <p class="auth-subtext">Real meetups for real people on Bainbridge Island.</p>

        <form class="auth-form" id="signupForm">
          <label class="auth-label" for="signupEmail">Email</label>
          <input class="auth-input" id="signupEmail" type="email" autocomplete="email"
                 inputmode="email" value="${escapeAttr(initialEmail)}" required>

          <label class="auth-label" for="signupPassword">Password</label>
          <input class="auth-input" id="signupPassword" type="password"
                 autocomplete="new-password" minlength="8" required>
          <p class="auth-hint">At least 8 characters.</p>

          <label class="auth-check">
            <input type="checkbox" id="signupAgree">
            <span>I agree to the <a href="terms.html" target="_blank" rel="noopener" class="auth-link">Terms of Use</a> and confirm I'm 18 or older.</span>
          </label>

          <button class="btn-primary" id="signupSubmit" type="submit">Create account</button>
        </form>

        <p class="auth-alt">
          Already have an account?
          <a href="#signin" class="auth-link">Sign in</a>
        </p>
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
    submit.textContent = 'Creating account…';
    try {
      await handleSignupSubmit({ email, password, agreed, auth, navigate, showToast });
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create account';
    }
  });
}

function escapeAttr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
