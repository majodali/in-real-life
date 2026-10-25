// Confirm-sign-up screen — user enters the 6-digit code from email.

import { auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleConfirmSubmit } from './auth-handlers.js';
import { t, text } from '../copy.js';

export function renderConfirm(emailParam = '') {
  const email = emailParam ? decodeURIComponent(emailParam) : '';
  const container = document.getElementById('screen-confirm');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">${t('auth.confirm.title')}</h2>
        <p class="auth-subtext">${t('auth.confirm.subtext', { email: () => `<strong>${escapeHtml(email || text('auth.confirm.yourEmail'))}</strong>` })}</p>

        <form class="auth-form" id="confirmForm">
          <label class="auth-label" for="confirmCode">${t('auth.confirm.code')}</label>
          <input class="auth-input" id="confirmCode" type="text"
                 inputmode="numeric" pattern="\\d{6}" maxlength="6"
                 autocomplete="one-time-code" required>

          <button class="btn-primary" id="confirmSubmit" type="submit">${t('auth.confirm.submit')}</button>
        </form>

        <p class="auth-alt">${t('auth.confirm.wrongEmail', { link: (inner) => `<a href="#signup" class="auth-link">${inner}</a>` })}</p>
      </div>
    </div>
  `;

  const form = document.getElementById('confirmForm');
  const submit = document.getElementById('confirmSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('confirmCode').value.trim();

    if (!email) {
      showToast(text('auth.confirm.noEmail'));
      return;
    }

    submit.disabled = true;
    submit.textContent = text('auth.confirm.submitting');
    try {
      await handleConfirmSubmit({ email, code, auth, navigate, showToast });
    } finally {
      submit.disabled = false;
      submit.textContent = text('auth.confirm.submit');
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
