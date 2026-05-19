// ─── Profile screen ───

import * as store from '../store.js';
import { AVATAR_EMOJIS, FOLLOWUP_QUESTIONS } from '../data.js';
import { startInterview } from './interview.js';
import { navigate, showToast } from '../app.js';
import { commands } from '../services.js';
import { handleProfileSave, handleAvatarChange, handleDataExport } from './profile-handlers.js';
import { renderEllipsisButton, bindEllipsis } from '../components/ellipsis-menu.js';

export function renderProfile() {
  const user = store.getActiveUser();
  if (!user) {
    navigate('feed');
    return;
  }

  const container = document.getElementById('screen-profile');

  container.innerHTML = `
    <div class="status-bar"><span>9:41</span><span>\u25CF\u25CF\u25CF</span></div>
    <div class="profile-header">
      <div class="profile-header-top">
        <button class="detail-back" id="profileBack">\u2190 Back</button>
        ${renderEllipsisButton()}
      </div>
      <div class="profile-header-title">Your profile</div>
    </div>
    <div class="profile-body">

      <div class="profile-card">
        <button class="profile-avatar-btn" id="avatarBtn">
          <span class="profile-avatar-large">${user.avatar || '\u{1F331}'}</span>
          <span class="profile-avatar-edit">tap to change</span>
        </button>

        <div class="profile-field">
          <label class="profile-field-label">Name</label>
          <input class="profile-field-input" id="nameInput" type="text" value="${escapeHtml(user.name)}" maxlength="30">
        </div>

        <div class="profile-field">
          <label class="profile-field-label">Current vibe</label>
          <input class="profile-field-input" id="vibeInput" type="text" value="${escapeHtml(user.vibeMessage || '')}" placeholder="What are you about right now?" maxlength="60">
        </div>

        <button class="btn-primary" id="saveBtn">Save changes</button>
      </div>

      <div class="profile-section">
        <button class="profile-tellmore-btn" id="tellMoreBtn">
          <span class="tellmore-icon">\u{1F4AC}</span>
          <span class="tellmore-text">
            <strong>Tell us more</strong>
            <small>Help us understand you better</small>
          </span>
          <span class="persona-arrow">\u2192</span>
        </button>
      </div>

      <div class="profile-section">
        <button class="profile-tellmore-btn" id="exportBtn">
          <span class="tellmore-icon">\u{1F4E6}</span>
          <span class="tellmore-text">
            <strong>Download my data</strong>
            <small>Everything we have about you, as a file</small>
          </span>
          <span class="persona-arrow">\u2193</span>
        </button>
      </div>

    </div>

    <!-- Emoji picker overlay -->
    <div class="emoji-overlay" id="emojiOverlay">
      <div class="emoji-overlay-sheet">
        <div class="modal-handle"></div>
        <div class="modal-title">Pick your avatar</div>
        <div class="emoji-picker" id="emojiGrid">
          ${AVATAR_EMOJIS.map(e => `
            <button class="emoji-option ${e === user.avatar ? 'selected' : ''}" data-emoji="${e}">${e}</button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Ellipsis menu (feedback only on profile)
  bindEllipsis(container, 'profile', () => renderProfile());

  // Back
  document.getElementById('profileBack').addEventListener('click', () => {
    navigate('feed');
  });

  // Save
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving\u2026';
    try {
      await handleProfileSave({
        name: document.getElementById('nameInput').value,
        vibeMessage: document.getElementById('vibeInput').value,
        commands,
        saveUser: cacheUser,
        showToast,
        onSuccess: () => navigate('feed'),
        onValidationError: (field) => {
          if (field === 'name') {
            const el = document.getElementById('nameInput');
            el.classList.add('shake');
            setTimeout(() => el.classList.remove('shake'), 400);
          }
        },
      });
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save changes';
    }
  });

  // Avatar picker
  const emojiOverlay = document.getElementById('emojiOverlay');

  document.getElementById('avatarBtn').addEventListener('click', () => {
    emojiOverlay.classList.add('active');
  });

  emojiOverlay.addEventListener('click', (e) => {
    if (e.target === emojiOverlay) emojiOverlay.classList.remove('active');
  });

  document.getElementById('emojiGrid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-emoji]');
    if (!btn) return;
    emojiOverlay.classList.remove('active');
    await handleAvatarChange({
      avatar: btn.dataset.emoji,
      commands,
      saveUser: cacheUser,
      showToast,
    });
    renderProfile();
  });

  // Tell us more
  document.getElementById('tellMoreBtn').addEventListener('click', () => {
    container.innerHTML = '';
    startInterview(container, {
      questions: FOLLOWUP_QUESTIONS,
      existingName: user.name,
      showProgress: true,
      onComplete: (responses) => {
        store.addInterviewResponses(user.id, responses);
        showToast('Thanks for sharing more! \u{1F33F}');
        renderProfile();
      },
      onCancel: () => {
        renderProfile();
      },
    });
  });

  // Download my data
  const exportBtn = document.getElementById('exportBtn');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try {
      await handleDataExport({ commands, triggerDownload, showToast });
    } finally {
      exportBtn.disabled = false;
    }
  });
}

function triggerDownload(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `in-real-life-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function cacheUser(profile) {
  const existing = store.getUser(profile.userId) ?? {};
  store.saveUser({
    ...existing,
    id: profile.userId,
    name: profile.name,
    avatar: profile.avatar,
    vibeMessage: profile.vibeMessage,
  });
  store.setActiveUser(profile.userId);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
