// ─── Onboarding — first-time user flow ───
//
// Name card first (a form field, not interview content — D42), then the
// live interview loop against POST /me/interview/turn. If the first live
// turn fails, the scripted flow from data.js takes over so the interview
// still works offline. Either path ends at the confirmation card, which
// runs the completion sequence: profile basics, then POST /me/onboarding.
// Reached only after sign-in via the welcome screen — direct navigation
// without a Cognito session bounces back to sign-in.

import { INTERVIEW_FLOW, AVATAR_EMOJIS } from '../data.js';
import { startInterview } from './interview.js';
import { navigate, showToast } from '../app.js';
import { auth, commands } from '../services.js';
import {
  appendExchange,
  scriptedResponsesToTranscript,
  handleInterviewTurn,
  handleOnboardingDone,
} from './onboarding-handlers.js';
import { t, attr, text } from '../copy.js';

// Sent to the interviewer as the member's own answer.
const SKIP_ANSWER = text('onboarding.skipAnswer');

let userName = '';
let transcript = [];

export function renderOnboarding() {
  if (!auth.getCurrentTokens()) {
    navigate('signin');
    return;
  }

  const container = document.getElementById('screen-onboarding');
  container.innerHTML = '';
  userName = '';
  transcript = [];

  const nameQuestion = INTERVIEW_FLOW.find(q => q.type === 'name');
  startInterview(container, {
    questions: [nameQuestion],
    showProgress: false,
    onComplete: (responses) => {
      userName = responses.find(r => r.questionId === 'name')?.response || text('onboarding.defaultName');
      beginInterview(container);
    },
    onCancel: () => {
      window.location.href = 'index.html';
    },
  });
}

// Try the live loop; if the first turn fails, fall back to the scripted
// flow — the dev personas and offline preview keep working.
async function beginInterview(container) {
  showWaitingCard(container, text('common.oneMoment'));

  const { turn, error } = await handleInterviewTurn({ transcript, commands });
  if (error) {
    startScriptedInterview(container);
    return;
  }
  renderLiveTurn(container, turn);
}

function startScriptedInterview(container) {
  startInterview(container, {
    questions: INTERVIEW_FLOW,
    existingName: userName,
    showProgress: true,
    onComplete: (responses) => {
      transcript = scriptedResponsesToTranscript(responses);
      showConfirmationCard(container);
    },
    onCancel: () => {
      window.location.href = 'index.html';
    },
  });
}

// ─── Live interview loop ───

function renderLiveTurn(container, turn) {
  if (turn.done) {
    renderClosing(container, turn.closing);
  } else {
    renderLiveCard(container, turn.card);
  }
}

function renderLiveCard(container, card, prefill = '') {
  container.innerHTML = `
    <div class="interview-card" data-direction="forward">
      <div class="interview-content">
        <h2 class="interview-question">${escapeHtml(card.prompt)}</h2>
        ${card.subtext ? `<p class="interview-subtext">${escapeHtml(card.subtext)}</p>` : ''}

        <div class="interview-input-area">
          <textarea
            class="interview-textarea"
            id="interviewInput"
            placeholder="${attr('interview.answerPlaceholder')}"
            rows="4"
          >${escapeHtml(prefill)}</textarea>
        </div>

        ${card.helpers?.length ? `
          <div class="interview-helpers" id="helpersSection">
            <button class="helpers-toggle" id="helpersToggle">${t('interview.helpers.show')}</button>
            <div class="helpers-list" id="helpersList" style="display:none">
              ${card.helpers.map(h => `<div class="helper-item">${escapeHtml(h)}</div>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="interview-nav">
        <div class="interview-nav-spacer"></div>
        <button class="interview-nav-btn skip" id="navSkip">${t('interview.nav.skip')}</button>
        <button class="interview-nav-btn next" id="navNext">${t('interview.nav.next')}</button>
      </div>
    </div>
  `;

  const input = document.getElementById('interviewInput');
  setTimeout(() => input.focus(), 100);
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.max(input.scrollHeight, 100) + 'px';
  });

  const helpersToggle = document.getElementById('helpersToggle');
  const helpersList = document.getElementById('helpersList');
  if (helpersToggle && helpersList) {
    helpersToggle.addEventListener('click', () => {
      const visible = helpersList.style.display !== 'none';
      helpersList.style.display = visible ? 'none' : 'flex';
      helpersToggle.textContent = visible ? text('interview.helpers.show') : text('interview.helpers.hide');
    });
  }

  document.getElementById('navNext').addEventListener('click', () => {
    const answer = input.value.trim();
    if (!answer) {
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
      return;
    }
    submitAnswer(container, card, answer);
  });

  document.getElementById('navSkip').addEventListener('click', () => {
    submitAnswer(container, card, SKIP_ANSWER);
  });
}

async function submitAnswer(container, card, answer) {
  const nextTranscript = appendExchange(transcript, card.prompt, answer);
  showWaitingCard(container, text('onboarding.thinking'));

  const { turn, error } = await handleInterviewTurn({ transcript: nextTranscript, commands });
  if (error) {
    // Mid-interview failure: keep the transcript as-was and re-show the
    // same card with the answer prefilled so a tap on Next retries.
    showToast(text('onboarding.hiccup'));
    renderLiveCard(container, card, answer === SKIP_ANSWER ? '' : answer);
    return;
  }

  transcript = nextTranscript;
  renderLiveTurn(container, turn);
}

function renderClosing(container, closing) {
  container.innerHTML = `
    <div class="interview-card" data-direction="forward">
      <div class="interview-content">
        <h2 class="interview-question">${escapeHtml(closing.message)}</h2>
        <p class="interview-subtext">${escapeHtml(closing.nextStep)}</p>
      </div>
      <div class="interview-nav">
        <div class="interview-nav-spacer"></div>
        <button class="interview-nav-btn next" id="closingNext">${t('onboarding.closingNext')}</button>
      </div>
    </div>
  `;
  document.getElementById('closingNext').addEventListener('click', () => {
    showConfirmationCard(container);
  });
}

function showWaitingCard(container, message) {
  container.innerHTML = `
    <div class="interview-card">
      <div class="interview-content">
        <p class="interview-subtext">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

// ─── Confirmation card (avatar + vibe) ───

function showConfirmationCard(container) {
  let selectedAvatar = AVATAR_EMOJIS[0];
  let vibeMessage = '';

  container.innerHTML = `
    <div class="interview-card confirmation-card">
      <div class="interview-content">
        <h2 class="interview-question">${t('onboarding.confirm.title', { name: userName })}</h2>
        <p class="interview-subtext">${t('onboarding.confirm.subtext')}</p>

        <div class="confirmation-section">
          <label class="confirmation-label">${t('onboarding.confirm.avatar')}</label>
          <div class="emoji-picker" id="emojiPicker">
            ${AVATAR_EMOJIS.map(e => `
              <button class="emoji-option ${e === selectedAvatar ? 'selected' : ''}" data-emoji="${e}">${e}</button>
            `).join('')}
          </div>
        </div>

        <div class="confirmation-section">
          <label class="confirmation-label">${t('onboarding.confirm.vibe')}</label>
          <input
            class="interview-text-input"
            id="vibeInput"
            type="text"
            placeholder="${attr('onboarding.confirm.vibePlaceholder')}"
            maxlength="60"
          >
          <p class="vibe-hint">${t('onboarding.confirm.vibeHint')}</p>
        </div>

        <div class="confirmation-preview">
          <div class="preview-label">${t('onboarding.confirm.preview')}</div>
          <div class="preview-card">
            <div class="preview-avatar" id="previewAvatar">${selectedAvatar}</div>
            <div class="preview-info">
              <div class="preview-name">${escapeHtml(userName)}</div>
              <div class="preview-vibe" id="previewVibe">${t('onboarding.confirm.previewVibe')}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="interview-nav">
        <div class="interview-nav-spacer"></div>
        <button class="interview-nav-btn next" id="confDone">${t('onboarding.confirm.done')}</button>
      </div>
    </div>
  `;

  // Emoji picker
  document.getElementById('emojiPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emoji]');
    if (!btn) return;
    selectedAvatar = btn.dataset.emoji;
    document.querySelectorAll('.emoji-option').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('previewAvatar').textContent = selectedAvatar;
  });

  // Vibe input
  const vibeInput = document.getElementById('vibeInput');
  vibeInput.addEventListener('input', () => {
    vibeMessage = vibeInput.value.trim();
    document.getElementById('previewVibe').textContent = vibeMessage || text('onboarding.confirm.previewVibe');
  });

  const doneBtn = document.getElementById('confDone');
  doneBtn.addEventListener('click', async () => {
    doneBtn.disabled = true;
    doneBtn.textContent = text('common.saving');
    const ok = await handleOnboardingDone({
      name: userName,
      avatar: selectedAvatar,
      vibeMessage: vibeMessage || '',
      transcript,
      commands,
      navigate,
      showToast,
    });
    if (!ok) {
      doneBtn.disabled = false;
      doneBtn.textContent = text('onboarding.confirm.done');
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
