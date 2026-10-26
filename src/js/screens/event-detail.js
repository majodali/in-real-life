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
import { handleDebriefSubmit, chooseFollowUp, buildPeopleEntries } from './debrief-handlers.js';
import {
  appendExchange,
  collectPerspectives,
  handleReflectionTurn,
  handleReflectionClose,
} from './reflection-handlers.js';
import { renderSuggestionsSection } from './event-suggestions.js';
import { renderPollsSection } from './event-polls.js';
import { loadLocalities, localityLine, bandBetween } from '../localities.js';
import { t, attr, text, date } from '../copy.js';
import { errorText } from '../errors.js';
import { lifecycleLabel } from '../lifecycle-labels.js';

export async function renderEventDetail(eventId) {
  const container = document.getElementById('screen-event');
  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-header-top">
        <button class="detail-back" id="eventBack">${t('common.back')}</button>
      </div>
      <div class="profile-header-title">${t('event.header')}</div>
    </div>
    <div class="profile-body">
      <div class="event-detail-loading">${t('common.loading')}</div>
    </div>
  `;

  document.getElementById('eventBack').addEventListener('click', () => navigate('feed'));

  let event;
  let events = [];
  let homeLocalityId;
  try {
    const listOut = await commands.listEvents();
    events = listOut.events ?? [];
    homeLocalityId = listOut.homeLocalityId;
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

  const me = store.getActiveUser();
  const iAmOrganizer = me && me.id === event.organizerId;
  const start = formatDateRange(event.startTime, event.endTime);

  // Locality line (D62): the event's town + the effort read from the
  // member's own home, with the exceptions affordances (feels closer /
  // further → constraint correction) and the wish capture. Enrichment
  // only — the detail renders fine without the register.
  let localityFact = '';
  let localityBand = null;
  try {
    if (event.localityId) {
      const register = await loadLocalities({ commands });
      const line = localityLine(register, homeLocalityId, event.localityId);
      localityBand = bandBetween(register, homeLocalityId, event.localityId);
      if (line) {
        localityFact = `
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.locality')}</span>
          <span class="event-fact-value">${escapeHtml(line)}
            ${localityBand && localityBand !== 'here' ? `
            <span class="locality-actions">
              <button type="button" class="btn-small locality-chip" data-feels="closer">${t('event.locality.closer')}</button>
              <button type="button" class="btn-small locality-chip" data-feels="further">${t('event.locality.further')}</button>
              <button type="button" class="btn-small locality-chip" id="wishCloserBtn">${t('event.locality.wish')}</button>
            </span>` : ''}
          </span>
        </div>`;
      }
    }
  } catch { /* register unavailable — skip the line */ }
  const effective = event.effectiveState || event.lifecycleState;
  const stateLabel = lifecycleLabel(effective);
  const sourceLabel = SOURCE_KEYS[event.source] ? text(SOURCE_KEYS[event.source]) : event.source;
  // While the event is still open (proposed or planned) it accepts changes —
  // interest, suggestions, polls. The backend rejects all of these once the
  // event is in-progress, over, or cancelled, so the UI follows suit.
  const openForChanges = effective === 'idea' || effective === 'proposed' || effective === 'planned';
  const showInteractionButtons = openForChanges;

  container.querySelector('.profile-body').innerHTML = `
    <div class="event-card-large">
      <div class="event-card-meta">
        <span class="event-state event-state-${effective}">${escapeHtml(stateLabel)}</span>
        <span class="event-source">${escapeHtml(sourceLabel)}</span>
        ${event.lastEditedAt ? `<span class="event-edited" title="${escapeHtml(date(event.lastEditedAt, 'editedAt'))}">${t('event.edited')}</span>` : ''}
      </div>
      <h2 class="event-title">${escapeHtml(event.title)}</h2>
      ${event.description ? `<p class="event-description">${escapeHtml(event.description)}</p>` : ''}

      <div class="event-facts">
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.when')}</span>
          <span class="event-fact-value">${event.startTime ? escapeHtml(start) : t('event.tbd')}${event.timesApproximate ? ` <span class="event-fact-approx">${t('event.approximate')}</span>` : ''}</span>
        </div>
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.where')}</span>
          <span class="event-fact-value">${event.location ? escapeHtml(event.location) : t('event.tbd')}</span>
        </div>
        ${localityFact}
        ${event.cost ? `
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.cost')}</span>
          <span class="event-fact-value">${t('event.costValue', { amount: String(event.cost.amount), covers: event.cost.covers })}</span>
        </div>
        ` : ''}
        ${event.maxAttendance ? `
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.spots')}</span>
          <span class="event-fact-value">${t(event.full ? 'event.spotsValueFull' : 'event.spotsValue', { max: event.maxAttendance })}</span>
        </div>
        ` : ''}
        ${event.meetingSpot ? `
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.findGroup')}</span>
          <span class="event-fact-value">${escapeHtml(event.meetingSpot)}</span>
        </div>
        ` : ''}
        ${event.shape ? `
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.shape')}</span>
          <span class="event-fact-value">${escapeHtml(describeShape(event.shape))}</span>
        </div>
        ` : ''}
        <div class="event-fact">
          <span class="event-fact-label">${t(event.source === 'external' ? 'event.fact.listedBy' : 'event.fact.organizer')}</span>
          <span class="event-fact-value">${escapeHtml(event.organizerName)}</span>
        </div>
        ${event.minimumAttendance > 3 ? `
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.needs')}</span>
          <span class="event-fact-value">${t('event.needsValue', { count: event.minimumAttendance })}</span>
        </div>
        ` : ''}
        ${event.lifecycleState === 'cancelled' && event.cancellationReason ? `
        <div class="event-fact">
          <span class="event-fact-label">${t('event.fact.cancelledBecause')}</span>
          <span class="event-fact-value">${escapeHtml(event.cancellationReason)}</span>
        </div>
        ` : ''}
      </div>

      <div class="event-counts">
        <span class="event-count">${t('event.count.interested', bold(event.interestCount ?? 0))}</span>
        <span class="event-count">${t('event.count.confirmed', bold(event.confirmedCount ?? 0))}</span>
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

  // Locality affordances (D62): the exceptions layer + the wish capture.
  container.querySelectorAll('[data-feels]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await commands.correctModel({
          correction: {
            type: 'constraint',
            localityId: event.localityId,
            feels: btn.dataset.feels,
          },
        });
        showToast(text('event.locality.noted'));
      } catch {
        showToast(text('event.locality.failed'));
      }
    });
  });
  const wishBtn = container.querySelector('#wishCloserBtn');
  wishBtn?.addEventListener('click', async () => {
    try {
      await commands.wishCloser({ eventId: event.eventId });
      wishBtn.disabled = true;
      wishBtn.textContent = text('event.locality.wishNoted');
      showToast(text('event.locality.wishRecorded'));
    } catch {
      showToast(text('event.locality.failed'));
    }
  });

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

// Texture = the "what aspects" capture. The last three are the D63
// positive-attribution chips (§4 of the event-type note): the why of a
// good night in one optional tap — great-company already covers the
// people. Exact wording gets the voice pass with the redesign.
const TEXTURE_CHIPS = {
  'great-company': 'event.debrief.texture.greatCompany',
  'too-big': 'event.debrief.texture.tooBig',
  'just-right': 'event.debrief.texture.justRight',
  'hard-to-break-in': 'event.debrief.texture.hardToBreakIn',
  'nothing-to-do': 'event.debrief.texture.nothingToDo',
  'went-long': 'event.debrief.texture.wentLong',
  'the-activity-itself': 'event.debrief.texture.theActivity',
  'the-place': 'event.debrief.texture.thePlace',
  'well-run': 'event.debrief.texture.wellRun',
};
const NOSHOW_CHIPS = {
  timing: 'event.debrief.noShow.timing',
  distance: 'event.debrief.noShow.distance',
  energy: 'event.debrief.noShow.energy',
  nerves: 'event.debrief.noShow.nerves',
  'plans-changed': 'event.debrief.noShow.plansChanged',
};

// Tiered debrief (docs/debrief.md): taps first, optional texture and
// text, the people step over the roster, and a calm conduct door. Most
// of it is optional — completion rate is the asset.
function renderDebriefSection(event) {
  if (event.myDebrief) return '';  // already debriefed — see renderMyDebrief
  return `
    <div class="event-debrief">
      <div class="organizer-controls-label">${t('event.debrief.title')}</div>
      <form id="debriefForm" class="debrief-form">
        <div class="debrief-field">
          <span class="debrief-q">${t('event.debrief.madeIt')}</span>
          <div class="event-action-row">
            <button type="button" class="btn-small debrief-chip" data-attended="yes">${t('event.debrief.yes')}</button>
            <button type="button" class="btn-small debrief-chip" data-attended="no">${t('event.debrief.no')}</button>
          </div>
        </div>

        <div class="debrief-field" id="debriefNoShow" style="display:none">
          <span class="debrief-q">${t('event.debrief.whyNot')}</span>
          <div class="event-action-row debrief-chip-row">
            ${Object.entries(NOSHOW_CHIPS).map(([c, key]) => `<button type="button" class="btn-small debrief-chip" data-noshow="${c}">${t(key)}</button>`).join('')}
          </div>
        </div>

        <div id="debriefWent" style="display:none">
          <div class="debrief-field">
            <span class="debrief-q">${t('event.debrief.again')}</span>
            <div class="event-action-row">
              <button type="button" class="btn-small debrief-chip" data-again="yes">${t('event.debrief.againYes')}</button>
              <button type="button" class="btn-small debrief-chip" data-again="maybe">${t('event.debrief.againMaybe')}</button>
              <button type="button" class="btn-small debrief-chip" data-again="no">${t('event.debrief.againNo')}</button>
            </div>
          </div>

          <div class="debrief-field" id="debriefPeople" style="display:none">
            <span class="debrief-q">${t('event.debrief.people')}</span>
            <div id="debriefPeopleList"></div>
          </div>

          <div class="debrief-field">
            <span class="debrief-q">${t('event.debrief.standOut', { optional: (inner) => `<span class="auth-optional">${inner}</span>` })}</span>
            <div class="event-action-row debrief-chip-row">
              ${Object.entries(TEXTURE_CHIPS).map(([c, key]) => `<button type="button" class="btn-small debrief-chip" data-texture="${c}">${t(key)}</button>`).join('')}
            </div>
          </div>

          <textarea class="profile-field-input suggest-textarea" id="debriefReflection"
                    rows="2" maxlength="1000"
                    placeholder="${attr('event.debrief.reflectionPlaceholder')}"></textarea>
        </div>

        <div class="debrief-field" id="debriefFollowUp" style="display:none">
          <span class="debrief-q" id="debriefFollowUpQ"></span>
          <textarea class="profile-field-input suggest-textarea" id="debriefFollowUpA"
                    rows="2" maxlength="1000" placeholder="${attr('event.debrief.followUpPlaceholder')}"></textarea>
        </div>

        <button type="button" class="debrief-conduct-link" id="debriefConductLink">${t('event.debrief.conductLink')}</button>
        <div class="debrief-field" id="debriefConduct" style="display:none">
          <p class="event-action-hint">${t('event.debrief.conductHint')}</p>
          <textarea class="profile-field-input suggest-textarea" id="debriefConductNote"
                    rows="2" maxlength="1000" placeholder="${attr('event.debrief.conductPlaceholder')}"></textarea>
        </div>

        <button type="submit" class="btn-primary" id="debriefSubmit">${t('event.debrief.save')}</button>
      </form>
    </div>
  `;
}

function renderMyDebrief(event) {
  const d = event.myDebrief;
  const line = text(d.conductConcern
    ? 'event.mine.conduct'
    : d.attended === false
      ? 'event.mine.absent'
      : d.again === 'yes' ? 'event.mine.yes'
        : d.again === 'maybe' ? 'event.mine.maybe'
          : d.again === 'no' ? 'event.mine.no'
            : 'event.mine.recorded');
  // The standing reflection door (D44): static, always there, spans self
  // and process. Not offered on a conduct-flagged debrief — that one's
  // with the safety path.
  const door = d.conductConcern ? '' : `
    <button type="button" class="debrief-conduct-link" id="reflectionDoor">${t('event.reflect.door')}</button>
    <div id="reflectionPanel" style="display:none">
      <div id="reflectionThread" class="reflection-thread"></div>
      <textarea class="profile-field-input suggest-textarea" id="reflectionInput"
                rows="2" maxlength="1000" placeholder="${attr('event.reflect.placeholder')}"></textarea>
      <div class="event-action-row" style="margin-top:8px;">
        <button type="button" class="btn-secondary" id="reflectionDone">${t('event.reflect.done')}</button>
        <button type="button" class="btn-primary" id="reflectionSend">${t('event.reflect.send')}</button>
      </div>
    </div>
  `;
  return `
    <div class="event-debrief event-debrief-done">
      <div class="organizer-controls-label">${t('event.mine.title')}</div>
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
      showToast(errorText(error, 'event.reflect.openFailed'));
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
        showToast(text('event.reflect.thanks'));
      },
    });
  };

  container.querySelector('#reflectionSend').addEventListener('click', async () => {
    const input = container.querySelector('#reflectionInput');
    const said = input.value.trim();
    if (!said || closed) return;
    input.value = '';
    transcript = appendExchange(transcript, said, null);
    renderThread(true);
    const { turn, error } = await handleReflectionTurn({
      eventId: event.eventId, transcript, commands,
    });
    if (error) {
      renderThread(false);
      showToast(text('event.reflect.hiccup'));
      transcript = transcript.slice(0, -1);
      input.value = said;
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
        submit.textContent = text('event.debrief.save');
        return;
      }
    }

    submit.disabled = true;
    submit.textContent = text('common.saving');
    const followUpWrap = form.querySelector('#debriefFollowUp');
    const followUp = followUpShown
      ? { question: followUpWrap.dataset.question, answer: form.querySelector('#debriefFollowUpA').value }
      : undefined;
    const ok = await handleDebriefSubmit({
      eventId: event.eventId,
      state: {
        ...state,
        people: buildPeopleEntries(peopleMarks),
        reflection: form.querySelector('#debriefReflection')?.value,
        followUp,
        conductNote: form.querySelector('#debriefConductNote')?.value,
      },
      commands,
      showToast,
      onSuccess: () => {
        showToast(text(followUp?.answer?.trim()
          ? 'event.debrief.savedWithFollowUp'
          : 'event.debrief.saved'));
        renderEventDetail(event.eventId);
      },
    });
    if (!ok) {
      submit.disabled = false;
      submit.textContent = text('event.debrief.save');
    }
  });
}

// The people step: who you met (tap), then a positive-only "see again"
// star on the people you met. Untapped is neutral; there is no per-person
// "no" CHIP (docs/debrief.md) — avoidance (D49/D61) is a deliberate act
// tucked behind the ⋯ affordance, never a rating in the main flow.
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
                style="display:none" title="${attr('event.debrief.seeAgainTitle')}">${t('event.debrief.seeAgain')}</button>
        <button type="button" class="btn-small debrief-chip debrief-more-btn" data-person-more
                style="display:none" title="${attr('event.debrief.more')}" aria-label="${attr('event.debrief.moreFor', { name: p.name })}">⋯</button>
        <div class="debrief-avoid-options" data-person-avoid-options style="display:none">
          <button type="button" class="btn-small debrief-chip" data-avoid="didnt-click">${t('event.debrief.avoid.didntClick')}</button>
          <button type="button" class="btn-small debrief-chip" data-avoid="do-not-interact">${t('event.debrief.avoid.rather')}</button>
        </div>
      </div>
    `).join('') + `
      <p class="debrief-avoid-note" id="debriefAvoidNote" style="display:none">${t('event.debrief.avoidNote')}</p>`;
    const avoidNote = list.querySelector('#debriefAvoidNote');
    list.querySelectorAll('.debrief-person').forEach((row) => {
      const ref = row.dataset.ref;
      const metBtn = row.querySelector('[data-person-met]');
      const againBtn = row.querySelector('[data-person-again]');
      const moreBtn = row.querySelector('[data-person-more]');
      const options = row.querySelector('[data-person-avoid-options]');
      const avoidBtns = [...options.querySelectorAll('[data-avoid]')];
      const paint = (mark) => {
        againBtn.classList.toggle('selected', mark.seeAgain === true);
        avoidBtns.forEach((b) => b.classList.toggle('selected', mark.avoid === b.dataset.avoid));
        if (mark.avoid) avoidNote.style.display = '';
      };
      metBtn.addEventListener('click', () => {
        const mark = peopleMarks.get(ref) ?? { met: false, seeAgain: false };
        mark.met = !mark.met;
        if (!mark.met) {
          mark.seeAgain = false;
          delete mark.avoid;
          options.style.display = 'none';
        }
        peopleMarks.set(ref, mark);
        metBtn.classList.toggle('selected', mark.met);
        againBtn.style.display = mark.met ? '' : 'none';
        moreBtn.style.display = mark.met ? '' : 'none';
        paint(mark);
      });
      againBtn.addEventListener('click', () => {
        const mark = peopleMarks.get(ref) ?? { met: true, seeAgain: false };
        mark.seeAgain = !mark.seeAgain;
        if (mark.seeAgain) delete mark.avoid; // the newest word wins
        peopleMarks.set(ref, mark);
        paint(mark);
      });
      moreBtn.addEventListener('click', () => {
        options.style.display = options.style.display === 'none' ? '' : 'none';
      });
      avoidBtns.forEach((btn) => btn.addEventListener('click', () => {
        const mark = peopleMarks.get(ref) ?? { met: true, seeAgain: false };
        mark.avoid = mark.avoid === btn.dataset.avoid ? undefined : btn.dataset.avoid;
        if (!mark.avoid) delete mark.avoid;
        else mark.seeAgain = false; // mutually exclusive by construction
        peopleMarks.set(ref, mark);
        paint(mark);
      }));
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
    .map((p) => (p.me ? `<strong>${t('event.roster.you')}</strong>` : escapeHtml(p.name)))
    .join(', ');
  const goingLabel = t(event.source === 'external' ? 'event.roster.meetingThere' : 'event.roster.going');
  const going = confirmed.length
    ? `<div class="roster-line"><span class="roster-label">${goingLabel}</span> ${names(confirmed)}</div>`
    : '';
  const curious = interested.length
    ? `<div class="roster-line"><span class="roster-label">${t('event.roster.interested')}</span> ${names(interested)}</div>`
    : '';
  return going + curious;
}

// For a member who had committed to an event that then died: acknowledge
// it plainly. Their interaction row is untouched (history, not a live
// commitment); withdrawing stays available but is never required.
function renderCancelledOnMeNote(event) {
  const effective = event.effectiveState || event.lifecycleState;
  if (effective !== 'cancelled' || !event.myLevel) return '';
  return `
    <div class="event-conflict-note">${t(event.myLevel === 'confirmed' ? 'event.note.cancelledConfirmed' : 'event.note.cancelledInterested')}</div>
  `;
}

// Standing double-confirmation note (from the list annotation, so edits
// that create an overlap later are caught too). Gentle: never a blocker.
function renderConflictNote(event, events) {
  if (!event.conflictsWith?.length) return '';
  const titles = event.conflictsWith
    .map((id) => events.find((e) => e.eventId === id)?.title)
    .filter(Boolean);
  const names = titles.length
    ? titles.map((title) => t('event.note.quoted', { title })).join(', ')
    : t('event.anotherEvent');
  return `
    <div class="event-conflict-note">${t('event.note.overlap', { titles: () => names })}</div>
  `;
}

function renderInteractionButtons(myLevel, effective, full = false) {
  // Full events keep interest open (demand signal for a bigger room or a
  // repeat) but can't take more confirmations; existing confirmations
  // keep their normal controls.
  if (full && myLevel !== 'confirmed') {
    if (myLevel === 'interested') {
      return `
        <div class="event-action-status">${t('event.action.youreInterested')}</div>
        <p class="event-action-hint">${t('event.action.fullInterested')}</p>
        <div class="event-action-row">
          <button class="btn-outline-rust" data-action="withdraw">${t('event.action.notAnymore')}</button>
        </div>
      `;
    }
    return `
      <p class="event-action-hint">${t('event.action.full')}</p>
      <div class="event-action-row">
        <button class="btn-secondary" data-action="interested">${t('event.action.interested')}</button>
      </div>
    `;
  }
  // An idea has no time or place to commit to yet — interest is the
  // idea-stage currency (the backend rejects confirmation with 409).
  if (effective === 'idea') {
    if (myLevel === 'interested') {
      return `
        <div class="event-action-status">${t('event.action.youreInterested')}</div>
        <p class="event-action-hint">${t('event.action.ideaInterested')}</p>
        <div class="event-action-row">
          <button class="btn-outline-rust" data-action="withdraw">${t('event.action.notAnymore')}</button>
        </div>
      `;
    }
    return `
      <p class="event-action-hint">${t('event.action.idea')}</p>
      <div class="event-action-row">
        <button class="btn-primary" data-action="interested">${t('event.action.interested')}</button>
      </div>
    `;
  }
  if (myLevel === 'confirmed') {
    return `
      <div class="event-action-status">${t('event.action.youreConfirmed')}</div>
      <div class="event-action-row">
        <button class="btn-secondary" data-action="interested">${t('event.action.justInterested')}</button>
        <button class="btn-outline-rust" data-action="withdraw">${t('event.action.cantMakeIt')}</button>
      </div>
    `;
  }
  if (myLevel === 'interested') {
    return `
      <div class="event-action-status">${t('event.action.youreInterested')}</div>
      <div class="event-action-row">
        <button class="btn-primary" data-action="confirmed">${t('event.action.confirm')}</button>
        <button class="btn-outline-rust" data-action="withdraw">${t('event.action.notAnymore')}</button>
      </div>
    `;
  }
  return `
    <div class="event-action-row">
      <button class="btn-secondary" data-action="interested">${t('event.action.interested')}</button>
      <button class="btn-primary" data-action="confirmed">${t('event.action.confirm')}</button>
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
      <div class="organizer-controls-label">${t(event.source === 'external' ? 'event.organizer.labelExternal' : 'event.organizer.label')}</div>
      ${stored === 'proposed' && isIdea ? `
        <p class="organizer-threshold-met">${t('event.organizer.ideaHint')}</p>
      ` : ''}
      ${stored === 'proposed' && !isIdea ? `
        ${reached ? `
          <p class="organizer-threshold-met">${t(event.autoPlanOnThreshold ? 'event.organizer.reachedAuto' : 'event.organizer.reached')}</p>
        ` : ''}
        <button class="btn-primary" data-organizer-action="schedule">${t(reached ? 'event.organizer.confirm' : 'event.organizer.confirmEarly')}</button>
        <label class="organizer-toggle">
          <input type="checkbox" id="autoPlanToggle" ${event.autoPlanOnThreshold ? 'checked' : ''}>
          <span>${t('event.organizer.autoPlan', { min })}</span>
        </label>
      ` : ''}
      <button class="btn-secondary" data-organizer-action="edit">${t('event.organizer.edit')}</button>
      <button class="btn-outline-rust" data-organizer-action="cancel">${t('event.organizer.cancel')}</button>
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
      btn.textContent = text('common.saving');
      try {
        await handleInteraction({
          desired,
          currentLevel,
          eventId,
          commands,
          showToast,
          onSuccess: () => {
            showToast(text(desired === 'withdraw' ? 'event.action.done.withdrawn'
              : desired === 'confirmed' ? 'event.action.done.confirmed' : 'event.action.done.interested'));
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
      schedule.textContent = text('common.saving');
      try {
        await commands.scheduleEvent({ eventId: event.eventId });
        showToast(text('event.organizer.scheduled'));
        renderEventDetail(event.eventId);
      } catch (err) {
        showToast(errorText(err, 'event.organizer.scheduleFailed'));
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
        showToast(errorText(err, 'event.saveFailed'));
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
  if (interested + confirmed === 0) return t('event.cancel.impactNone');
  if (confirmed && interested) return t('event.cancel.impactBoth', { confirmed, interested });
  return confirmed
    ? t('event.cancel.impactConfirmed', { confirmed })
    : t('event.cancel.impactInterested', { interested });
}

function promptCancel(container, event) {
  // In-place prompt: text field + confirm/back.
  const controls = container.querySelector('.event-organizer-controls');
  if (!controls) return;
  controls.innerHTML = `
    <div class="organizer-controls-label">${t('event.cancel.title')}</div>
    <p class="profile-danger-warning">${cancelImpactLine(event)} ${t('event.cancel.noUndo')}</p>
    <label class="profile-field-label" for="cancelReason">${t('event.cancel.reason')}</label>
    <input class="profile-field-input" id="cancelReason" maxlength="200"
           placeholder="${attr('event.cancel.reasonPlaceholder')}">
    <div class="event-action-row" style="margin-top:12px;">
      <button class="btn-secondary" id="cancelAbort">${t('event.cancel.back')}</button>
      <button class="btn-outline-rust" id="cancelConfirm">${t('event.cancel.confirm')}</button>
    </div>
  `;
  document.getElementById('cancelAbort').addEventListener('click', () => renderEventDetail(event.eventId));
  document.getElementById('cancelConfirm').addEventListener('click', async (e) => {
    const reason = document.getElementById('cancelReason').value;
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = text('event.cancel.cancelling');
    try {
      await commands.cancelEvent({ eventId: event.eventId, reason });
      showToast(text('event.cancel.done'));
      renderEventDetail(event.eventId);
    } catch (err) {
      showToast(errorText(err, 'event.cancel.failed'));
      renderEventDetail(event.eventId);
    }
  });
}

const SOURCE_KEYS = {
  community: 'event.source.community',
  external: 'event.source.external',
  platform: 'event.source.platform',
};

// Event shape (D56) as one readable line — tags, then how structured,
// then which doors it opens. Never a score, just what it's like. The
// tags are the organizer's own words; the rest come from the bundle.
const STRUCTURE_KEYS = {
  structured: 'event.shape.structured',
  'semi-structured': 'event.shape.semiStructured',
  unstructured: 'event.shape.unstructured',
};
const DOOR_KEYS = {
  useful: 'event.shape.door.useful',
  'make-learn': 'event.shape.door.makeLearn',
  connect: 'event.shape.door.connect',
};
const label = (keys, value) => (keys[value] ? text(keys[value]) : value);

function describeShape(shape) {
  return [
    ...(shape.activityTags ?? []),
    shape.structure && label(STRUCTURE_KEYS, shape.structure),
    ...(shape.doors ?? []).map((d) => label(DOOR_KEYS, d)),
  ].filter(Boolean).join(' · ');
}

// A count shown in bold: {n} is the bold number, {count} picks the
// plural form.
function bold(count) {
  return { count, n: () => `<strong>${count}</strong>` };
}

function formatDateRange(startIso, endIso) {
  if (!startIso) return '—';
  const start = new Date(startIso);
  const startStr = date(start, 'eventStart');
  if (!endIso) return startStr;
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  const endStr = date(end, sameDay ? 'eventTime' : 'eventStart');
  return text('event.dateRange', { start: startStr, end: endStr });
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
