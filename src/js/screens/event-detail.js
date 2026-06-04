// Real-event detail screen.
//
// Reads the events list and shows the single matching event. Renders:
//   - Lifecycle pill (uses effectiveState, which factors in workshop time)
//   - Interaction buttons (interested / confirmed / withdraw) — hidden
//     once the event is cancelled or over
//   - Organizer controls (schedule / cancel / auto-plan toggle) — only
//     shown to the organizer, with affordances appropriate to state

import * as store from '../store.js';
import { commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleInteraction } from './interaction-handlers.js';
import { renderSuggestionsSection } from './event-suggestions.js';
import { renderPollsSection } from './event-polls.js';

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

  const me = store.getActiveUser();
  const iAmOrganizer = me && me.id === event.organizerId;
  const start = formatDateRange(event.startTime, event.endTime);
  const effective = event.effectiveState || event.lifecycleState;
  const lifecycleLabel = LIFECYCLE_LABELS[effective] || effective;
  const sourceLabel = SOURCE_LABELS[event.source] || event.source;
  const showInteractionButtons = effective !== 'cancelled' && effective !== 'over';

  container.querySelector('.profile-body').innerHTML = `
    <div class="event-card-large">
      <div class="event-card-meta">
        <span class="event-state event-state-${effective}">${escapeHtml(lifecycleLabel)}</span>
        <span class="event-source">${escapeHtml(sourceLabel)}</span>
        ${event.lastEditedAt ? `<span class="event-edited" title="${escapeHtml(new Date(event.lastEditedAt).toLocaleString())}">edited</span>` : ''}
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
        ${event.lifecycleState === 'cancelled' && event.cancellationReason ? `
        <div class="event-fact">
          <span class="event-fact-label">Cancelled because</span>
          <span class="event-fact-value">${escapeHtml(event.cancellationReason)}</span>
        </div>
        ` : ''}
      </div>

      <div class="event-counts">
        <span class="event-count"><strong>${event.interestCount ?? 0}</strong> interested</span>
        <span class="event-count"><strong>${event.confirmedCount ?? 0}</strong> confirmed</span>
      </div>

      ${showInteractionButtons ? `
        <div class="event-actions" id="eventActions">
          ${renderInteractionButtons(event.myLevel)}
        </div>
      ` : ''}

      ${iAmOrganizer ? renderOrganizerControls(event) : ''}

      ${event.lifecycleState === 'proposed' || event.lifecycleState === 'planned' ? `
        <div class="event-suggestions" id="suggestionsSection"></div>
      ` : ''}
      ${event.lifecycleState === 'proposed' ? `
        <div class="event-suggestions" id="pollsSection"></div>
      ` : ''}
    </div>
  `;

  if (showInteractionButtons) {
    bindInteractionButtons(container, event.eventId, event.myLevel);
  }
  if (iAmOrganizer) {
    bindOrganizerControls(container, event);
  }
  if (event.lifecycleState === 'proposed' || event.lifecycleState === 'planned') {
    renderSuggestionsSection(container, event, {
      onChange: () => renderEventDetail(eventId),
    });
  }
  if (event.lifecycleState === 'proposed') {
    renderPollsSection(container, event, {
      onChange: () => renderEventDetail(eventId),
    });
  }
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

function renderOrganizerControls(event) {
  const effective = event.effectiveState || event.lifecycleState;
  if (effective === 'cancelled' || effective === 'over') return '';

  const min = event.minimumAttendance ?? 3;
  // The organizer counts as implicit +1 (they proposed it). Threshold met
  // when confirmedCount + 1 >= min.
  const reached = (event.confirmedCount ?? 0) + 1 >= min;
  const stored = event.lifecycleState;

  return `
    <div class="event-organizer-controls">
      <div class="organizer-controls-label">Your event</div>
      ${stored === 'proposed' ? `
        ${reached ? `
          <p class="organizer-threshold-met">✨ Threshold reached. ${event.autoPlanOnThreshold ? 'Auto-plan should have triggered — refresh to see it.' : 'Confirm this is happening when you\'re ready.'}</p>
        ` : ''}
        <button class="btn-primary" data-organizer-action="schedule">
          ${reached ? 'Confirm this is happening' : 'It\'s on — confirm now'}
        </button>
        <label class="organizer-toggle">
          <input type="checkbox" id="autoPlanToggle" ${event.autoPlanOnThreshold ? 'checked' : ''}>
          <span>Auto-confirm once ${min} are in (including you)</span>
        </label>
      ` : ''}
      <button class="btn-secondary" data-organizer-action="edit">Edit event</button>
      <button class="btn-outline-rust" data-organizer-action="cancel">Cancel this event</button>
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

function bindOrganizerControls(container, event) {
  const schedule = container.querySelector('[data-organizer-action="schedule"]');
  if (schedule) {
    schedule.addEventListener('click', async () => {
      const original = schedule.textContent;
      schedule.disabled = true;
      schedule.textContent = 'Saving…';
      try {
        await commands.scheduleEvent({ eventId: event.eventId });
        showToast("It's on! 🌿");
        renderEventDetail(event.eventId);
      } catch (err) {
        showToast(err?.message || 'Could not confirm. Try again.');
        schedule.disabled = false;
        schedule.textContent = original;
      }
    });
  }

  const editBtn = container.querySelector('[data-organizer-action="edit"]');
  if (editBtn) {
    editBtn.addEventListener('click', () => navigate('edit', event.eventId));
  }

  const cancelBtn = container.querySelector('[data-organizer-action="cancel"]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      promptCancel(container, event);
    });
  }

  const auto = container.querySelector('#autoPlanToggle');
  if (auto) {
    auto.addEventListener('change', async (e) => {
      const next = e.target.checked;
      auto.disabled = true;
      try {
        await commands.setAutoPlanOnThreshold({
          eventId: event.eventId, autoPlanOnThreshold: next,
        });
        renderEventDetail(event.eventId);
      } catch (err) {
        showToast(err?.message || 'Could not save that.');
        e.target.checked = !next;
      } finally {
        auto.disabled = false;
      }
    });
  }
}

function promptCancel(container, event) {
  // In-place prompt: text field + confirm/back.
  const controls = container.querySelector('.event-organizer-controls');
  if (!controls) return;
  controls.innerHTML = `
    <div class="organizer-controls-label">Cancel this event?</div>
    <p class="profile-danger-warning">Anyone interested or confirmed will see this event marked as cancelled. There's no undo.</p>
    <label class="profile-field-label" for="cancelReason">Reason (optional)</label>
    <input class="profile-field-input" id="cancelReason" maxlength="200"
           placeholder="e.g. Not enough interest this time">
    <div class="event-action-row" style="margin-top:12px;">
      <button class="btn-secondary" id="cancelAbort">Never mind</button>
      <button class="btn-outline-rust" id="cancelConfirm">Yes, cancel</button>
    </div>
  `;
  document.getElementById('cancelAbort').addEventListener('click', () => renderEventDetail(event.eventId));
  document.getElementById('cancelConfirm').addEventListener('click', async (e) => {
    const reason = document.getElementById('cancelReason').value;
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Cancelling…';
    try {
      await commands.cancelEvent({ eventId: event.eventId, reason });
      showToast('Cancelled.');
      renderEventDetail(event.eventId);
    } catch (err) {
      showToast(err?.message || 'Could not cancel.');
      renderEventDetail(event.eventId);
    }
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
