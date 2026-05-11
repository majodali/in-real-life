// ─── Feedback form component ───
//
// Bottom sheet with text input + emoji rating.
// Posts to Lambda function URL.

import { FEEDBACK_URL } from '../config.js';
import { getAltSnapshot } from '../alternatives.js';
import { getActiveUserId } from '../store.js';

const RATINGS = [
  { emoji: '\u{1F61F}', label: 'Poor', value: 1 },
  { emoji: '\u{1F610}', label: 'Okay', value: 2 },
  { emoji: '\u{1F642}', label: 'Good', value: 3 },
  { emoji: '\u{1F60A}', label: 'Great', value: 4 },
  { emoji: '\u{1F929}', label: 'Love it', value: 5 },
];

export function openFeedbackForm(screen) {
  closeFeedbackForm();

  const overlay = document.createElement('div');
  overlay.className = 'feedback-overlay active';
  overlay.id = 'feedbackOverlay';

  overlay.innerHTML = `
    <div class="feedback-sheet">
      <div class="modal-handle"></div>
      <div class="feedback-title">\u{1F4AC} Share your thoughts</div>

      <textarea
        class="feedback-textarea"
        id="feedbackText"
        placeholder="What\u2019s on your mind? Anything about this screen, the app, or ideas for improvement..."
        rows="4"
      ></textarea>

      <div class="feedback-rating-section">
        <div class="feedback-rating-label">How\u2019s the experience?</div>
        <div class="feedback-rating-row" id="feedbackRating">
          ${RATINGS.map(r => `
            <button class="feedback-rating-btn" data-rating="${r.value}" title="${r.label}">
              ${r.emoji}
            </button>
          `).join('')}
        </div>
      </div>

      <button class="btn-primary feedback-submit" id="feedbackSubmit">Send feedback</button>
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
    const text = document.getElementById('feedbackText').value.trim();
    const status = document.getElementById('feedbackStatus');
    const submitBtn = document.getElementById('feedbackSubmit');

    if (!text && !selectedRating) {
      status.textContent = 'Please share some feedback or select a rating.';
      status.className = 'feedback-status error';
      return;
    }

    const altSnapshot = getAltSnapshot();

    const payload = {
      timestamp: new Date().toISOString(),
      screen,
      userId: getActiveUserId() || 'anonymous',
      rating: selectedRating || null,
      text: text || '',
      alternatives: altSnapshot.selections,
      votes: altSnapshot.votes,
      userAgent: navigator.userAgent,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      if (!FEEDBACK_URL) {
        // Stub mode — just log it
        console.log('[Feedback stub]', payload);
        status.textContent = 'Thanks! (Feedback logged locally \u2014 backend not connected yet)';
        status.className = 'feedback-status success';
      } else {
        const res = await fetch(FEEDBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          status.textContent = 'Thanks for your feedback! \u{1F33F}';
          status.className = 'feedback-status success';
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      }

      setTimeout(() => closeFeedbackForm(), 1500);
    } catch (err) {
      console.error('Feedback submit error:', err);
      status.textContent = 'Could not send \u2014 please try again.';
      status.className = 'feedback-status error';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send feedback';
    }
  });

  // Focus textarea
  setTimeout(() => document.getElementById('feedbackText')?.focus(), 200);
}

function closeFeedbackForm() {
  const existing = document.getElementById('feedbackOverlay');
  if (existing) existing.remove();
}
