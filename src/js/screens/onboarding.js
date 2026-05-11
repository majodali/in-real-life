// ─── Onboarding — first-time user flow ───
//
// Uses the reusable interview engine, then shows a confirmation card
// where the user picks an avatar and sets a vibe message. Reached only
// after sign-in via the welcome screen — direct navigation without a
// Cognito session bounces back to sign-in.

import * as store from '../store.js';
import { INTERVIEW_FLOW, AVATAR_EMOJIS } from '../data.js';
import { startInterview } from './interview.js';
import { navigate, showToast } from '../app.js';
import { auth, commands } from '../services.js';

let interviewResponses = [];
let userName = '';

export function renderOnboarding() {
  if (!auth.getCurrentTokens()) {
    navigate('signin');
    return;
  }

  const container = document.getElementById('screen-onboarding');
  container.innerHTML = '';

  startInterview(container, {
    questions: INTERVIEW_FLOW,
    showProgress: true,
    onComplete: (responses) => {
      interviewResponses = responses;
      const nameResponse = responses.find(r => r.questionId === 'name');
      userName = nameResponse?.response || 'Friend';
      showConfirmationCard(container);
    },
    onCancel: () => {
      window.location.href = 'index.html';
    },
  });
}

function showConfirmationCard(container) {
  let selectedAvatar = AVATAR_EMOJIS[0];
  let vibeMessage = '';

  container.innerHTML = `
    <div class="interview-card confirmation-card">
      <div class="interview-content">
        <h2 class="interview-question">Nice to meet you, ${escapeHtml(userName)}!</h2>
        <p class="interview-subtext">Let\u2019s set up how others will see you. Remember \u2014 only your name, avatar, and vibe are shared.</p>

        <div class="confirmation-section">
          <label class="confirmation-label">Pick an avatar</label>
          <div class="emoji-picker" id="emojiPicker">
            ${AVATAR_EMOJIS.map(e => `
              <button class="emoji-option ${e === selectedAvatar ? 'selected' : ''}" data-emoji="${e}">${e}</button>
            `).join('')}
          </div>
        </div>

        <div class="confirmation-section">
          <label class="confirmation-label">Your current vibe</label>
          <input
            class="interview-text-input"
            id="vibeInput"
            type="text"
            placeholder="e.g. Always up for a morning walk"
            maxlength="60"
          >
          <p class="vibe-hint">A short message others will see \u2014 what are you about right now?</p>
        </div>

        <div class="confirmation-preview">
          <div class="preview-label">How you\u2019ll appear</div>
          <div class="preview-card">
            <div class="preview-avatar" id="previewAvatar">${selectedAvatar}</div>
            <div class="preview-info">
              <div class="preview-name">${escapeHtml(userName)}</div>
              <div class="preview-vibe" id="previewVibe">Set your vibe above</div>
            </div>
          </div>
        </div>
      </div>

      <div class="interview-nav">
        <button class="interview-nav-btn back" id="confBack">\u2190 Back</button>
        <div class="interview-nav-spacer"></div>
        <button class="interview-nav-btn next" id="confDone">Find my people \u2192</button>
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
    document.getElementById('previewVibe').textContent = vibeMessage || 'Set your vibe above';
  });

  // Back — return to interview (last question)
  document.getElementById('confBack').addEventListener('click', () => {
    renderOnboarding(); // restart (could be smarter, but simple for now)
  });

  const doneBtn = document.getElementById('confDone');
  doneBtn.addEventListener('click', async () => {
    doneBtn.disabled = true;
    doneBtn.textContent = 'Saving…';
    try {
      await commands.createProfile({
        name: userName,
        avatar: selectedAvatar,
        vibeMessage: vibeMessage || '',
        interviewResponses,
      });
      navigate('locality');
    } catch (err) {
      doneBtn.disabled = false;
      doneBtn.textContent = 'Find my people →';
      if (err.status === 409) {
        // Profile already exists in the backend. Until we have a GET /me
        // endpoint to surface it locally, returning users can't progress
        // past this screen — sign out and back in is the only path.
        showToast('You already have a profile on this account.');
      } else if (err.status === 404) {
        showToast('Account not registered yet — please sign in again.');
        navigate('signin');
      } else {
        showToast(err.message || 'Could not save your profile.');
      }
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
