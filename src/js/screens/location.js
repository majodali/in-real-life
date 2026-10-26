// Pre-signup location gate.
//
// Asks for the user's postal code; on "supported" we stash the entry for
// the post-signup locality screen and forward to /signup. On "not
// supported" we swap the form into a notify-me capture so we can let
// them know when in·real·life arrives in their area.

import { commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleLocationCheck, handleNotifySubmit } from './location-handlers.js';
import { t, text } from '../copy.js';

const bold = (value) => () => `<strong>${escapeHtml(value)}</strong>`;

const STASH_KEY = 'irl_signup_location';

export function renderLocation() {
  const container = document.getElementById('screen-location');
  renderCheckForm(container, '');
}

function renderCheckForm(container, initialPostal) {
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">${t('auth.location.title')}</h2>
        <p class="auth-subtext">${t('auth.location.subtext')}</p>

        <form class="auth-form" id="locationForm">
          <label class="auth-label" for="locationPostal">${t('auth.field.postalCode')}</label>
          <input class="auth-input" id="locationPostal" type="text"
                 inputmode="numeric" autocomplete="postal-code"
                 required value="${escapeAttr(initialPostal)}">

          <button class="btn-primary" id="locationSubmit" type="submit">${t('common.continue')}</button>
        </form>

        <p class="auth-alt">${t('auth.haveAccount', { link: (inner) => `<a href="app.html#signin" class="auth-link">${inner}</a>` })}</p>
      </div>
    </div>
  `;

  const form = document.getElementById('locationForm');
  const submit = document.getElementById('locationSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const postalCode = document.getElementById('locationPostal').value;

    submit.disabled = true;
    submit.textContent = text('auth.location.checking');
    try {
      await handleLocationCheck({
        postalCode,
        commands,
        showToast,
        stash: stashLocation,
        onSupported: () => navigate('signup'),
        onUnsupported: ({ postalCode: pc }) => renderNotifyForm(container, pc),
      });
    } finally {
      submit.disabled = false;
      submit.textContent = text('common.continue');
    }
  });
}

function renderNotifyForm(container, postalCode) {
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">${t('auth.notify.title')}</h2>
        <p class="auth-subtext">${t('auth.notify.subtext', { postalCode: bold(postalCode) })}</p>

        <form class="auth-form" id="notifyForm">
          <label class="auth-label" for="notifyEmail">${t('auth.field.email')}</label>
          <input class="auth-input" id="notifyEmail" type="email"
                 autocomplete="email" inputmode="email" required>

          <button class="btn-primary" id="notifySubmit" type="submit">${t('auth.notify.submit')}</button>
        </form>

        <p class="auth-alt">
          <a href="#" class="auth-link" id="notifyBack">${t('auth.notify.back')}</a>
        </p>
      </div>
    </div>
  `;

  const form = document.getElementById('notifyForm');
  const submit = document.getElementById('notifySubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('notifyEmail').value;

    submit.disabled = true;
    submit.textContent = text('common.saving');
    try {
      await handleNotifySubmit({
        email,
        postalCode,
        commands,
        showToast,
        onNotifySuccess: () => renderNotifyThanks(container),
      });
    } finally {
      submit.disabled = false;
      submit.textContent = text('auth.notify.submit');
    }
  });

  document.getElementById('notifyBack').addEventListener('click', (e) => {
    e.preventDefault();
    renderCheckForm(container, postalCode);
  });
}

function renderNotifyThanks(container) {
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">${t('auth.notify.thanksTitle')}</h2>
        <p class="auth-subtext">${t('auth.notify.thanks')}</p>

        <p class="auth-alt"><a href="index.html" class="auth-link">${t('auth.notify.home')}</a></p>
      </div>
    </div>
  `;
}

function stashLocation({ postalCode, area }) {
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ postalCode, area }));
  } catch { /* sessionStorage unavailable — locality screen will fall back to defaults */ }
}

export function readStashedLocation() {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function escapeAttr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
