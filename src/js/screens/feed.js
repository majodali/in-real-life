// ─── Feed screen ───
//
// Reads real events from the backend (GET /events) and renders them as
// cards. Tap card → event-detail. Cards are read-only in slice 2 — interest
// / confirm actions land in slice 3. The mock catalog and localStorage RSVP
// layer they relied on are no longer used here; the prototype #detail and
// #debrief routes still work standalone for now until slice 8 retires them.

import * as store from '../store.js';
import { navigate, showToast } from '../app.js';
import { getAltSelection } from '../alternatives.js';
import { renderEllipsisButton, bindEllipsis } from '../components/ellipsis-menu.js';
import { commands } from '../services.js';
import { unseenCancellations, noticeMessage, readSeen, markSeen } from '../cancellation-notices.js';
import { sectionFeed } from './feed-sections.js';
import { t, text, date } from '../copy.js';
import { errorText } from '../errors.js';
import { lifecycleLabel } from '../lifecycle-labels.js';

export async function renderFeed() {
  const user = store.getActiveUser();
  if (!user) return;

  const container = document.getElementById('screen-feed');
  const greeting = getGreeting();
  const headerStyle = getAltSelection('feed-header-style');

  container.innerHTML = `
    <div class="status-bar" style="${headerStyle === 'dark' ? 'background:var(--earth); color:var(--sage)' : ''}">
      <span>9:41</span><span>●●●</span>
    </div>
    <div class="feed-header ${headerStyle === 'light' ? 'light' : ''}">
      <div class="feed-top">
        <div>
          <div class="feed-title">${t(greeting, { name: user.name, br: () => '<br>' })}</div>
          <div class="feed-location">${t('feed.community')}</div>
        </div>
        <div class="feed-header-actions">
          <button class="feed-avatar-btn" id="avatarLink">
            <span class="feed-avatar">${escapeHtml(user.avatar || user.name[0])}</span>
          </button>
          ${renderEllipsisButton()}
        </div>
      </div>
      <button class="feed-propose-btn" id="proposeBtn">
        <span class="feed-propose-plus">+</span>
        <span>${t('feed.propose')}</span>
      </button>
    </div>
    <div class="cards-scroll" id="cardsScroll">
      <div class="feed-loading">${t('common.loading')}</div>
    </div>
  `;

  document.getElementById('avatarLink').addEventListener('click', () => navigate('profile'));
  document.getElementById('proposeBtn').addEventListener('click', () => navigate('propose'));
  bindEllipsis(container, 'feed', () => renderFeed());

  let data;
  try {
    data = await commands.listEvents();
  } catch (err) {
    document.getElementById('cardsScroll').innerHTML = `
      <div class="feed-empty">
        <p>${t('feed.loadFailed')}</p>
        <p class="feed-empty-sub">${escapeHtml(errorText(err, 'feed.tryAgain'))}</p>
      </div>
    `;
    return;
  }

  const scroll = document.getElementById('cardsScroll');
  const events = data.events ?? [];

  if (events.length === 0) {
    scroll.innerHTML = `
      <div class="feed-empty">
        <p>${t('feed.empty.title')}</p>
        <p class="feed-empty-sub">${t('feed.empty.sub')}</p>
        <button class="btn-primary feed-empty-cta" id="proposeBtnEmpty">${t('feed.propose')}</button>
      </div>
    `;
    document.getElementById('proposeBtnEmpty').addEventListener('click', () => navigate('propose'));
    return;
  }

  // One-time in-app notice for cancellations that touch this member.
  const fresh = unseenCancellations(events, readSeen(localStorage));
  if (fresh.length) {
    showToast(noticeMessage(fresh));
    markSeen(localStorage, fresh.map((e) => e.eventId));
  }

  // Ranking v1 (docs/matching-spec.md): the server sends an ordered
  // recommendations list — sections render plans first, then suggestions
  // in ranked order, then the remaining calendar in time order.
  const { plans, suggested, rest } = sectionFeed(events, data.recommendations);
  const section = (label, list) => (list.length
    ? `<div class="feed-section-label">${label}</div>${list.map(renderCard).join('')}`
    : '');
  scroll.innerHTML = (plans.length || suggested.length)
    ? section(t('feed.section.plans'), plans)
      + section(t('feed.section.suggested'), suggested)
      + section(t('feed.section.rest'), rest)
    : events.map(renderCard).join('');
  scroll.querySelectorAll('[data-event-id]').forEach((el) => {
    el.addEventListener('click', () => navigate('event', el.dataset.eventId));
  });
}

function renderCard(event) {
  const cardStyle = getAltSelection('feed-card-style');
  const cardClass = cardStyle === 'accent-left' ? 'accent-left' : cardStyle === 'no-accent' ? 'no-accent' : '';
  const effective = event.effectiveState || event.lifecycleState;
  const stateLabel = lifecycleLabel(effective);
  const accent = ACCENT_FOR_LIFECYCLE[effective] || 'sage';
  const when = event.startTime ? formatWhen(event.startTime) : text('feed.card.timeTbd');

  const accentHtml = `<div class="card-accent ${accent}"></div>`;
  const interestSummary = (event.interestCount ?? 0) + (event.confirmedCount ?? 0) === 0
    ? text('feed.card.nobody')
    : text('feed.card.counts', { confirmed: event.confirmedCount ?? 0, interested: event.interestCount ?? 0 });

  const myLevelBadge = event.myLevel === 'confirmed'
    ? `<span class="card-mylevel mylevel-confirmed">${t('feed.card.confirmed')}</span>`
    : event.myLevel === 'interested'
      ? `<span class="card-mylevel mylevel-interested">${t('feed.card.interested')}</span>`
      : '';
  const conflictBadge = event.conflictsWith?.length
    ? `<span class="card-mylevel mylevel-conflict">${t('feed.card.conflict')}</span>`
    : '';
  const fullBadge = event.full && event.myLevel !== 'confirmed'
    ? `<span class="card-mylevel mylevel-full">${t('feed.card.full')}</span>`
    : '';
  const cancelledOnMe = effective === 'cancelled' && event.myLevel
    ? `<span class="card-mylevel mylevel-cancelled-on-me">${t('feed.card.cancelledOnMe')}</span>`
    : '';

  const bodyHtml = `
    <div class="card-body">
      <div class="card-meta">
        <div class="card-type">${escapeHtml(stateLabel)}</div>
        <div class="card-going">${escapeHtml(interestSummary)}</div>
      </div>
      <div class="card-title">${escapeHtml(event.title)}</div>
      <div class="card-details">
        <span>\u{1F4C5} ${escapeHtml(when)}</span>
        <span>\u{1F4CD} ${escapeHtml(event.location ?? text('feed.card.placeTbd'))}</span>
      </div>
      <div class="card-organizer">${t(event.source === 'external' ? 'feed.card.listedBy' : 'feed.card.by', { name: event.organizerName })}</div>
      ${myLevelBadge}${conflictBadge}${fullBadge}${cancelledOnMe}
    </div>
  `;

  if (cardStyle === 'accent-left') {
    return `
      <div class="event-card ${cardClass}" data-event-id="${escapeAttr(event.eventId)}">
        ${accentHtml}
        <div class="card-inner">${bodyHtml}</div>
      </div>
    `;
  }

  return `
    <div class="event-card ${cardClass}" data-event-id="${escapeAttr(event.eventId)}">
      ${accentHtml}
      ${bodyHtml}
    </div>
  `;
}

const ACCENT_FOR_LIFECYCLE = {
  idea: 'amber',
  proposed: 'amber',
  planned: 'sage',
  'in-progress': 'rust',
  over: 'mist',
  cancelled: 'mist',
  upcoming: 'sage',
};

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return date(d, 'eventStart');
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'feed.greeting.morning';
  if (hour < 17) return 'feed.greeting.afternoon';
  return 'feed.greeting.evening';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Suppress unused-import warning while the prototype migration is in flight.
// showToast will return when slice 3 wires interest/confirm.
void showToast;
