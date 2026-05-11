// Locality screen — collects city + optional postal code/country and posts
// /me/locality, which in workshop mode also auto-verifies and activates the
// user. The decision logic lives in locality-handlers.js.

import { commands, auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleLocalitySubmit } from './locality-handlers.js';
import { readStashedLocation } from './location.js';

export function renderLocality() {
  if (!auth.getCurrentTokens()) {
    navigate('signin');
    return;
  }

  const stashed = readStashedLocation();
  const initialCity = stashed?.area ?? 'Bainbridge Island';
  const initialPostal = stashed?.postalCode ?? '';

  const container = document.getElementById('screen-locality');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">Where are you?</h2>
        <p class="auth-subtext">
          We use this to surface meetups within reach. Right now in·real·life
          is just on Bainbridge Island, so a nearby answer works best.
        </p>

        <form class="auth-form" id="localityForm">
          <label class="auth-label" for="localityCity">City or town</label>
          <input class="auth-input" id="localityCity" type="text"
                 autocomplete="address-level2" required value="${escapeAttr(initialCity)}">

          <label class="auth-label" for="localityPostal">Postal code</label>
          <input class="auth-input" id="localityPostal" type="text"
                 autocomplete="postal-code" inputmode="numeric" required
                 value="${escapeAttr(initialPostal)}">

          <label class="auth-label" for="localityCountry">Country <span class="auth-optional">(optional)</span></label>
          <input class="auth-input" id="localityCountry" type="text"
                 autocomplete="country-name" value="US">

          <button class="btn-primary" id="localitySubmit" type="submit">Continue</button>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('localityForm');
  const submit = document.getElementById('localitySubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const city = document.getElementById('localityCity').value;
    const postalCode = document.getElementById('localityPostal').value;
    const country = document.getElementById('localityCountry').value;

    submit.disabled = true;
    submit.textContent = 'Verifying…';
    try {
      await handleLocalitySubmit({ city, postalCode, country, commands, navigate, showToast });
    } finally {
      submit.disabled = false;
      submit.textContent = 'Continue';
    }
  });
}

function escapeAttr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
