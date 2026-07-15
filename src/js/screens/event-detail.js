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
import { handleDebriefSubmit, chooseFollowUp } from './debrief-handlers.js';
import {
  appendExchange,
  collectPerspectives,
  handleReflectionTurn,
  handleReflectionClose,
} from './reflection-handlers.js';
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
        ${event.cost ? `
        <div class="event-fact">
          <span class="event-fact-label">Cost</span>
          <span class="event-fact-value">$${escapeHtml(String(event.cost.amount))} — covers ${escapeHtml(event.cost.covers)}</span>
        </div>
        ` : ''}
        ${event.maxAttendance ? `
        <div class="event-fact">
          <span class="event-fact-label">Spots</span>
          <span class="event-fact-value">${event.maxAttendance} including the organizer${event.full ? ' — currently full' : ''}</span>
        </div>
        ` : ''}
        ${event.meetingSpot ? `
        <div class="event-fact">
          <span class="event-fact-label">Finding the group</span>
          <span class="event-fact-value">${escapeHtml(event.meetingSpot)}</span>
        </div>
        ` : ''}
        <div class="event-fact">
          <span class="event-fact-label">${event.source === 'external' ? 'Listed by' : 'Organizer'}</span>
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
      <div class="event-roster" id="eventRoster"></div>

      ${showInteractionButtons ? `
        <div class="event-actions" id="eventActions">
          ${renderInteractionButtons(event.myLevel, effective, event.full === true)}
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

  loadRoster(event);
  if (event.myDebrief) bindReflection(container, event);

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

const TEXTURE_CHIPS = [
  'great-company', 'too-big', 'just-right', 'hard-to-break-in',
  'nothing-to-do', 'went-long',
];
const NOSHOW_CHIPS = ['timing', 'distance', 'energy', 'nerves', 'plans-changed'];

// Tiered debrief (docs/debrief.md): taps first, optional texture and
// text, the people step over the roster, and a calm conduct door. Most
// of it is optional — completion rate is the asset.
function renderDebriefSection(event) {
  if (event.myDebrief) return '';  // already debriefed — see renderMyDebrief
  return `
    <div class="event-debrief">
      <div class="organizer-controls-label">How was it?</div>
      <form id="debriefForm" class="debrief-form">
        <div class="debrief-field">
          <span class="debrief-q">Did you make it?</span>
          <div class="event-action-row">
            <button type="button" class="btn-small debrief-chip" data-attended="yes">Yes</button>
            <button type="button" class="btn-small debrief-chip" data-attended="no">Couldn't make it</button>
          </div>
        </div>

        <div class="debrief-field" id="debriefNoShow" style="display:none">
          <span class="debrief-q">No worries — what got in the way?</span>
          <div class="event-action-row debrief-chip-row">
            ${NOSHOW_CHIPS.map((c) => `<button type="button" class="btn-small debrief-chip" data-noshow="${c}">${c.replace(/-/g, ' ')}</button>`).join('')}
          </div>
        </div>

        <div id="debriefWent" style="display:none">
          <div class="debrief-field">
            <span class="debrief-q">Worth another go?</span>
            <div class="event-action-row">
              <button type="button" class="btn-small debrief-chip" data-again="yes">Yes</button>
              <button type="button" class="btn-small debrief-chip" data-again="maybe">Maybe</button>
              <button type="button" class="btn-small debrief-chip" data-again="no">Not for me</button>
            </div>
          </div>

          <div class="debrief-field" id="debriefPeople" style="display:none">
            <span class="debrief-q">Who'd you end up meeting?</span>
            <div id="debriefPeopleList"></div>
          </div>

          <div class="debrief-field">
            <span class="debrief-q">Anything stand out? <span class="auth-optional">(optional)</span></span>
            <div class="event-action-row debrief-chip-row">
              ${TEXTURE_CHIPS.map((c) => `<button type="button" class="btn-small debrief-chip" data-texture="${c}">${c.replace(/-/g, ' ')}</button>`).join('')}
            </div>
          </div>

          <textarea class="profile-field-input suggest-textarea" id="debriefReflection"
                    rows="2" maxlength="1000"
                    placeholder="Anything else worth saying? (optional)"></textarea>
        </div>

        <div class="debrief-field" id="debriefFollowUp" style="display:none">
          <span class="debrief-q" id="debriefFollowUpQ"></span>
          <textarea class="profile-field-input suggest-textarea" id="debriefFollowUpA"
                    rows="2" maxlength="1000" placeholder="Only if you feel like it — skipping is fine"></textarea>
        </div>

        <button type="button" class="debrief-conduct-link" id="debriefConductLink">
          Did you have any concerns with anyone's conduct?
        </button>
        <div class="debrief-field" id="debriefConduct" style="display:none">
          <p class="event-action-hint">
            If someone made you feel unsafe or uncomfortable, you can tell us
            what happened — it goes to a person, never into your preferences.
          </p>
          <textarea class="profile-field-input suggest-textarea" id="debriefConductNote"
                    rows="2" maxlength="1000" placeholder="What happened (optional)"></textarea>
        </div>

        <button type="submit" class="btn-primary" id="debriefSubmit">Save</button>
      </form>
    </div>
  `;
}

function renderMyDebrief(event) {
  const d = event.myDebrief;
  const line = d.conductConcern
    ? 'Thanks for telling us — someone will look at it with care.'
    : d.attended === false
      ? "Couldn't make it — no worries."
      : d.again === 'yes' ? 'Worth another go ✓'
        : d.again === 'maybe' ? 'Maybe again'
          : d.again === 'no' ? 'Not for you — noted'
            : 'Recorded';
  // The standing reflection door (D44): static, always there, spans self
  // and process. Not offered on a conduct-flagged debrief — that one's
  // with the safety path.
  const door = d.conductConcern ? '' : `
    <button type="button" class="debrief-conduct-link" id="reflectionDoor">
      Anything else worth saying — about the event, the people, or how we're doing?
    </button>
    <div id="reflectionPanel" style="display:none">
      <div id="reflectionThread" class="reflection-thread"></div>
      <textarea class="profile-field-input suggest-textarea" id="reflectionInput"
                rows="2" maxlength="1000" placeholder="Say as much or as little as you like"></textarea>
      <div class="event-action-row" style="margin-top:8px;">
        <button type="button" class="btn-secondary" id="reflectionDone">I'm done</button>
        <button type="button" class="btn-primary" id="reflectionSend">Send</button>
      </div>
    </div>
  `;
  return `
    <div class="event-debrief event-debrief-done">
      <div class="organizer-controls-label">Your reflection</div>
      <div class="debrief-saved-row">
        <span class="debrief-saved-notes">${escapeHtml(line)}</span>
      </div>
      ${door}
    </div>
  `;
}

// The reflection conversation: we-voice turns, user-led, exitable at any
// point. Turn responses accumulate the coaching cap record client-side;
// the close records everything in one command.
function bindReflection(container, event) {
  const door = container.querySelector('#reflectionDoor');
  const panel = container.querySelector('#reflectionPanel');
  if (!door || !panel) return;

  let transcript = [];
  const turns = [];
  let closed = false;

  const thread = () => container.querySelector('#reflectionThread');
  const renderThread = (pending) => {
    thread().innerHTML = transcript.map((t) => `
      <div class="reflection-line reflection-${t.role === 'member' ? 'member' : 'us'}">${escapeHtml(t.text)}</div>
    `).join('') + (pending ? '<div class="reflection-line reflection-us">…</div>' : '');
  };

  door.addEventListener('click', async () => {
    door.style.display = 'none';
    panel.style.display = '';
    renderThread(true);
    const { turn, error } = await handleReflectionTurn({
      eventId: event.eventId, transcript, commands,
    });
    if (error) {
      showToast(error.message || 'Couldn’t open that just now.');
      panel.style.display = 'none';
      door.style.display = '';
      return;
    }
    turns.push(turn);
    transcript = appendExchange(transcript, null, turn.message);
    renderThread(false);
  });

  const close = async () => {
    if (closed) return;
    closed = true;
    await handleReflectionClose({
      eventId: event.eventId,
      transcript,
      perspectivesOffered: collectPerspectives(turns),
      commands,
      showToast,
      onDone: () => {
        panel.style.display = 'none';
        showToast('Thanks — we’ll keep that in mind.');
      },
    });
  };

  container.querySelector('#reflectionSend').addEventListener('click', async () => {
    const input = container.querySelector('#reflectionInput');
    const text = input.value.trim();
    if (!text || closed) return;
    input.value = '';
    transcript = appendExchange(transcript, text, null);
    renderThread(true);
    const { turn, error } = await handleReflectionTurn({
      eventId: event.eventId, transcript, commands,
    });
    if (error) {
      renderThread(false);
      showToast('Connection hiccup — try that again.');
      transcript = transcript.slice(0, -1);
      input.value = text;
      return;
    }
    turns.push(turn);
    transcript = appendExchange(transcript, null, turn.message);
    renderThread(false);
    if (turn.done) await close();
  });

  container.querySelector('#reflectionDone').addEventListener('click', close);
}

function bindDebriefForm(container, event) {
  const form = container.querySelector('#debriefForm');
  if (!form) return;

  const state = {
    attended: undefined, again: undefined, noShowReason: undefined,
    textures: [], people: [], conductConcern: false,
  };
  const peopleMarks = new Map(); // ref → { seeAgain }

  const pick = (selector, onPick) => {
    const buttons = form.querySelectorAll(selector);
    buttons.forEach((btn) => btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('selected', b === btn));
      onPick(btn);
    }));
  };

  pick('[data-attended]', (btn) => {
    state.attended = btn.dataset.attended === 'yes';
    form.querySelector('#debriefWent').style.display = state.attended ? '' : 'none';
    form.querySelector('#debriefNoShow').style.display = state.attended ? 'none' : '';
    if (state.attended) loadDebriefPeople(form, event, peopleMarks);
  });
  pick('[data-noshow]', (btn) => { state.noShowReason = btn.dataset.noshow; });
  pick('[data-again]', (btn) => { state.again = btn.dataset.again; });

  form.querySelectorAll('[data-texture]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      const c = btn.dataset.texture;
      state.textures = btn.classList.contains('selected')
        ? [...state.textures, c]
        : state.textures.filter((t) => t !== c);
    });
  });

  const conductLink = form.querySelector('#debriefConductLink');
  conductLink.addEventListener('click', () => {
    state.conductConcern = !state.conductConcern;
    conductLink.classList.toggle('selected', state.conductConcern);
    form.querySelector('#debriefConduct').style.display = state.conductConcern ? '' : 'none';
  });

  let followUpShown = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = form.querySelector('#debriefSubmit');

    // The one invited follow-up (opt-in, once): shown between the taps
    // and the save when it would yield real signal. Stopping is always
    // the default — the answer field can be left empty.
    if (!followUpShown) {
      const question = chooseFollowUp(state);
      if (question) {
        followUpShown = true;
        const wrap = form.querySelector('#debriefFollowUp');
        form.querySelector('#debriefFollowUpQ').textContent = question;
        wrap.style.display = '';
        wrap.dataset.question = question;
        submit.textContent = 'Save';
        return;
      }
    }

    submit.disabled = true;
    submit.textContent = 'Saving…';
    const followUpWrap = form.querySelector('#debriefFollowUp');
    const followUp = followUpShown
      ? { question: followUpWrap.dataset.question, answer: form.querySelector('#debriefFollowUpA').value }
      : undefined;
    const ok = await handleDebriefSubmit({
      eventId: event.eventId,
      state: {
        ...state,
        people: [...peopleMarks.entries()]
          .filter(([, v]) => v.met)
          .map(([ref, v]) => ({ ref, seeAgain: v.seeAgain === true })),
        reflection: form.querySelector('#debriefReflection')?.value,
        followUp,
        conductNote: form.querySelector('#debriefConductNote')?.value,
      },
      commands,
      showToast,
      onSuccess: () => {
        showToast(followUp?.answer?.trim()
          ? 'Got it — that helps us aim better.'
          : 'Thanks — we\u2019ll keep that in mind.');
        renderEventDetail(event.eventId);
      },
    });
    if (!ok) {
      submit.disabled = false;
      submit.textContent = 'Save';
    }
  });
}

// The people step: who you met (tap), then a positive-only "see again"
// star on the people you met. Untapped is neutral; there is no per-person
// "no" (docs/debrief.md).
async function loadDebriefPeople(form, event, peopleMarks) {
  const wrap = form.querySelector('#debriefPeople');
  const list = form.querySelector('#debriefPeopleList');
  if (!wrap || !list || list.dataset.loaded) return;
  try {
    const roster = await commands.listAttendees({ eventId: event.eventId });
    const others = [...(roster.confirmed ?? []), ...(roster.interested ?? [])]
      .filter((p) => !p.me);
    if (!others.length) return;
    list.dataset.loaded = '1';
    wrap.style.display = '';
    list.innerHTML = others.map((p) => `
      <div class="debrief-person" data-ref="${escapeAttr(p.ref)}">
        <button type="button" class="btn-small debrief-chip" data-person-met>${escapeHtml(p.name)}</button>
        <button type="button" class="btn-small debrief-chip debrief-see-again" data-person-again
                style="display:none" title="Want to see again?">★ see again</button>
      </div>
    `).join('');
    list.querySelectorAll('.debrief-person').forEach((row) => {
      const ref = row.dataset.ref;
      const metBtn = row.querySelector('[data-person-met]');
      const againBtn = row.querySelector('[data-person-again]');
      metBtn.addEventListener('click', () => {
        const mark = peopleMarks.get(ref) ?? { met: false, seeAgain: false };
        mark.met = !mark.met;
        if (!mark.met) { mark.seeAgain = false; againBtn.classList.remove('selected'); }
        peopleMarks.set(ref, mark);
        metBtn.classList.toggle('selected', mark.met);
        againBtn.style.display = mark.met ? '' : 'none';
      });
      againBtn.addEventListener('click', () => {
        const mark = peopleMarks.get(ref) ?? { met: true, seeAgain: false };
        mark.seeAgain = !mark.seeAgain;
        peopleMarks.set(ref, mark);
        againBtn.classList.toggle('selected', mark.seeAgain);
      });
    });
  } catch {
    // People step is enrichment; the rest of the debrief works without it.
  }
}

// The roster behind the counts (first names only; "you" marked). On an
// external event the confirmed list IS the mutual commitment — the
// people you're agreeing to meet there (D53).
async function loadRoster(event) {
  const el = document.getElementById('eventRoster');
  if (!el) return;
  try {
    const roster = await commands.listAttendees({ eventId: event.eventId });
    el.innerHTML = renderRoster(roster, event);
  } catch {
    el.innerHTML = ''; // roster is enrichment — never block the screen
  }
}

function renderRoster({ confirmed = [], interested = [] }, event) {
  if (!confirmed.length && !interested.length) return '';
  const names = (list) => list
    .map((p) => (p.me ? '<strong>you</strong>' : escapeHtml(p.name)))
    .join(', ');
  const goingLabel = event.source === 'external' ? 'Meeting there' : 'Going';
  const going = confirmed.length
    ? `<div class="roster-line"><span class="roster-label">${goingLabel}</span> ${names(confirmed)}</div>`
    : '';
  const curious = interested.length
    ? `<div class="roster-line"><span class="roster-label">Interested</span> ${names(interested)}</div>`
    : '';
  return going + curious;
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

function renderInteractionButtons(myLevel, effective, full = false) {
  // Full events keep interest open (demand signal for a bigger room or a
  // repeat) but can't take more confirmations; existing confirmations
  // keep their normal controls.
  if (full && myLevel !== 'confirmed') {
    if (myLevel === 'interested') {
      return `
        <div class="event-action-status">✓ You're interested</div>
        <p class="event-action-hint">This one's full — if a spot frees up, interest is how you'll hear about it.</p>
        <div class="event-action-row">
          <button class="btn-outline-rust" data-action="withdraw">Not anymore</button>
        </div>
      `;
    }
    return `
      <p class="event-action-hint">This one's full — register interest and the organizer can gauge demand for a repeat.</p>
      <div class="event-action-row">
        <button class="btn-secondary" data-action="interested">I'm interested</button>
      </div>
    `;
  }
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
      <div class="organizer-controls-label">${event.source === 'external' ? 'You listed this — keep it current or cancel it if it\u2019s off' : 'Your event'}</div>
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

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
