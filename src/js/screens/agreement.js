// Agreement re-acceptance screen — shown when the required Terms of Use
// version has moved past the one this member accepted. Decision logic
// lives in agreement-handlers.js.

import { commands, auth, api } from '../services.js';
import { navigate, showToast } from '../app.js';
import { AGREEMENT_LAST_UPDATED } from '../agreement.js';
import { handleAgreementMount, handleAgreementAccept } from './agreement-handlers.js';
import { t, text, date } from '../copy.js';

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
        <h2 class="auth-title">${t('auth.agreement.title')}</h2>
        <p class="auth-subtext" id="agreementSubtext">${t('common.oneMoment')}</p>
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
        <h2 class="auth-title">${t('auth.agreement.title')}</h2>
        <p class="auth-subtext">${t('auth.agreement.body', { version: requiredAgreementVersion, updated: date(AGREEMENT_LAST_UPDATED, 'agreementDate') })}</p>
        <p class="auth-subtext">
          <a href="terms.html" target="_blank" rel="noopener" class="auth-link">${t('auth.agreement.read')}</a>
        </p>
        <form class="auth-form" id="agreementForm">
          <button class="btn-primary" id="agreementAccept" type="submit">${t('auth.agreement.accept')}</button>
        </form>
        <p class="auth-subtext">
          <a href="#" class="auth-link" id="agreementSignOut">${t('auth.agreement.signOut')}</a>
        </p>
      </div>
    </div>
  `;

  const form = document.getElementById('agreementForm');
  const button = document.getElementById('agreementAccept');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    button.textContent = text('common.saving');
    const ok = await handleAgreementAccept({
      agreementVersion: requiredAgreementVersion,
      commands,
      navigate,
      showToast,
    });
    if (!ok) {
      button.disabled = false;
      button.textContent = text('auth.agreement.accept');
    }
  });

  document.getElementById('agreementSignOut').addEventListener('click', (e) => {
    e.preventDefault();
    auth.signOut();
    navigate('signin');
  });
}
