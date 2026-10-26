// Edit-event screen.
//
// Pre-fills the form from the existing event, lets the organizer change
// title / description / start / end / location, sends a sparse PUT via
// commands.editEvent. Validation lives in edit-handlers.js.

import * as store from '../store.js';
import { commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleEditSubmit } from './edit-handlers.js';
import { t, text } from '../copy.js';
import { errorText } from '../errors.js';

const STRUCTURE_KEYS = {
  structured: 'event.shape.structured',
  'semi-structured': 'event.shape.semiStructured',
  unstructured: 'event.shape.unstructured',
};
const DOOR_KEYS = {
  useful: 'edit.door.useful',
  'make-learn': 'edit.door.makeLearn',
  connect: 'edit.door.connect',
};

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
        <button class="detail-back" id="editBack">${t('common.back')}</button>
      </div>
      <div class="profile-header-title">${t('edit.title')}</div>
    </div>
    <div class="profile-body">
      <div class="event-detail-loading">${t('common.loading')}</div>
    </div>
  `;

  document.getElementById('editBack').addEventListener('click', () => navigate('event', eventId));

  let event;
  try {
    const { events } = await commands.listEvents();
    event = events.find((e) => e.eventId === eventId);
  } catch (err) {
    container.querySelector('.event-detail-loading').textContent =
      errorText(err, 'event.loadFailed');
    return;
  }

  if (!event) {
    container.querySelector('.event-detail-loading').textContent = text('event.unavailable');
    return;
  }

  if (event.organizerId !== user.id) {
    showToast(text('edit.onlyOrganizer'));
    navigate('event', eventId);
    return;
  }

  if (event.lifecycleState === 'cancelled') {
    container.querySelector('.event-detail-loading').textContent = text('edit.cancelled');
    return;
  }

  const startLocal = toLocalDatetime(event.startTime);
  const endLocal = toLocalDatetime(event.endTime);

  container.querySelector('.profile-body').innerHTML = `
    <p class="propose-intro">${t('edit.intro')}</p>

    <form class="propose-form" id="editForm" novalidate>
      <div class="profile-field">
        <label class="profile-field-label" for="editTitle">${t('edit.field.title')}</label>
        <input class="profile-field-input" id="editTitle" type="text" maxlength="80"
               value="${escapeAttr(event.title)}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editDescription">${t('edit.field.description', { optional: (inner) => `<span class="auth-optional">${inner}</span>` })}</label>
        <textarea class="profile-field-input propose-textarea" id="editDescription" rows="3" maxlength="400">${escapeHtml(event.description || '')}</textarea>
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editStart">${t('edit.field.start')}</label>
        <input class="profile-field-input" id="editStart" type="datetime-local" value="${escapeAttr(startLocal)}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editEnd">${t('edit.field.end', { optional: (inner) => `<span class="auth-optional">${inner}</span>` })}</label>
        <input class="profile-field-input" id="editEnd" type="datetime-local" value="${escapeAttr(endLocal)}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editMeetingSpot">${t('edit.field.findGroup')}</label>
        <input class="profile-field-input" id="editMeetingSpot" type="text" maxlength="200"
               value="${escapeAttr(event.meetingSpot ?? '')}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editCostAmount">${t('edit.field.cost')}</label>
        <input class="profile-field-input" id="editCostAmount" type="number"
               inputmode="decimal" min="0" step="0.5" value="${escapeAttr(event.cost?.amount ?? '')}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editCostCovers">${t('edit.field.covers')}</label>
        <input class="profile-field-input" id="editCostCovers" type="text" maxlength="120"
               value="${escapeAttr(event.cost?.covers ?? '')}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editMax">${t('edit.field.max')}</label>
        <input class="profile-field-input" id="editMax" type="number"
               inputmode="numeric" min="3" step="1" value="${escapeAttr(event.maxAttendance ?? '')}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editLocation">${t('edit.field.where')}</label>
        <input class="profile-field-input" id="editLocation" type="text" maxlength="120"
               value="${escapeAttr(event.location)}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editShapeTags">${t(event.shape?.source === 'extracted' ? 'edit.field.tagsGuessed' : 'edit.field.tags')}</label>
        <input class="profile-field-input" id="editShapeTags" type="text" maxlength="220"
               value="${escapeAttr((event.shape?.activityTags ?? []).join(', '))}">
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editShapeStructure">${t('edit.field.structure')}</label>
        <select class="profile-field-input" id="editShapeStructure">
          <option value="">—</option>
          ${['structured', 'semi-structured', 'unstructured'].map((s) => `
            <option value="${s}" ${event.shape?.structure === s ? 'selected' : ''}>${t(STRUCTURE_KEYS[s])}</option>
          `).join('')}
        </select>
      </div>

      <div class="profile-field">
        <label class="profile-field-label" for="editEventType">${t(event.eventTypeSource === 'derived' ? 'edit.field.kindGuessed' : 'edit.field.kind')}</label>
        <select class="profile-field-input" id="editEventType" data-loading="1">
          <option value="">${t('edit.field.kindNone')}</option>
        </select>
        <small class="profile-field-hint">${t('edit.field.kindHint')}</small>
      </div>

      <div class="profile-field">
        <span class="profile-field-label">${t('edit.field.offers')}</span>
        ${Object.entries(DOOR_KEYS).map(([door, key]) => `
          <label class="edit-door-option">
            <input type="checkbox" class="edit-door" value="${door}"
                   ${event.shape?.doors?.includes(door) ? 'checked' : ''}> ${t(key)}
          </label>
        `).join('')}
      </div>

      <button class="btn-primary" id="editSubmit" type="submit">${t('common.saveChanges')}</button>
    </form>
  `;

  const form = document.getElementById('editForm');
  const submit = document.getElementById('editSubmit');

  // Kind picker (D63): served register, current type preselected. If it
  // never loads, the field stays untouched on save (dataset.loading).
  commands.getEventTypes().then(({ eventTypes }) => {
    const select = document.getElementById('editEventType');
    if (!select) return;
    select.innerHTML = `<option value="">${t('edit.field.kindNone')}</option>`
      + (eventTypes ?? []).map((type) => `<option value="${type.id}"${type.id === event.eventTypeId ? ' selected' : ''}>${type.name}</option>`).join('');
    delete select.dataset.loading;
  }).catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    submit.textContent = text('common.saving');
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
        // Only touch the type once the register loaded (a half-loaded
        // picker must never read as "clear my type").
        eventTypeId: document.getElementById('editEventType').dataset.loading
          ? undefined
          : document.getElementById('editEventType').value,
        commands,
        showToast,
        onSuccess: () => {
          showToast(text('edit.saved'));
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
          showToast(text('edit.noChanges'));
        },
      });
    } finally {
      submit.disabled = false;
      submit.textContent = text('common.saveChanges');
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
