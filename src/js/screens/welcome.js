// Post-sign-in router screen.
//
// Calls GET /me and forwards the user to the right next screen. New users
// (404) get registered then sent to onboarding; returning users with a
// completed profile go straight to the feed (after caching the profile
// locally so the offline-first feed has data to render). The decision
// tree itself lives in welcome-handlers.js so it can be unit-tested.

import * as store from '../store.js';
import { auth, api, commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleWelcomeMount } from './welcome-handlers.js';

export function renderWelcome() {
  const container = document.getElementById('screen-welcome');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">Welcome</h2>
        <p class="auth-subtext" id="welcomeStatus">Loading your account…</p>

        <button class="btn-primary" id="welcomeRetry" type="button" style="display:none">Try again</button>
        <button class="btn-primary" id="welcomeSignOut" type="button" style="display:none; margin-top: 12px;">Sign out</button>
      </div>
    </div>
  `;

  const status = document.getElementById('welcomeStatus');
  const retry = document.getElementById('welcomeRetry');
  const signOut = document.getElementById('welcomeSignOut');

  retry.addEventListener('click', () => attemptMount());
  signOut.addEventListener('click', () => {
    auth.signOut();
    navigate('signin');
  });

  attemptMount();

  async function attemptMount() {
    status.textContent = 'Loading your account…';
    retry.style.display = 'none';
    signOut.style.display = 'none';

    let toastMessage = null;
    const captureToast = (msg) => { toastMessage = msg; showToast(msg); };

    await handleWelcomeMount({
      api,
      commands,
      navigate,
      showToast: captureToast,
      saveUser,
    });

    // If a toast was shown without a navigate, surface retry/sign-out controls.
    if (toastMessage) {
      status.textContent = toastMessage;
      retry.style.display = '';
      signOut.style.display = '';
    }
  }
}

function saveUser(me) {
  store.saveUser({
    id: me.userId,
    name: me.name,
    avatar: me.avatar,
    vibeMessage: me.vibeMessage,
    interviewResponses: me.interviewResponses ?? [],
    createdAt: me.createdAt ?? new Date().toISOString(),
  });
  store.setActiveUser(me.userId);
}
