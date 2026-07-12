// Agreement re-acceptance screen — shown when the required Terms of Use
// version has moved past the one this member accepted. Decision logic
// lives in agreement-handlers.js.

import { commands, auth, api } from '../services.js';
import { navigate, showToast } from '../app.js';
import { AGREEMENT_LAST_UPDATED } from '../agreement.js';
import { handleAgreementMount, handleAgreementAccept } from './agreement-handlers.js';

export function renderAgreement() {
  if (!auth.getCurrentTokens()) {
    navigate('signin');
    return;
  }

  const container = document.getElementById('screen-agreement');
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">Our terms have changed</h2>
        <p class="auth-subtext" id="agreementSubtext">One moment…</p>
      </div>
    </div>
  `;

  mount(container);
}

async function mount(container) {
  const facts = await handleAgreementMount({ api, navigate, showToast });
  if (!facts) return;

  const { requiredAgreementVersion } = facts;
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-content">
        <h1 class="wordmark">in<span>·</span>real<span>·</span>life</h1>
        <h2 class="auth-title">Our terms have changed</h2>
        <p class="auth-subtext">
          We’ve updated the Terms of Use (now ${escapeHtml(requiredAgreementVersion)},
          last updated ${escapeHtml(AGREEMENT_LAST_UPDATED)}). Please take a look and
          accept the new version to keep using in·real·life. Until then you can
          still browse, export your data, or delete your account.
        </p>
        <p class="auth-subtext">
          <a href="terms.html" target="_blank" rel="noopener" class="auth-link">Read the Terms of Use</a>
        </p>
        <form class="auth-form" id="agreementForm">
          <button class="btn-primary" id="agreementAccept" type="submit">I agree</button>
        </form>
        <p class="auth-subtext">
          <a href="#" class="auth-link" id="agreementSignOut">Sign out instead</a>
        </p>
      </div>
    </div>
  `;

  const form = document.getElementById('agreementForm');
  const button = document.getElementById('agreementAccept');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    button.textContent = 'Saving…';
    const ok = await handleAgreementAccept({
      agreementVersion: requiredAgreementVersion,
      commands,
      navigate,
      showToast,
    });
    if (!ok) {
      button.disabled = false;
      button.textContent = 'I agree';
    }
  });

  document.getElementById('agreementSignOut').addEventListener('click', (e) => {
    e.preventDefault();
    auth.signOut();
    navigate('signin');
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
