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

const LIFECYCLE_LABELS = {
  proposed: 'Proposed',
  planned: 'Planned',
  'in-progress': 'Happening now',
  over: 'Over',
  cancelled: 'Cancelled',
  upcoming: 'Upcoming',
};

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
          <div class="feed-title">${greeting},<br>${escapeHtml(user.name)}.</div>
          <div class="feed-location">\u{1F4CD} Bainbridge Island</div>
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
        <span>Propose something</span>
      </button>
    </div>
    <div class="cards-scroll" id="cardsScroll">
      <div class="feed-loading">Loading…</div>
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
        <p>Couldn't load events.</p>
        <p class="feed-empty-sub">${escapeHtml(err?.message || 'Try again in a moment.')}</p>
      </div>
    `;
    return;
  }

  const scroll = document.getElementById('cardsScroll');
  const events = data.events ?? [];

  if (events.length === 0) {
    scroll.innerHTML = `
      <div class="feed-empty">
        <p>Nothing proposed yet.</p>
        <p class="feed-empty-sub">Be the first to put something out there.</p>
        <button class="btn-primary feed-empty-cta" id="proposeBtnEmpty">Propose something</button>
      </div>
    `;
    document.getElementById('proposeBtnEmpty').addEventListener('click', () => navigate('propose'));
    return;
  }

  scroll.innerHTML = events.map(renderCard).join('');
  scroll.querySelectorAll('[data-event-id]').forEach((el) => {
    el.addEventListener('click', () => navigate('event', el.dataset.eventId));
  });
}

function renderCard(event) {
  const cardStyle = getAltSelection('feed-card-style');
  const cardClass = cardStyle === 'accent-left' ? 'accent-left' : cardStyle === 'no-accent' ? 'no-accent' : '';
  const effective = event.effectiveState || event.lifecycleState;
  const lifecycleLabel = LIFECYCLE_LABELS[effective] || effective;
  const accent = ACCENT_FOR_LIFECYCLE[effective] || 'sage';
  const when = formatWhen(event.startTime);

  const accentHtml = `<div class="card-accent ${accent}"></div>`;
  const interestSummary = (event.interestCount ?? 0) + (event.confirmedCount ?? 0) === 0
    ? 'No-one in yet'
    : `${event.confirmedCount ?? 0} confirmed · ${event.interestCount ?? 0} interested`;

  const myLevelBadge = event.myLevel === 'confirmed'
    ? `<span class="card-mylevel mylevel-confirmed">✓ You're confirmed</span>`
    : event.myLevel === 'interested'
      ? `<span class="card-mylevel mylevel-interested">★ You're interested</span>`
      : '';

  const bodyHtml = `
    <div class="card-body">
      <div class="card-meta">
        <div class="card-type">${escapeHtml(lifecycleLabel)}</div>
        <div class="card-going">${escapeHtml(interestSummary)}</div>
      </div>
      <div class="card-title">${escapeHtml(event.title)}</div>
      <div class="card-details">
        <span>\u{1F4C5} ${escapeHtml(when)}</span>
        <span>\u{1F4CD} ${escapeHtml(event.location)}</span>
      </div>
      <div class="card-organizer">by ${escapeHtml(event.organizerName)}</div>
      ${myLevelBadge}
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
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
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
