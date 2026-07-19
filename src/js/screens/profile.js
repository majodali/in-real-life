// ─── Profile screen ───

import * as store from '../store.js';
import { AVATAR_EMOJIS, FOLLOWUP_QUESTIONS } from '../data.js';
import { startInterview } from './interview.js';
import { navigate, showToast } from '../app.js';
import { commands, auth } from '../services.js';
import {
  handleProfileSave,
  handleAvatarChange,
  handleDataExport,
  handleAccountDelete,
} from './profile-handlers.js';
import {
  envelopeRows,
  chipLists,
  handleModelLoad,
  handleCorrection,
} from './model-handlers.js';
import { renderEllipsisButton, bindEllipsis } from '../components/ellipsis-menu.js';

export function renderProfile() {
  const user = store.getActiveUser();
  if (!user) {
    navigate('feed');
    return;
  }

  const claims = auth.getCurrentClaims();
  const isAdmin = claims?.['custom:role'] === 'admin';

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
        <button class="profile-tellmore-btn" id="modelBtn">
          <span class="tellmore-icon">\u{1FAB4}</span>
          <span class="tellmore-text">
            <strong>How we understand you</strong>
            <small>See and correct what we've picked up</small>
          </span>
          <span class="persona-arrow" id="modelArrow">↓</span>
        </button>
        <div class="model-panel" id="modelPanel" hidden></div>
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

      ${isAdmin ? `
      <div class="profile-section">
        <button class="profile-tellmore-btn" id="adminLinkBtn">
          <span class="tellmore-icon">\u{1F6E0}</span>
          <span class="tellmore-text">
            <strong>Admin · workshop</strong>
            <small>Time controls and notify list</small>
          </span>
          <span class="persona-arrow">→</span>
        </button>
      </div>
      ` : ''}

      <div class="profile-section">
        <button class="profile-signout-btn" id="signoutBtn">Sign out</button>
      </div>

      <div class="profile-section" id="deleteSection">
        <button class="profile-danger-btn" id="deleteBtn">Delete my account</button>
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

  // Admin link (only present for admins)
  if (isAdmin) {
    document.getElementById('adminLinkBtn').addEventListener('click', () => {
      navigate('admin');
    });
  }

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

  // How we understand you (D59) — lazy-loaded, inline corrections.
  const modelPanel = document.getElementById('modelPanel');
  document.getElementById('modelBtn').addEventListener('click', async () => {
    const opening = modelPanel.hidden;
    modelPanel.hidden = !opening;
    document.getElementById('modelArrow').textContent = opening ? '↑' : '↓';
    if (opening) await loadModelPanel(modelPanel);
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

  // Sign out — clear Cognito tokens + local active user, then home.
  document.getElementById('signoutBtn').addEventListener('click', () => {
    auth.signOut();
    store.clearActiveUser();
    window.location.href = 'index.html';
  });

  // Delete my account — in-place confirmation, no modal/alert.
  const deleteSection = document.getElementById('deleteSection');
  document.getElementById('deleteBtn').addEventListener('click', () => {
    deleteSection.innerHTML = `
      <p class="profile-danger-warning">
        This will permanently delete your account, your profile, and the
        personal information in your event history. There's no undo.
      </p>
      <div class="profile-danger-actions">
        <button class="profile-danger-btn" id="deleteConfirmBtn">Yes, delete</button>
        <button class="btn-small" id="deleteCancelBtn">Cancel</button>
      </div>
    `;

    document.getElementById('deleteCancelBtn').addEventListener('click', () => {
      renderProfile();
    });

    document.getElementById('deleteConfirmBtn').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = 'Deleting…';
      await handleAccountDelete({
        confirmed: true,
        commands,
        signOut: () => {
          auth.signOut();
          store.clearActiveUser();
        },
        showToast,
        onDeleted: () => { window.location.href = 'index.html'; },
      });
      // If we returned without redirecting, the API call failed — restore UI.
      const stillHere = document.getElementById('deleteConfirmBtn');
      if (stillHere) {
        stillHere.disabled = false;
        stillHere.textContent = 'Yes, delete';
      }
    });
  });
}

// ─── "How we understand you" panel (D59) ───

async function loadModelPanel(panel) {
  panel.innerHTML = '<p class="model-note">One moment…</p>';
  const model = await handleModelLoad({ commands, showToast });
  if (model === undefined) {
    panel.innerHTML = '<p class="model-note">Couldn’t load this right now.</p>';
    return;
  }
  if (model === null) {
    panel.innerHTML = '<p class="model-note">Nothing here yet — this fills in after your welcome conversation.</p>';
    return;
  }
  renderModelPanel(panel, model);
}

function renderModelPanel(panel, model) {
  const rows = envelopeRows(model.envelope ?? {});
  const chips = chipLists(model);

  const chipSection = (title, items, emptyHint) => `
    <div class="model-group">
      <div class="model-group-title">${title}</div>
      <div class="model-chips">
        ${items.map((c, i) => `
          <span class="model-chip">
            ${escapeHtml(c.label)}${c.easing ? ' <em>(easing)</em>' : ''}
            ${c.removable ? `<button class="model-chip-x" data-chip="${title}" data-index="${i}" aria-label="Remove ${escapeHtml(c.label)}">×</button>` : ''}
          </span>
        `).join('')}
        ${items.length === 0 ? `<span class="model-note">${emptyHint}</span>` : ''}
      </div>
    </div>
  `;

  panel.innerHTML = `
    <p class="model-note">
      This is what we’ve picked up so far — it only shapes the order of
      your suggestions, never what you can see or join. Tap anything that’s
      off; your word wins.
    </p>
    ${rows.map((row) => `
      <div class="model-dim" data-dimension="${row.dimension}">
        <div class="model-dim-head">
          <span class="model-dim-title">${row.title}</span>
          ${row.source ? `<span class="model-source">${escapeHtml(row.source)}</span>` : ''}
        </div>
        <div class="model-positions">
          ${row.positionChoices.map((choice) => `
            <button class="model-pos-btn ${choice.value === row.position ? 'selected' : ''}"
              data-dimension="${row.dimension}" data-position="${choice.value}">
              ${choice.label}
            </button>
          `).join('')}
        </div>
        ${row.edgeLabel ? `<div class="model-note">Stretching toward: ${row.edgeLabel}</div>` : ''}
        ${row.story ? `<div class="model-story">“${escapeHtml(row.story)}”</div>` : ''}
      </div>
    `).join('')}
    ${chipSection('Interests', chips.interests, 'None yet')}
    ${chipSection('What opens the door', chips.doors, 'None yet')}
    ${chipSection('What you bring', chips.strengths, 'None yet')}
    ${chipSection('What gets in the way', chips.barriers, 'Nothing — great')}
    <div class="model-add">
      <input class="profile-field-input" id="modelAddInterest" type="text"
        placeholder="Add an interest…" maxlength="60">
      <button class="btn-small" id="modelAddBtn">Add</button>
    </div>
  `;

  const reload = () => loadModelPanel(panel);

  panel.querySelectorAll('.model-pos-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleCorrection({
      commands,
      correction: {
        type: 'envelope',
        dimension: btn.dataset.dimension,
        position: btn.dataset.position,
      },
      showToast,
      onDone: reload,
    }));
  });

  const chipItems = { Interests: chips.interests, 'What gets in the way': chips.barriers };
  panel.querySelectorAll('.model-chip-x').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = chipItems[btn.dataset.chip]?.[Number(btn.dataset.index)];
      if (!item) return;
      handleCorrection({ commands, correction: item.correction, showToast, onDone: reload });
    });
  });

  document.getElementById('modelAddBtn').addEventListener('click', () => {
    const input = document.getElementById('modelAddInterest');
    const tag = input.value.trim();
    if (!tag) return;
    handleCorrection({
      commands,
      correction: { type: 'interest-add', tag },
      showToast,
      onDone: reload,
    });
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
