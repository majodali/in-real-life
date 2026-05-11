// Pre-signup location gate.
//
// Asks for the user's postal code; on "supported" we stash the entry for
// the post-signup locality screen and forward to /signup. On "not
// supported" we swap the form into a notify-me capture so we can let
// them know when in·real·life arrives in their area.

import { commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleLocationCheck, handleNotifySubmit } from './location-handlers.js';

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
        <h2 class="auth-title">Where do you live?</h2>
        <p class="auth-subtext">
          We start with one neighborhood at a time. Tell us your postal
          code and we'll let you in if we're already there &mdash; or save
          your spot if we're not.
        </p>

        <form class="auth-form" id="locationForm">
          <label class="auth-label" for="locationPostal">Postal code</label>
          <input class="auth-input" id="locationPostal" type="text"
                 inputmode="numeric" autocomplete="postal-code"
                 required value="${escapeAttr(initialPostal)}">

          <button class="btn-primary" id="locationSubmit" type="submit">Continue</button>
        </form>

        <p class="auth-alt">
          Already have an account?
          <a href="app.html#signin" class="auth-link">Sign in</a>
        </p>
      </div>
    </div>
  `;

  const form = document.getElementById('locationForm');
  const submit = document.getElementById('locationSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const postalCode = document.getElementById('locationPostal').value;

    submit.disabled = true;
    submit.textContent = 'Checking…';
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
      submit.textContent = 'Continue';
    }
  });
}

function renderNotifyForm(container, postalCode) {
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">Not there yet</h2>
        <p class="auth-subtext">
          We're not in <strong>${escapeHtml(postalCode)}</strong> yet. Leave
          us your email and we'll be in touch when in·real·life arrives in
          your neighborhood.
        </p>

        <form class="auth-form" id="notifyForm">
          <label class="auth-label" for="notifyEmail">Email</label>
          <input class="auth-input" id="notifyEmail" type="email"
                 autocomplete="email" inputmode="email" required>

          <button class="btn-primary" id="notifySubmit" type="submit">Keep me posted</button>
        </form>

        <p class="auth-alt">
          <a href="#" class="auth-link" id="notifyBack">Use a different postal code</a>
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
    submit.textContent = 'Saving…';
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
      submit.textContent = 'Keep me posted';
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
        <h2 class="auth-title">Thank you</h2>
        <p class="auth-subtext">
          We'll be in touch when in·real·life arrives in your neighborhood.
        </p>

        <p class="auth-alt"><a href="index.html" class="auth-link">Back to home</a></p>
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
