// ─── Feedback form component ───
//
// Bottom sheet with text input + emoji rating.
// Posts to Lambda function URL.

import { FEEDBACK_URL } from '../config.js';
import { getAltSnapshot } from '../alternatives.js';
import { getActiveUserId } from '../store.js';
import { t, attr, text } from '../copy.js';

const RATINGS = [
  { emoji: '\u{1F61F}', label: 'menu.form.rating.1', value: 1 },
  { emoji: '\u{1F610}', label: 'menu.form.rating.2', value: 2 },
  { emoji: '\u{1F642}', label: 'menu.form.rating.3', value: 3 },
  { emoji: '\u{1F60A}', label: 'menu.form.rating.4', value: 4 },
  { emoji: '\u{1F929}', label: 'menu.form.rating.5', value: 5 },
];

export function openFeedbackForm(screen) {
  closeFeedbackForm();

  const overlay = document.createElement('div');
  overlay.className = 'feedback-overlay active';
  overlay.id = 'feedbackOverlay';

  overlay.innerHTML = `
    <div class="feedback-sheet">
      <div class="modal-handle"></div>
      <div class="feedback-title">${t('menu.form.title')}</div>

      <textarea
        class="feedback-textarea"
        id="feedbackText"
        placeholder="${attr('menu.form.placeholder')}"
        rows="4"
      ></textarea>

      <div class="feedback-rating-section">
        <div class="feedback-rating-label">${t('menu.form.ratingLabel')}</div>
        <div class="feedback-rating-row" id="feedbackRating">
          ${RATINGS.map(r => `
            <button class="feedback-rating-btn" data-rating="${r.value}" title="${attr(r.label)}">
              ${r.emoji}
            </button>
          `).join('')}
        </div>
      </div>

      <button class="btn-primary feedback-submit" id="feedbackSubmit">${t('menu.form.send')}</button>
      <div class="feedback-status" id="feedbackStatus"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  let selectedRating = 0;

  // Close on overlay tap
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFeedbackForm();
  });

  // Rating selection
  document.getElementById('feedbackRating').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rating]');
    if (!btn) return;
    selectedRating = parseInt(btn.dataset.rating);
    document.querySelectorAll('.feedback-rating-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // Submit
  document.getElementById('feedbackSubmit').addEventListener('click', async () => {
    const message = document.getElementById('feedbackText').value.trim();
    const status = document.getElementById('feedbackStatus');
    const submitBtn = document.getElementById('feedbackSubmit');

    if (!message && !selectedRating) {
      status.textContent = text('menu.form.empty');
      status.className = 'feedback-status error';
      return;
    }

    const altSnapshot = getAltSnapshot();

    const payload = {
      timestamp: new Date().toISOString(),
      screen,
      userId: getActiveUserId() || 'anonymous',
      rating: selectedRating || null,
      text: message || '',
      alternatives: altSnapshot.selections,
      votes: altSnapshot.votes,
      userAgent: navigator.userAgent,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = text('menu.form.sending');

    try {
      if (!FEEDBACK_URL) {
        // Stub mode — just log it
        console.log('[Feedback stub]', payload);
        status.textContent = text('menu.form.thanksLocal');
        status.className = 'feedback-status success';
      } else {
        const res = await fetch(FEEDBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          status.textContent = text('menu.form.thanks');
          status.className = 'feedback-status success';
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      }

      setTimeout(() => closeFeedbackForm(), 1500);
    } catch (err) {
      console.error('Feedback submit error:', err);
      status.textContent = text('menu.form.failed');
      status.className = 'feedback-status error';
      submitBtn.disabled = false;
      submitBtn.textContent = text('menu.form.send');
    }
  });

  // Focus textarea
  setTimeout(() => document.getElementById('feedbackText')?.focus(), 200);
}

function closeFeedbackForm() {
  const existing = document.getElementById('feedbackOverlay');
  if (existing) existing.remove();
}
