// ─── Feed screen ───

import * as store from '../store.js';
import { EVENTS, getEventTimeState } from '../data.js';
import { navigate, showToast } from '../app.js';
import { getAltSelection } from '../alternatives.js';
import { renderEllipsisButton, bindEllipsis } from '../components/ellipsis-menu.js';

let activeTab = 'happening';

function getGoingCount(event) {
  const allUsers = store.getUsers();
  let extra = 0;
  allUsers.forEach(u => {
    if (store.isRsvped(u.id, event.id)) extra++;
  });
  return event.baseGoing + extra;
}

function getTabKey(index) {
  return ['happening', 'possible', 'nearby'][index];
}

function renderCard(event, user) {
  const userId = user?.id;
  const rsvped = userId ? store.isRsvped(userId, event.id) : false;
  const confirmed = userId ? store.isConfirmed(userId, event.id) : false;
  const debriefed = userId ? store.hasDebriefed(userId, event.id) : false;
  const goingCount = getGoingCount(event);
  const rsvpText = getAltSelection('feed-rsvp-btn');
  const cardStyle = getAltSelection('feed-card-style');
  const timeState = getEventTimeState(event);
  const isPast = timeState === 'past';

  const cardClass = cardStyle === 'accent-left' ? 'accent-left' : cardStyle === 'no-accent' ? 'no-accent' : '';

  // Action button depends on lifecycle + time
  let actionBtn = '';
  let actionText = `${goingCount} neighbour${goingCount !== 1 ? 's' : ''} going`;

  if (isPast) {
    if (debriefed) {
      actionBtn = `<span class="btn-small active" style="cursor:default">\u2713 Debriefed</span>`;
      actionText = 'You went to this';
    } else if (confirmed || rsvped) {
      actionBtn = `<button class="btn-small" data-debrief-id="${event.id}">How was it?</button>`;
      actionText = 'Share your experience';
    } else {
      actionBtn = `<span class="card-past-label">Past event</span>`;
      actionText = 'This event has ended';
    }
  } else {
    actionBtn = `
      <button class="btn-small ${rsvped ? 'active' : ''}" data-rsvp-id="${event.id}">
        ${confirmed ? '\u2713 Confirmed' : rsvped ? '\u2713 Going' : rsvpText}
      </button>
    `;
  }

  const accentHtml = `<div class="card-accent ${event.accent}"></div>`;
  const bodyHtml = `
    <div class="card-body" data-nav="detail/${event.id}">
      <div class="card-meta">
        <div class="card-type">${event.typeLabel}${isPast ? ' \u00B7 Past' : ''}</div>
        <div class="card-going">${goingCount} ${isPast ? 'went' : 'going'}</div>
      </div>
      <div class="card-title">${event.title}</div>
      <div class="card-details">
        <span>\u{1F4C5} ${event.when}</span>
        <span>\u{1F4CD} ${event.distance}</span>
      </div>
      <div class="card-people-preview">
        ${event.people.slice(0, 3).map(p => `<span class="people-avatar-small" title="${p.name}">${p.avatar}</span>`).join('')}
        ${event.people.length > 3 ? `<span class="people-more">+${event.people.length - 3}</span>` : ''}
      </div>
    </div>
    <div class="card-action">
      <div class="card-action-text">${actionText}</div>
      ${actionBtn}
    </div>
  `;

  if (cardStyle === 'accent-left') {
    return `
      <div class="event-card ${cardClass}${isPast ? ' past' : ''}" data-event-id="${event.id}">
        ${accentHtml}
        <div class="card-inner">${bodyHtml}</div>
      </div>
    `;
  }

  return `
    <div class="event-card ${cardClass}${isPast ? ' past' : ''}" data-event-id="${event.id}">
      ${accentHtml}
      ${bodyHtml}
    </div>
  `;
}

export function renderFeed() {
  const user = store.getActiveUser();
  if (!user) return;

  const container = document.getElementById('screen-feed');
  const greeting = getGreeting();
  const tabLabels = getAltSelection('feed-tabs');
  const headerStyle = getAltSelection('feed-header-style');

  container.innerHTML = `
    <div class="status-bar" style="${headerStyle === 'dark' ? 'background:var(--earth); color:var(--sage)' : ''}">
      <span>9:41</span><span>\u25CF\u25CF\u25CF</span>
    </div>
    <div class="feed-header ${headerStyle === 'light' ? 'light' : ''}">
      <div class="feed-top">
        <div>
          <div class="feed-title">${greeting},<br>${user.name}.</div>
          <div class="feed-location">\u{1F4CD} Bainbridge Island</div>
        </div>
        <div class="feed-header-actions">
          <button class="feed-avatar-btn" id="avatarLink">
            <span class="feed-avatar">${user.avatar || user.name[0]}</span>
          </button>
          ${renderEllipsisButton()}
        </div>
      </div>
    </div>
    <div class="tab-bar">
      ${tabLabels.map((label, i) => {
        const key = getTabKey(i);
        return `<div class="tab ${activeTab === key ? 'active' : ''}" data-tab="${key}">${label}</div>`;
      }).join('')}
    </div>
    <div class="cards-scroll" id="cardsScroll">
      ${getFilteredEvents().map(e => renderCard(e, user)).join('')}
    </div>
  `;

  // Avatar → profile
  document.getElementById('avatarLink').addEventListener('click', () => navigate('profile'));

  // Ellipsis
  bindEllipsis(container, 'feed', () => renderFeed());

  // Tabs
  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      renderFeed();
    });
  });

  // RSVP clicks (upcoming only)
  container.querySelectorAll('[data-rsvp-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.rsvpId;
      const nowRsvped = store.toggleRsvp(user.id, eventId);
      showToast(nowRsvped ? "You're in! \u{1F389}" : 'Removed RSVP');
      renderFeed();
    });
  });

  // Debrief clicks (past events)
  container.querySelectorAll('[data-debrief-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.debriefId;
      const user = store.getActiveUser();
      if (!store.isAttended(user.id, eventId)) store.markAttended(user.id, eventId);
      navigate('debrief', eventId);
    });
  });

  // Card body → detail
  container.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      navigate(el.dataset.nav.split('/')[0], el.dataset.nav.split('/')[1]);
    });
  });
}

function getFilteredEvents() {
  return EVENTS.filter(e => e.tab === activeTab);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
