// Propose-event screen.
//
// Form for a community member to put an event on the feed. On success
// navigates back to the feed where the new event will appear. The form
// rules / API dispatch live in propose-handlers.js (unit tested).

import * as store from '../store.js';
import { commands } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleProposeSubmit } from './propose-handlers.js';

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
        <button class="detail-back" id="proposeBack">← Back</button>
      </div>
      <div class="profile-header-title">Propose something</div>
    </div>
    <div class="profile-body">
      <p class="propose-intro">
        Float an idea for the community. It starts as <em>proposed</em>
        — people can show interest, suggest tweaks, and (if you'd like)
        you can confirm it once enough people are in.
      </p>

      <form class="propose-form" id="proposeForm" novalidate>
        <div class="profile-field">
          <label class="profile-field-label" for="proposeTitle">Title</label>
          <input class="profile-field-input" id="proposeTitle" type="text" maxlength="80"
                 placeholder="e.g. Morning coffee &amp; walk">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeDescription">Description <span class="auth-optional">(optional)</span></label>
          <textarea class="profile-field-input propose-textarea" id="proposeDescription" rows="3" maxlength="400"
                    placeholder="A few words on what this is and who it's for"></textarea>
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeStart">Start time</label>
          <input class="profile-field-input" id="proposeStart" type="datetime-local">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeEnd">End time <span class="auth-optional">(optional)</span></label>
          <input class="profile-field-input" id="proposeEnd" type="datetime-local">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeLocation">Where</label>
          <input class="profile-field-input" id="proposeLocation" type="text" maxlength="120"
                 placeholder="e.g. Blackbird Bakery">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeMin">Min. attendance <span class="auth-optional">(optional)</span></label>
          <input class="profile-field-input" id="proposeMin" type="number" inputmode="numeric" min="1" step="1"
                 placeholder="e.g. 3">
          <small class="profile-field-hint">If set, you'll know when this many people have confirmed.</small>
        </div>

        <button class="btn-primary" id="proposeSubmit" type="submit">Propose it</button>
      </form>
    </div>
  `;

  document.getElementById('proposeBack').addEventListener('click', () => navigate('feed'));

  const form = document.getElementById('proposeForm');
  const submit = document.getElementById('proposeSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    submit.textContent = 'Proposing…';
    try {
      await handleProposeSubmit({
        title: document.getElementById('proposeTitle').value,
        description: document.getElementById('proposeDescription').value,
        startTime: document.getElementById('proposeStart').value,
        endTime: document.getElementById('proposeEnd').value,
        location: document.getElementById('proposeLocation').value,
        organizerName: user.name,
        minimumAttendance: document.getElementById('proposeMin').value,
        commands,
        showToast,
        onSuccess: ({ eventId }) => {
          showToast('Out there! 🌿');
          navigate('event', eventId);
        },
        onValidationError: (field) => {
          const map = {
            title: 'proposeTitle',
            startTime: 'proposeStart',
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
      submit.textContent = 'Propose it';
    }
  });
}
