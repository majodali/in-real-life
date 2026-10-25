// Propose-event screen.
//
// Form for a community member to put an event on the feed. On success
// navigates back to the feed where the new event will appear. The form
// rules / API dispatch live in propose-handlers.js (unit tested).

import * as store from '../store.js';
import { commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleProposeSubmit } from './propose-handlers.js';
import { loadLocalities } from '../localities.js';
import { t, attr, text } from '../copy.js';

export function renderPropose() {
  const user = store.getActiveUser();
  if (!user) {
    navigate('feed');
    return;
  }

  const container = document.getElementById('screen-propose');
  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-header-top">
        <button class="detail-back" id="proposeBack">${t('common.back')}</button>
      </div>
      <div class="profile-header-title">${t('propose.title')}</div>
    </div>
    <div class="profile-body">
      <p class="propose-intro">${t('propose.intro')}</p>

      <form class="propose-form" id="proposeForm" novalidate>
        <div class="profile-field">
          <label class="profile-field-label" for="proposeTitle">${t('propose.field.title')}</label>
          <input class="profile-field-input" id="proposeTitle" type="text" maxlength="80"
                 placeholder="${attr('propose.field.titlePlaceholder')}">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeDescription">${t('propose.field.description', { optional: (inner) => `<span class="auth-optional">${inner}</span>` })}</label>
          <textarea class="profile-field-input propose-textarea" id="proposeDescription" rows="3" maxlength="400"
                    placeholder="${attr('propose.field.descriptionPlaceholder')}"></textarea>
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeStart">${t('propose.field.start')}</label>
          <input class="profile-field-input" id="proposeStart" type="datetime-local">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeEnd">${t('propose.field.end')}</label>
          <input class="profile-field-input" id="proposeEnd" type="datetime-local">
        </div>

        <label class="organizer-toggle">
          <input type="checkbox" id="proposeApproxTimes">
          <span>${t('propose.field.approx')}</span>
        </label>
        <small class="profile-field-hint" style="display:block; margin-bottom:14px;">${t('propose.field.approxHint')}</small>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeLocation">${t('propose.field.where')}</label>
          <input class="profile-field-input" id="proposeLocation" type="text" maxlength="120"
                 placeholder="${attr('propose.field.wherePlaceholder')}">
          <small class="profile-field-hint">${t('propose.field.whereHint')}</small>
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeLocality">${t('propose.field.town')}</label>
          <select class="profile-field-input" id="proposeLocality"></select>
          <small class="profile-field-hint">${t('propose.field.townHint')}</small>
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeMeetingSpot">${t('propose.field.findGroup')}</label>
          <input class="profile-field-input" id="proposeMeetingSpot" type="text" maxlength="200"
                 placeholder="${attr('propose.field.findGroupPlaceholder')}">
        </div>

        <label class="organizer-toggle">
          <input type="checkbox" id="proposeExternal">
          <span>${t('propose.field.external')}</span>
        </label>
        <small class="profile-field-hint" style="display:block; margin-bottom:14px;">${t('propose.field.externalHint')}</small>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeCostAmount">${t('propose.field.cost')}</label>
          <input class="profile-field-input" id="proposeCostAmount" type="number"
                 inputmode="decimal" min="0" step="0.5" placeholder="${attr('propose.field.costPlaceholder')}">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeCostCovers">${t('propose.field.covers')}</label>
          <input class="profile-field-input" id="proposeCostCovers" type="text" maxlength="120"
                 placeholder="${attr('propose.field.coversPlaceholder')}">
          <small class="profile-field-hint">${t('propose.field.coversHint')}</small>
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeMax">${t('propose.field.max')}</label>
          <input class="profile-field-input" id="proposeMax" type="number"
                 inputmode="numeric" min="3" step="1" placeholder="${attr('propose.field.maxPlaceholder')}">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeMin">${t('propose.field.min')}</label>
          <input class="profile-field-input" id="proposeMin" type="number" inputmode="numeric" min="3" step="1"
                 placeholder="3">
          <small class="profile-field-hint">${t('propose.field.minHint')}</small>
        </div>

        <label class="organizer-toggle">
          <input type="checkbox" id="proposeAutoPlan">
          <span>${t('propose.field.autoPlan')}</span>
        </label>
        <small class="profile-field-hint" style="display:block; margin-bottom:14px;">${t('propose.field.autoPlanHint')}</small>

        <button class="btn-primary" id="proposeSubmit" type="submit">${t('propose.submit')}</button>
      </form>
    </div>
  `;

  document.getElementById('proposeBack').addEventListener('click', () => navigate('feed'));

  // Locality select (D62): served register, home preselected. If the
  // register can't load, the select stays empty and the proposal simply
  // defaults to home server-side.
  loadLocalities({ commands }).then((register) => {
    const select = document.getElementById('proposeLocality');
    if (!select) return;
    const home = register.community.homeLocalityId;
    select.innerHTML = [...register.byId.values()]
      .map((l) => `<option value="${l.id}"${l.id === home ? ' selected' : ''}>${l.name}</option>`)
      .join('');
  }).catch(() => {});

  const form = document.getElementById('proposeForm');
  const submit = document.getElementById('proposeSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    submit.textContent = text('propose.submitting');
    try {
      await handleProposeSubmit({
        title: document.getElementById('proposeTitle').value,
        description: document.getElementById('proposeDescription').value,
        startTime: document.getElementById('proposeStart').value,
        costAmount: document.getElementById('proposeCostAmount').value,
        costCovers: document.getElementById('proposeCostCovers').value,
        maxAttendance: document.getElementById('proposeMax').value,
        meetingSpot: document.getElementById('proposeMeetingSpot').value,
        isExternal: document.getElementById('proposeExternal').checked,
        endTime: document.getElementById('proposeEnd').value,
        location: document.getElementById('proposeLocation').value,
        localityId: document.getElementById('proposeLocality').value || undefined,
        organizerName: user.name,
        minimumAttendance: document.getElementById('proposeMin').value,
        autoPlanOnThreshold: document.getElementById('proposeAutoPlan').checked,
        timesApproximate: document.getElementById('proposeApproxTimes').checked,
        commands,
        showToast,
        onSuccess: ({ eventId }) => {
          showToast(text('propose.done'));
          navigate('event', eventId);
        },
        onValidationError: (field) => {
          const map = {
            title: 'proposeTitle',
            startTime: 'proposeStart',
            costAmount: 'proposeCostAmount',
            costCovers: 'proposeCostCovers',
            maxAttendance: 'proposeMax',
            endTime: 'proposeEnd',
            location: 'proposeLocation',
            minimumAttendance: 'proposeMin',
          };
          const el = document.getElementById(map[field]);
          if (el) {
            el.classList.add('shake');
            setTimeout(() => el.classList.remove('shake'), 400);
            el.focus();
          }
        },
      });
    } finally {
      submit.disabled = false;
      submit.textContent = text('propose.submit');
    }
  });
}
