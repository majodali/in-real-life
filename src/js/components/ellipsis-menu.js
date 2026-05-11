// ─── Ellipsis menu component ───
//
// Renders a ⋯ button and a bottom-sheet menu with:
// - Content alternatives for the current screen
// - "Give feedback" button
//
// Usage:
//   import { renderEllipsisButton, openEllipsisMenu } from './components/ellipsis-menu.js';
//   // Add button HTML to header: renderEllipsisButton()
//   // Bind click: openEllipsisMenu('feed', onRerender)

import { getAlternativesForScreen, getAltSelectedId, setAltSelection, voteAlt, getAltVote } from '../alternatives.js';
import { openFeedbackForm } from './feedback-form.js';

export function renderEllipsisButton() {
  return '<button class="ellipsis-btn" data-ellipsis>\u22EF</button>';
}

export function openEllipsisMenu(screen, onRerender) {
  // Remove existing menu if open
  closeMenu();

  const alternatives = getAlternativesForScreen(screen);

  const overlay = document.createElement('div');
  overlay.className = 'ellipsis-overlay active';
  overlay.id = 'ellipsisOverlay';

  let altHtml = '';
  if (alternatives.length > 0) {
    altHtml = alternatives.map(alt => {
      const selectedId = getAltSelectedId(alt.id);
      const votedId = getAltVote(alt.id);

      return `
        <div class="alt-group">
          <div class="alt-group-label">${alt.label}</div>
          ${alt.options.map(opt => `
            <label class="alt-option ${opt.id === selectedId ? 'selected' : ''}">
              <span class="alt-radio">${opt.id === selectedId ? '\u25CF' : '\u25CB'}</span>
              <span class="alt-option-label">${opt.label}</span>
              ${opt.id === selectedId ? `
                <button class="alt-vote-btn ${opt.id === votedId ? 'voted' : ''}" data-vote-alt="${alt.id}" data-vote-opt="${opt.id}">
                  ${opt.id === votedId ? '\u2764\uFE0F' : '\u{1F44D}'}
                </button>
              ` : ''}
              <input type="radio" name="alt-${alt.id}" value="${opt.id}" ${opt.id === selectedId ? 'checked' : ''} data-alt-id="${alt.id}" hidden>
            </label>
          `).join('')}
        </div>
      `;
    }).join('');
  }

  overlay.innerHTML = `
    <div class="ellipsis-sheet">
      <div class="modal-handle"></div>
      ${altHtml}
      <div class="alt-feedback-section">
        <button class="alt-feedback-btn" id="menuFeedbackBtn">
          \u{1F4AC} Give feedback
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on overlay tap
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeMenu();
  });

  // Alternative selection
  overlay.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.closest('.alt-option').addEventListener('click', () => {
      const altId = radio.dataset.altId;
      const optId = radio.value;
      setAltSelection(altId, optId);
      closeMenu();
      if (onRerender) onRerender();
    });
  });

  // Vote buttons
  overlay.querySelectorAll('[data-vote-alt]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const altId = btn.dataset.voteAlt;
      const optId = btn.dataset.voteOpt;
      voteAlt(altId, optId);
      btn.classList.add('voted');
      btn.textContent = '\u2764\uFE0F';
    });
  });

  // Feedback button
  document.getElementById('menuFeedbackBtn').addEventListener('click', () => {
    closeMenu();
    openFeedbackForm(screen);
  });
}

function closeMenu() {
  const existing = document.getElementById('ellipsisOverlay');
  if (existing) existing.remove();
}

export function bindEllipsis(container, screen, onRerender) {
  const btn = container.querySelector('[data-ellipsis]');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEllipsisMenu(screen, onRerender);
    });
  }
}
