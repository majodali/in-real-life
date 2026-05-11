// ─── Detail screen ───

import * as store from '../store.js';
import { getEvent, getEventTimeState } from '../data.js';
import { navigate, showToast } from '../app.js';
import { getAltSelection } from '../alternatives.js';
import { renderEllipsisButton, bindEllipsis } from '../components/ellipsis-menu.js';

export function renderDetail(eventId) {
  const event = getEvent(eventId);
  const user = store.getActiveUser();
  if (!event || !user) {
    navigate('feed');
    return;
  }

  const confirmed = store.isConfirmed(user.id, event.id);
  const rsvped = store.isRsvped(user.id, event.id);
  const attended = store.isAttended(user.id, event.id);
  const debriefed = store.hasDebriefed(user.id, event.id);
  const confirmText = getAltSelection('detail-confirm-btn');
  const privacyMode = getAltSelection('detail-privacy');
  const timeState = getEventTimeState(event);
  const container = document.getElementById('screen-detail');

  // Build people list
  const peopleHtml = event.people.map(p => `
    <div class="match-row">
      <div class="match-avatar">${p.avatar}</div>
      <div class="match-info">
        <div class="match-name">${p.name}</div>
        <div class="match-vibe">${p.vibeMessage || ''}</div>
      </div>
      <div class="match-status">\u2713 ${p.status === 'interested' ? 'Interested' : 'In'}</div>
    </div>
  `).join('');

  // You row — status depends on lifecycle
  let yourStatus = '';
  if (debriefed) {
    yourStatus = '<div class="match-status">\u2713 Debriefed</div>';
  } else if (attended) {
    yourStatus = '<div class="match-status">\u2713 Attended</div>';
  } else if (confirmed) {
    yourStatus = '<div class="match-status">\u2713 Confirmed</div>';
  } else if (rsvped) {
    yourStatus = '<div class="match-status" style="color:var(--amber)">\u2192 Going</div>';
  } else {
    yourStatus = '<div class="match-status" style="color:var(--soft)">Not yet</div>';
  }

  // Privacy note
  let privacyHtml = '';
  if (privacyMode === 'inline') {
    privacyHtml = `<div class="privacy-note">\u{1F512} Only first names and avatars are shared. No messages, no profiles.</div>`;
  } else if (privacyMode === 'tooltip') {
    privacyHtml = `
      <button class="privacy-tooltip-trigger" id="privacyTrigger">\u2139\uFE0F How privacy works</button>
      <div class="privacy-tooltip" id="privacyTooltip">\u{1F512} Only first names and avatars are shared. No messages, no profiles.</div>
    `;
  }

  // Footer buttons depend on event time + lifecycle state
  let footerHtml = '';
  if (timeState === 'past') {
    if (debriefed) {
      footerHtml = `
        <button class="btn-full primary" id="viewDebrief">\u2713 View your debrief</button>
      `;
    } else if (attended) {
      footerHtml = `
        <button class="btn-full primary" id="startDebrief">Share how it went \u2192</button>
      `;
    } else if (confirmed || rsvped) {
      footerHtml = `
        <button class="btn-full soft" id="markAttended">I was there</button>
        <button class="btn-full primary" id="startDebrief">Share how it went \u2192</button>
      `;
    } else {
      footerHtml = `
        <button class="btn-full soft" id="backToFeed">Back to feed</button>
      `;
    }
  } else {
    // Upcoming / happening
    footerHtml = `
      <button class="btn-full soft" id="suggestBtn">Suggest change</button>
      <button class="btn-full primary" id="confirmBtn">
        ${confirmed ? '\u2713 Confirmed' : confirmText}
      </button>
    `;
  }

  container.innerHTML = `
    <div class="status-bar" style="background:var(--moss); color:var(--mist)">
      <span>9:41</span><span>\u25CF\u25CF\u25CF</span>
    </div>
    <div class="detail-header">
      <div class="detail-header-top">
        <button class="detail-back" id="detailBack">\u2190 Back</button>
        ${renderEllipsisButton()}
      </div>
      <div class="detail-title">${event.title}</div>
      <div class="detail-type">${event.typeLabel} \u00B7 ${event.when}${timeState === 'past' ? ' \u00B7 Past' : ''}</div>
    </div>
    <div class="detail-body">
      <div class="matches-section">
        <div class="section-label">People ${timeState === 'past' ? 'who went' : 'interested'}</div>
        ${peopleHtml}
        <div class="match-row">
          <div class="match-avatar">${user.avatar || user.name[0]}</div>
          <div class="match-info">
            <div class="match-name">You</div>
            <div class="match-vibe">${user.vibeMessage || ''}</div>
          </div>
          ${yourStatus}
        </div>
      </div>
      <div class="organize-box">
        <div class="organize-title">Details</div>
        <div class="detail-row"><span class="detail-key">When</span><span>${event.when}</span></div>
        <div class="detail-row"><span class="detail-key">Where</span><span>${event.where}</span></div>
        <div class="detail-row"><span class="detail-key">How long</span><span>${event.duration}</span></div>
        <div class="detail-row"><span class="detail-key">Distance</span><span>${event.distance}</span></div>
      </div>
      ${privacyHtml}
    </div>
    <div class="detail-footer">
      ${footerHtml}
    </div>
  `;

  // Ellipsis
  bindEllipsis(container, 'detail', () => renderDetail(eventId));

  // Back
  document.getElementById('detailBack').addEventListener('click', () => navigate('feed'));

  // Privacy tooltip
  const privacyTrigger = document.getElementById('privacyTrigger');
  const privacyTooltip = document.getElementById('privacyTooltip');
  if (privacyTrigger && privacyTooltip) {
    privacyTrigger.addEventListener('click', () => privacyTooltip.classList.toggle('show'));
  }

  // Upcoming event actions
  const confirmBtn = document.getElementById('confirmBtn');
  if (confirmBtn && !confirmed) {
    confirmBtn.addEventListener('click', () => {
      store.confirmEvent(user.id, event.id);
      if (!store.isRsvped(user.id, event.id)) store.toggleRsvp(user.id, event.id);
      showToast("You're confirmed! \u{1F331}");
      renderDetail(eventId);
    });
  } else if (confirmBtn) {
    confirmBtn.style.opacity = '0.6';
    confirmBtn.style.cursor = 'default';
  }

  const suggestBtn = document.getElementById('suggestBtn');
  if (suggestBtn) {
    suggestBtn.addEventListener('click', () => openSuggestModal(event));
  }

  // Past event actions
  const markAttendedBtn = document.getElementById('markAttended');
  if (markAttendedBtn) {
    markAttendedBtn.addEventListener('click', () => {
      store.markAttended(user.id, event.id);
      if (!store.isRsvped(user.id, event.id)) store.toggleRsvp(user.id, event.id);
      if (!store.isConfirmed(user.id, event.id)) store.confirmEvent(user.id, event.id);
      showToast('Marked as attended \u2713');
      renderDetail(eventId);
    });
  }

  const startDebriefBtn = document.getElementById('startDebrief');
  if (startDebriefBtn) {
    startDebriefBtn.addEventListener('click', () => {
      if (!store.isAttended(user.id, event.id)) store.markAttended(user.id, event.id);
      navigate('debrief', eventId);
    });
  }

  const viewDebriefBtn = document.getElementById('viewDebrief');
  if (viewDebriefBtn) {
    viewDebriefBtn.addEventListener('click', () => navigate('debrief', eventId));
  }

  const backToFeedBtn = document.getElementById('backToFeed');
  if (backToFeedBtn) {
    backToFeedBtn.addEventListener('click', () => navigate('feed'));
  }
}

function openSuggestModal(event) {
  const modal = document.getElementById('suggestModal');
  document.getElementById('suggestTime').textContent = event.when;
  document.getElementById('suggestPlace').textContent = event.where;
  modal.classList.add('active');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
  document.getElementById('suggestSubmit').addEventListener('click', () => {
    modal.classList.remove('active');
    showToast('Suggestion sent! \u{1F4AC}');
  }, { once: true });
}
