// Real-event detail screen (read-only in slice 2).
//
// Reads the full event list and shows the single matching event. Action
// buttons (interest / confirm / suggestions) land in later slices. The
// detail page for mock prototype events still lives at #detail/:id —
// this one is at #event/:id so the two coexist until the mock catalog
// is removed in slice 8.

import { commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleInteraction } from './interaction-handlers.js';

export async function renderEventDetail(eventId) {
  const container = document.getElementById('screen-event');
  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-header-top">
        <button class="detail-back" id="eventBack">← Back</button>
      </div>
      <div class="profile-header-title">Event</div>
    </div>
    <div class="profile-body">
      <div class="event-detail-loading">Loading…</div>
    </div>
  `;

  document.getElementById('eventBack').addEventListener('click', () => navigate('feed'));

  let event;
  try {
    const { events } = await commands.listEvents();
    event = events.find((e) => e.eventId === eventId);
  } catch (err) {
    container.querySelector('.event-detail-loading').textContent =
      err?.message || 'Could not load this event.';
    return;
  }

  if (!event) {
    container.querySelector('.event-detail-loading').textContent = 'This event isn’t available.';
    return;
  }

  const start = formatDateRange(event.startTime, event.endTime);
  const lifecycleLabel = LIFECYCLE_LABELS[event.lifecycleState] || event.lifecycleState;
  const sourceLabel = SOURCE_LABELS[event.source] || event.source;

  container.querySelector('.profile-body').innerHTML = `
    <div class="event-card-large">
      <div class="event-card-meta">
        <span class="event-state event-state-${event.lifecycleState}">${escapeHtml(lifecycleLabel)}</span>
        <span class="event-source">${escapeHtml(sourceLabel)}</span>
      </div>
      <h2 class="event-title">${escapeHtml(event.title)}</h2>
      ${event.description ? `<p class="event-description">${escapeHtml(event.description)}</p>` : ''}

      <div class="event-facts">
        <div class="event-fact">
          <span class="event-fact-label">When</span>
          <span class="event-fact-value">${escapeHtml(start)}</span>
        </div>
        <div class="event-fact">
          <span class="event-fact-label">Where</span>
          <span class="event-fact-value">${escapeHtml(event.location)}</span>
        </div>
        <div class="event-fact">
          <span class="event-fact-label">Organizer</span>
          <span class="event-fact-value">${escapeHtml(event.organizerName)}</span>
        </div>
        ${event.minimumAttendance > 3 ? `
        <div class="event-fact">
          <span class="event-fact-label">Needs at least</span>
          <span class="event-fact-value">${event.minimumAttendance} people (including the organizer)</span>
        </div>
        ` : ''}
      </div>

      <div class="event-counts">
        <span class="event-count"><strong>${event.interestCount ?? 0}</strong> interested</span>
        <span class="event-count"><strong>${event.confirmedCount ?? 0}</strong> confirmed</span>
      </div>

      <div class="event-actions" id="eventActions">
        ${renderInteractionButtons(event.myLevel)}
      </div>
    </div>
  `;

  bindInteractionButtons(container, event.eventId, event.myLevel);
}

function renderInteractionButtons(myLevel) {
  if (myLevel === 'confirmed') {
    return `
      <div class="event-action-status">✓ You're confirmed</div>
      <div class="event-action-row">
        <button class="btn-secondary" data-action="interested">Just interested instead</button>
        <button class="btn-outline-rust" data-action="withdraw">I can't make it</button>
      </div>
    `;
  }
  if (myLevel === 'interested') {
    return `
      <div class="event-action-status">✓ You're interested</div>
      <div class="event-action-row">
        <button class="btn-primary" data-action="confirmed">I'll be there</button>
        <button class="btn-outline-rust" data-action="withdraw">Not anymore</button>
      </div>
    `;
  }
  return `
    <div class="event-action-row">
      <button class="btn-secondary" data-action="interested">I'm interested</button>
      <button class="btn-primary" data-action="confirmed">I'll be there</button>
    </div>
  `;
}

function bindInteractionButtons(container, eventId, currentLevel) {
  const actions = container.querySelector('#eventActions');
  if (!actions) return;
  actions.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const desired = btn.dataset.action;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await handleInteraction({
          desired,
          currentLevel,
          eventId,
          commands,
          showToast,
          onSuccess: () => {
            const verb = desired === 'withdraw' ? 'Withdrawn' : desired === 'confirmed' ? 'Confirmed' : 'Interested';
            showToast(`${verb} ✓`);
            renderEventDetail(eventId);
          },
        });
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

const LIFECYCLE_LABELS = {
  proposed: 'Proposed',
  planned: 'Planned',
  'in-progress': 'Happening now',
  over: 'Over',
  cancelled: 'Cancelled',
  upcoming: 'Upcoming',
};

const SOURCE_LABELS = {
  community: 'Community',
  external: 'Listed locally',
  platform: 'IRL pick',
};

function formatDateRange(startIso, endIso) {
  if (!startIso) return '—';
  const start = new Date(startIso);
  const startStr = start.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
  if (!endIso) return startStr;
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  const endStr = end.toLocaleString(undefined, sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${startStr} — ${endStr}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
