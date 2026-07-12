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
          <label class="profile-field-label" for="proposeStart">Start time (optional)</label>
          <input class="profile-field-input" id="proposeStart" type="datetime-local">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeEnd">End time (optional)</label>
          <input class="profile-field-input" id="proposeEnd" type="datetime-local">
        </div>

        <label class="organizer-toggle">
          <input type="checkbox" id="proposeApproxTimes">
          <span>These times are approximate</span>
        </label>
        <small class="profile-field-hint" style="display:block; margin-bottom:14px;">
          Tick this if the start/end aren't firm yet — they're shown as a
          guide and can be refined later.
        </small>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeLocation">Where (optional)</label>
          <input class="profile-field-input" id="proposeLocation" type="text" maxlength="120"
                 placeholder="e.g. Blackbird Bakery">
          <small class="profile-field-hint">
            No time or place yet? Leave them blank — your proposal floats as
            an idea people can get behind, and firms up from there.
          </small>
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeMeetingSpot">How to find the group (optional)</label>
          <input class="profile-field-input" id="proposeMeetingSpot" type="text" maxlength="200"
                 placeholder="e.g. back tables — look for the blue scarf">
        </div>

        <label class="organizer-toggle">
          <input type="checkbox" id="proposeExternal">
          <span>This is an existing local event (not organized on IRL)</span>
        </label>
        <small class="profile-field-hint" style="display:block; margin-bottom:14px;">
          You'll be its steward — shown as "listed by" you. It goes up as
          already happening (real time and place required), and confirming
          means members commit to meeting each other there.
        </small>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeCostAmount">Cost per person (optional)</label>
          <input class="profile-field-input" id="proposeCostAmount" type="number"
                 inputmode="decimal" min="0" step="0.5" placeholder="e.g. 12">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeCostCovers">What does it cover?</label>
          <input class="profile-field-input" id="proposeCostCovers" type="text" maxlength="120"
                 placeholder="e.g. materials and the room">
          <small class="profile-field-hint">
            Required if there's a cost — people should know what they're
            chipping in for. Leave both blank for free events.
          </small>
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeMax">Spots (optional, including you)</label>
          <input class="profile-field-input" id="proposeMax" type="number"
                 inputmode="numeric" min="3" step="1" placeholder="e.g. 8">
        </div>

        <div class="profile-field">
          <label class="profile-field-label" for="proposeMin">Min. attendance</label>
          <input class="profile-field-input" id="proposeMin" type="number" inputmode="numeric" min="3" step="1"
                 placeholder="3">
          <small class="profile-field-hint">Defaults to 3, including you. Raise it if this only makes sense with more people.</small>
        </div>

        <label class="organizer-toggle">
          <input type="checkbox" id="proposeAutoPlan">
          <span>Auto-confirm once the minimum is reached</span>
        </label>
        <small class="profile-field-hint" style="display:block; margin-bottom:14px;">
          Safety net: if you forget to check in, the event still becomes
          planned once enough people commit.
        </small>

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
        costAmount: document.getElementById('proposeCostAmount').value,
        costCovers: document.getElementById('proposeCostCovers').value,
        maxAttendance: document.getElementById('proposeMax').value,
        meetingSpot: document.getElementById('proposeMeetingSpot').value,
        isExternal: document.getElementById('proposeExternal').checked,
        endTime: document.getElementById('proposeEnd').value,
        location: document.getElementById('proposeLocation').value,
        organizerName: user.name,
        minimumAttendance: document.getElementById('proposeMin').value,
        autoPlanOnThreshold: document.getElementById('proposeAutoPlan').checked,
        timesApproximate: document.getElementById('proposeApproxTimes').checked,
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
      submit.textContent = 'Propose it';
    }
  });
}
