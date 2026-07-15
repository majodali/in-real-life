// Edit-event screen.
//
// Pre-fills the form from the existing event, lets the organizer change
// title / description / start / end / location, sends a sparse PUT via
// commands.editEvent. Validation lives in edit-handlers.js.

import * as store from '../store.js';
import { commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleEditSubmit } from './edit-handlers.js';

export async function renderEdit(eventId) {
  const user = store.getActiveUser();
  if (!user) {
    navigate('feed');
    return;
  }

  const container = document.getElementById('screen-edit');
  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-header-top">
        <button class="detail-back" id="editBack">← Back</button>
      </div>
      <div class="profile-header-title">Edit event</div>
    </div>
    <div class="profile-body">
      <div class="event-detail-loading">Loading…</div>
    </div>
  `;

  document.getElementById('editBack').addEventListener('click', () => navigate('event', eventId));

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

  if (event.organizerId !== user.id) {
    showToast('Only the organizer can edit this event.');
    navigate('event', eventId);
    return;
  }

  if (event.lifecycleState === 'cancelled') {
    container.querySelector('.event-detail-loading').textContent = 'This event has been cancelled.';
    return;
  }

  const startLocal = toLocalDatetime(event.startTime);
  const endLocal = toLocalDatetime(event.endTime);

  container.querySelector('.profile-body').innerHTML = `
    <p class="propose-intro">
      Changes save immediately. Anyone interested or confirmed will see
      the new details next time they look.
    </p>

    <form class="propose-form" id="editForm" novalidate>
      <div class="profile-field">
        <label class="profile-field-label" for="editTitle">Title</label>
        <input class="profile-field-input" id="editTitle" type="text" maxlength="80"
               value="${escapeAttr(event.title)}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editDescription">Description <span class="auth-optional">(optional)</span></label>
        <textarea class="profile-field-input propose-textarea" id="editDescription" rows="3" maxlength="400">${escapeHtml(event.description || '')}</textarea>
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editStart">Start time</label>
        <input class="profile-field-input" id="editStart" type="datetime-local" value="${escapeAttr(startLocal)}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editEnd">End time <span class="auth-optional">(optional)</span></label>
        <input class="profile-field-input" id="editEnd" type="datetime-local" value="${escapeAttr(endLocal)}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editMeetingSpot">How to find the group (blank = none)</label>
        <input class="profile-field-input" id="editMeetingSpot" type="text" maxlength="200"
               value="${escapeAttr(event.meetingSpot ?? '')}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editCostAmount">Cost per person (blank = free)</label>
        <input class="profile-field-input" id="editCostAmount" type="number"
               inputmode="decimal" min="0" step="0.5" value="${escapeAttr(event.cost?.amount ?? '')}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editCostCovers">What does it cover?</label>
        <input class="profile-field-input" id="editCostCovers" type="text" maxlength="120"
               value="${escapeAttr(event.cost?.covers ?? '')}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editMax">Spots (blank = no cap, including you)</label>
        <input class="profile-field-input" id="editMax" type="number"
               inputmode="numeric" min="3" step="1" value="${escapeAttr(event.maxAttendance ?? '')}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editLocation">Where</label>
        <input class="profile-field-input" id="editLocation" type="text" maxlength="120"
               value="${escapeAttr(event.location)}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editShapeTags">Activity tags (comma-separated${event.shape?.source === 'extracted' ? ' — our guess, correct freely' : ''})</label>
        <input class="profile-field-input" id="editShapeTags" type="text" maxlength="220"
               value="${escapeAttr((event.shape?.activityTags ?? []).join(', '))}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editShapeStructure">How structured?</label>
        <select class="profile-field-input" id="editShapeStructure">
          <option value="">—</option>
          ${['structured', 'semi-structured', 'unstructured'].map((s) => `
            <option value="${s}" ${event.shape?.structure === s ? 'selected' : ''}>${s}</option>
          `).join('')}
        </select>
      </div>

      <div class="profile-field">
        <span class="profile-field-label">What it offers</span>
        ${[['useful', 'A way to be useful'], ['make-learn', 'Make or learn something'], ['connect', 'Time with people']].map(([door, label]) => `
          <label class="edit-door-option">
            <input type="checkbox" class="edit-door" value="${door}"
                   ${event.shape?.doors?.includes(door) ? 'checked' : ''}> ${label}
          </label>
        `).join('')}
      </div>

      <button class="btn-primary" id="editSubmit" type="submit">Save changes</button>
    </form>
  `;

  const form = document.getElementById('editForm');
  const submit = document.getElementById('editSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      await handleEditSubmit({
        current: event,
        title: document.getElementById('editTitle').value,
        description: document.getElementById('editDescription').value,
        startTime: document.getElementById('editStart').value,
        endTime: document.getElementById('editEnd').value,
        location: document.getElementById('editLocation').value,
        costAmount: document.getElementById('editCostAmount').value,
        costCovers: document.getElementById('editCostCovers').value,
        maxAttendance: document.getElementById('editMax').value,
        meetingSpot: document.getElementById('editMeetingSpot').value,
        shapeTags: document.getElementById('editShapeTags').value,
        shapeStructure: document.getElementById('editShapeStructure').value,
        shapeDoors: [...form.querySelectorAll('.edit-door:checked')].map((el) => el.value),
        commands,
        showToast,
        onSuccess: () => {
          showToast('Saved.');
          navigate('event', eventId);
        },
        onValidationError: (field) => {
          const map = {
            title: 'editTitle',
            startTime: 'editStart',
            endTime: 'editEnd',
            location: 'editLocation',
            shapeStructure: 'editShapeStructure',
          };
          const el = document.getElementById(map[field]);
          if (el) {
            el.classList.add('shake');
            setTimeout(() => el.classList.remove('shake'), 400);
            el.focus();
          }
        },
        onNoop: () => {
          showToast('Nothing to save — no changes.');
        },
      });
    } finally {
      submit.disabled = false;
      submit.textContent = 'Save changes';
    }
  });
}

// Convert an ISO datetime back to the local-clock format an
// <input type="datetime-local"> expects: "YYYY-MM-DDTHH:MM".
function toLocalDatetime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
