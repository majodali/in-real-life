// ─── Debrief screen ───
//
// Single scroll page for basic debrief info, with optional deep dive
// using the interview card engine at the end.

import * as store from '../store.js';
import { getEvent, DEBRIEF_QUESTIONS } from '../data.js';
import { navigate, showToast } from '../app.js';
import { startInterview } from './interview.js';
import { renderEllipsisButton, bindEllipsis } from '../components/ellipsis-menu.js';

const RATINGS = [
  { emoji: '\u{1F61F}', value: 1 },
  { emoji: '\u{1F610}', value: 2 },
  { emoji: '\u{1F642}', value: 3 },
  { emoji: '\u{1F60A}', value: 4 },
  { emoji: '\u{1F929}', value: 5 },
];

const GO_AGAIN = [
  { label: 'Definitely', value: 'definitely' },
  { label: 'Maybe', value: 'maybe' },
  { label: 'Probably not', value: 'no' },
];

export function renderDebrief(eventId) {
  const event = getEvent(eventId);
  const user = store.getActiveUser();
  if (!event || !user) {
    navigate('feed');
    return;
  }

  // Check if already debriefed
  const existing = store.getDebrief(user.id, eventId);
  if (existing) {
    renderDebriefSummary(event, user, existing);
    return;
  }

  const container = document.getElementById('screen-debrief');
  let selectedRating = 0;
  let selectedGoAgain = '';
  let selectedPeople = new Set();

  container.innerHTML = `
    <div class="status-bar"><span>9:41</span><span>\u25CF\u25CF\u25CF</span></div>
    <div class="debrief-header">
      <div class="detail-header-top">
        <button class="detail-back" id="debriefBack">\u2190 Back</button>
        ${renderEllipsisButton()}
      </div>
      <div class="debrief-title">How was<br>${event.title}?</div>
    </div>
    <div class="debrief-body">

      <!-- Overall rating -->
      <div class="debrief-section">
        <div class="section-label">Overall</div>
        <div class="debrief-rating" id="debriefRating">
          ${RATINGS.map(r => `
            <button class="debrief-rating-btn" data-rating="${r.value}">${r.emoji}</button>
          `).join('')}
        </div>
      </div>

      <!-- Who did you meet -->
      <div class="debrief-section">
        <div class="section-label">Who did you meet?</div>
        <div class="debrief-people" id="debriefPeople">
          ${event.people.map(p => `
            <label class="debrief-person">
              <input type="checkbox" value="${p.name}" class="debrief-checkbox">
              <span class="debrief-person-avatar">${p.avatar}</span>
              <span class="debrief-person-name">${p.name}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Quick thoughts -->
      <div class="debrief-section">
        <div class="section-label">Quick thoughts</div>
        <textarea
          class="debrief-textarea"
          id="debriefNote"
          placeholder="Anything you want to share about the experience..."
          rows="3"
        ></textarea>
      </div>

      <!-- Would you go again -->
      <div class="debrief-section">
        <div class="section-label">Would you go again?</div>
        <div class="debrief-goagain" id="debriefGoAgain">
          ${GO_AGAIN.map(g => `
            <button class="debrief-goagain-btn" data-value="${g.value}">${g.label}</button>
          `).join('')}
        </div>
      </div>

      <!-- Save -->
      <button class="btn-primary" id="debriefSave">Save</button>

      <!-- Deep dive prompt -->
      <div class="debrief-deepdive">
        <button class="profile-tellmore-btn" id="deepDiveBtn">
          <span class="tellmore-icon">\u{1F4AC}</span>
          <span class="tellmore-text">
            <strong>Want to share more?</strong>
            <small>A few questions about your experience</small>
          </span>
          <span class="persona-arrow">\u2192</span>
        </button>
      </div>

    </div>
  `;

  // Ellipsis
  bindEllipsis(container, 'debrief', () => renderDebrief(eventId));

  // Back
  document.getElementById('debriefBack').addEventListener('click', () => {
    navigate('detail', eventId);
  });

  // Rating
  document.getElementById('debriefRating').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rating]');
    if (!btn) return;
    selectedRating = parseInt(btn.dataset.rating);
    container.querySelectorAll('.debrief-rating-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // People checkboxes
  document.getElementById('debriefPeople').addEventListener('change', (e) => {
    if (e.target.classList.contains('debrief-checkbox')) {
      if (e.target.checked) {
        selectedPeople.add(e.target.value);
      } else {
        selectedPeople.delete(e.target.value);
      }
    }
  });

  // Go again
  document.getElementById('debriefGoAgain').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (!btn) return;
    selectedGoAgain = btn.dataset.value;
    container.querySelectorAll('.debrief-goagain-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // Save
  document.getElementById('debriefSave').addEventListener('click', () => {
    const note = document.getElementById('debriefNote').value.trim();

    if (!selectedRating && !note && !selectedGoAgain) {
      showToast('Please share at least a rating or thought');
      return;
    }

    store.saveDebrief(user.id, eventId, {
      rating: selectedRating,
      peopleMet: [...selectedPeople],
      note,
      goAgain: selectedGoAgain,
      interviewResponses: [],
    });

    // Also mark as attended if not already
    if (!store.isAttended(user.id, eventId)) {
      store.markAttended(user.id, eventId);
    }

    showToast('Thanks for sharing! \u{1F33F}');
    navigate('feed');
  });

  // Deep dive
  document.getElementById('deepDiveBtn').addEventListener('click', () => {
    // Save basic debrief first
    const note = document.getElementById('debriefNote').value.trim();
    const basicDebrief = {
      rating: selectedRating,
      peopleMet: [...selectedPeople],
      note,
      goAgain: selectedGoAgain,
      interviewResponses: [],
    };

    // Switch to interview cards
    container.innerHTML = '';
    startInterview(container, {
      questions: DEBRIEF_QUESTIONS,
      existingName: user.name,
      showProgress: true,
      onComplete: (responses) => {
        basicDebrief.interviewResponses = responses;
        store.saveDebrief(user.id, eventId, basicDebrief);
        if (!store.isAttended(user.id, eventId)) {
          store.markAttended(user.id, eventId);
        }
        showToast('Thanks for the detailed feedback! \u{1F33F}');
        navigate('feed');
      },
      onCancel: () => {
        // Save basic debrief without deep dive
        store.saveDebrief(user.id, eventId, basicDebrief);
        if (!store.isAttended(user.id, eventId)) {
          store.markAttended(user.id, eventId);
        }
        showToast('Debrief saved! \u{1F33F}');
        navigate('feed');
      },
    });
  });
}

function renderDebriefSummary(event, user, debrief) {
  const container = document.getElementById('screen-debrief');
  const ratingEmoji = RATINGS.find(r => r.value === debrief.rating)?.emoji || '';

  container.innerHTML = `
    <div class="status-bar"><span>9:41</span><span>\u25CF\u25CF\u25CF</span></div>
    <div class="debrief-header">
      <div class="detail-header-top">
        <button class="detail-back" id="debriefBack">\u2190 Back</button>
        ${renderEllipsisButton()}
      </div>
      <div class="debrief-title">Your debrief<br>${event.title}</div>
    </div>
    <div class="debrief-body">
      <div class="debrief-summary-card">
        ${debrief.rating ? `<div class="summary-row"><span class="summary-label">Rating</span><span class="summary-value">${ratingEmoji}</span></div>` : ''}
        ${debrief.peopleMet?.length ? `<div class="summary-row"><span class="summary-label">Met</span><span class="summary-value">${debrief.peopleMet.join(', ')}</span></div>` : ''}
        ${debrief.note ? `<div class="summary-row"><span class="summary-label">Thoughts</span><span class="summary-value">${debrief.note}</span></div>` : ''}
        ${debrief.goAgain ? `<div class="summary-row"><span class="summary-label">Go again?</span><span class="summary-value">${debrief.goAgain}</span></div>` : ''}
      </div>
      <button class="btn-primary" id="backToFeed" style="margin-top: 16px;">Back to feed</button>
    </div>
  `;

  bindEllipsis(container, 'debrief', () => renderDebrief(event.id));

  document.getElementById('debriefBack').addEventListener('click', () => {
    navigate('detail', event.id);
  });

  document.getElementById('backToFeed').addEventListener('click', () => {
    navigate('feed');
  });
}
