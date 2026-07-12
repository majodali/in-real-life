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
  let events = [];
  try {
    events = (await commands.listEvents()).events ?? [];
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
  // While the event is still open (proposed or planned) it accepts changes —
  // interest, suggestions, polls. The backend rejects all of these once the
  // event is in-progress, over, or cancelled, so the UI follows suit.
  const openForChanges = effective === 'idea' || effective === 'proposed' || effective === 'planned';
  const showInteractionButtons = openForChanges;

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
          <span class="event-fact-value">${event.startTime ? escapeHtml(start) : 'To be decided'}${event.timesApproximate ? ' <span class="event-fact-approx">(approximate)</span>' : ''}</span>
        </div>
        <div class="event-fact">
          <span class="event-fact-label">Where</span>
          <span class="event-fact-value">${event.location ? escapeHtml(event.location) : 'To be decided'}</span>
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
          ${renderInteractionButtons(event.myLevel, effective)}
        </div>
      ` : ''}

      ${renderCancelledOnMeNote(event)}
      ${renderConflictNote(event, events)}

      ${iAmOrganizer ? renderOrganizerControls(event) : ''}

      ${effective === 'over' && event.myLevel === 'confirmed' ? renderDebriefSection(event) : ''}
      ${event.myDebrief && effective === 'over' ? renderMyDebrief(event) : ''}

      ${openForChanges ? `
        <div class="event-suggestions" id="suggestionsSection"></div>
      ` : ''}
      ${effective === 'proposed' || effective === 'idea' ? `
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
  if (openForChanges) {
    renderSuggestionsSection(container, event, {
      onChange: () => renderEventDetail(eventId),
    });
  }
  if (effective === 'proposed') {
    renderPollsSection(container, event, {
      onChange: () => renderEventDetail(eventId),
    });
  }
  if (effective === 'over' && event.myLevel === 'confirmed' && !event.myDebrief) {
    bindDebriefForm(container, event);
  }
}

function renderDebriefSection(event) {
  if (event.myDebrief) return '';  // already debriefed — see renderMyDebrief
  return `
    <div class="event-debrief">
      <div class="organizer-controls-label">How was it?</div>
      <p class="suggestions-hint">A quick reflection — it shapes what we suggest you next.</p>
      <form id="debriefForm" class="debrief-form">
        <div class="debrief-rating" id="debriefRating">
          ${[1, 2, 3, 4, 5].map((n) => `
            <button type="button" class="debrief-star" data-rating="${n}">★</button>
          `).join('')}
        </div>
        <textarea class="profile-field-input suggest-textarea" id="debriefNotes"
                  rows="2" maxlength="500"
                  placeholder="One line about how it went (optional)"></textarea>
        <button type="submit" class="btn-primary" id="debriefSubmit">Save</button>
      </form>
    </div>
  `;
}

function renderMyDebrief(event) {
  const d = event.myDebrief;
  const stars = '★'.repeat(d.rating) + '☆'.repeat(5 - d.rating);
  return `
    <div class="event-debrief event-debrief-done">
      <div class="organizer-controls-label">Your reflection</div>
      <div class="debrief-saved-row">
        <span class="debrief-saved-stars">${stars}</span>
        ${d.notes ? `<span class="debrief-saved-notes">${escapeHtml(d.notes)}</span>` : ''}
      </div>
    </div>
  `;
}

function bindDebriefForm(container, event) {
  const form = container.querySelector('#debriefForm');
  if (!form) return;
  let selected = 0;
  const stars = form.querySelectorAll('[data-rating]');
  stars.forEach((btn) => {
    btn.addEventListener('click', () => {
      selected = Number(btn.dataset.rating);
      stars.forEach((s) => {
        s.classList.toggle('selected', Number(s.dataset.rating) <= selected);
      });
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (selected < 1) {
      showToast('Tap a star to rate.');
      return;
    }
    const notes = container.querySelector('#debriefNotes').value.trim();
    const submit = container.querySelector('#debriefSubmit');
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      await commands.submitDebrief({ eventId: event.eventId, rating: selected, notes });
      showToast('Saved.');
      renderEventDetail(event.eventId);
    } catch (err) {
      showToast(err?.message || 'Could not save.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Save';
    }
  });
}

// For a member who had committed to an event that then died: acknowledge
// it plainly. Their interaction row is untouched (history, not a live
// commitment); withdrawing stays available but is never required.
function renderCancelledOnMeNote(event) {
  const effective = event.effectiveState || event.lifecycleState;
  if (effective !== 'cancelled' || !event.myLevel) return '';
  const verb = event.myLevel === 'confirmed' ? "you'd said you'd be there" : 'you were interested';
  return `
    <div class="event-conflict-note">
      ✕ This one's off — ${verb}. Nothing needed from you; it stays in your
      history and the spot frees up on its own.
    </div>
  `;
}

// Standing double-confirmation note (from the list annotation, so edits
// that create an overlap later are caught too). Gentle: never a blocker.
function renderConflictNote(event, events) {
  if (!event.conflictsWith?.length) return '';
  const titles = event.conflictsWith
    .map((id) => events.find((e) => e.eventId === id)?.title)
    .filter(Boolean);
  const names = titles.length ? titles.map((t) => `“${escapeHtml(t)}”`).join(', ') : 'another event';
  return `
    <div class="event-conflict-note">
      ⚠ This overlaps with ${names}, which you're also confirmed for.
      If you can't make both, free up a spot so others can plan around you.
    </div>
  `;
}

function renderInteractionButtons(myLevel, effective) {
  // An idea has no time or place to commit to yet — interest is the
  // idea-stage currency (the backend rejects confirmation with 409).
  if (effective === 'idea') {
    if (myLevel === 'interested') {
      return `
        <div class="event-action-status">✓ You're interested</div>
        <p class="event-action-hint">Still an idea — once a time and place are set, you can commit to going.</p>
        <div class="event-action-row">
          <button class="btn-outline-rust" data-action="withdraw">Not anymore</button>
        </div>
      `;
    }
    return `
      <p class="event-action-hint">Still an idea — say you're interested and help pin down a time and place.</p>
      <div class="event-action-row">
        <button class="btn-primary" data-action="interested">I'm interested</button>
      </div>
    `;
  }
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
  const isIdea = effective === 'idea';

  return `
    <div class="event-organizer-controls">
      <div class="organizer-controls-label">Your event</div>
      ${stored === 'proposed' && isIdea ? `
        <p class="organizer-threshold-met">Set a time and place (Edit event) before confirming it's happening — until then it floats as an idea.</p>
      ` : ''}
      ${stored === 'proposed' && !isIdea ? `
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

// The impact line for the cancel dialog: the organizer should see whose
// plans they're touching before they pull the trigger.
function cancelImpactLine(event) {
  const interested = event.interestCount ?? 0;
  const confirmed = event.confirmedCount ?? 0;
  if (interested + confirmed === 0) {
    return 'No-one has committed yet, so this only removes the listing.';
  }
  const parts = [];
  if (confirmed) parts.push(`${confirmed} confirmed`);
  if (interested) parts.push(`${interested} interested`);
  return `${parts.join(' and ')} will see this marked as cancelled — IRL can't message them yet, so consider spreading the word yourself.`;
}

function promptCancel(container, event) {
  // In-place prompt: text field + confirm/back.
  const controls = container.querySelector('.event-organizer-controls');
  if (!controls) return;
  controls.innerHTML = `
    <div class="organizer-controls-label">Cancel this event?</div>
    <p class="profile-danger-warning">${cancelImpactLine(event)} There's no undo.</p>
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
  idea: 'Idea',
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
