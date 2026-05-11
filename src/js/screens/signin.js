// Sign-in screen — email + password.

import { auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleSigninSubmit } from './auth-handlers.js';

export function renderSignin(emailParam = '') {
  const initialEmail = emailParam ? decodeURIComponent(emailParam) : '';
  const container = document.getElementById('screen-signin');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">Welcome back</h2>
        <p class="auth-subtext">Sign in to see what's happening nearby.</p>

        <form class="auth-form" id="signinForm">
          <label class="auth-label" for="signinEmail">Email</label>
          <input class="auth-input" id="signinEmail" type="email"
                 autocomplete="email" inputmode="email"
                 value="${escapeAttr(initialEmail)}" required>

          <label class="auth-label" for="signinPassword">Password</label>
          <input class="auth-input" id="signinPassword" type="password"
                 autocomplete="current-password" required>

          <button class="btn-primary" id="signinSubmit" type="submit">Sign in</button>
        </form>

        <p class="auth-alt">
          New to in·real·life?
          <a href="#signup" class="auth-link">Create an account</a>
        </p>
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
    submit.textContent = 'Signing in…';
    try {
      await handleSigninSubmit({ email, password, auth, navigate, showToast });
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });
}

function escapeAttr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
