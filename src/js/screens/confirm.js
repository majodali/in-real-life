// Confirm-sign-up screen — user enters the 6-digit code from email.

import { auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleConfirmSubmit } from './auth-handlers.js';

export function renderConfirm(emailParam = '') {
  const email = emailParam ? decodeURIComponent(emailParam) : '';
  const container = document.getElementById('screen-confirm');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">Confirm your email</h2>
        <p class="auth-subtext">
          We sent a 6-digit code to <strong>${escapeHtml(email || 'your email')}</strong>.
          Enter it below to finish creating your account.
        </p>

        <form class="auth-form" id="confirmForm">
          <label class="auth-label" for="confirmCode">Confirmation code</label>
          <input class="auth-input" id="confirmCode" type="text"
                 inputmode="numeric" pattern="\\d{6}" maxlength="6"
                 autocomplete="one-time-code" required>

          <button class="btn-primary" id="confirmSubmit" type="submit">Confirm</button>
        </form>

        <p class="auth-alt">
          Wrong email?
          <a href="#signup" class="auth-link">Start over</a>
        </p>
      </div>
    </div>
  `;

  const form = document.getElementById('confirmForm');
  const submit = document.getElementById('confirmSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('confirmCode').value.trim();

    if (!email) {
      showToast('Missing email — please start over from sign-up.');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Confirming…';
    try {
      await handleConfirmSubmit({ email, code, auth, navigate, showToast });
    } finally {
      submit.disabled = false;
      submit.textContent = 'Confirm';
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
