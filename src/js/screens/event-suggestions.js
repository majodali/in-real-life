// Suggestions section on the event-detail screen.
//
// Renders the list of suggestions for a proposed event, a form to add a
// new one, support/object vote buttons, and organizer actions (respond,
// adopt, reject). Hidden when the event isn't proposed anymore.

import { commands } from '../services.js';
import { showToast } from '../app.js';
import * as store from '../store.js';

const TEXT_MAX = 200;

export async function renderSuggestionsSection(container, event, { onChange } = {}) {
  // Anchor: a child div #suggestionsSection inside the event card.
  const anchor = container.querySelector('#suggestionsSection');
  if (!anchor) return;

  const me = store.getActiveUser();
  const myId = me?.id;
  const iAmOrganizer = me && me.id === event.organizerId;

  let suggestions = [];
  let listError = null;
  try {
    const out = await commands.listSuggestions({ eventId: event.eventId });
    suggestions = out.suggestions ?? [];
  } catch (err) {
    listError = err?.message || 'Could not load suggestions.';
  }

  const isPlanned = event.lifecycleState === 'planned';
  anchor.innerHTML = `
    <div class="suggestions-header">
      <div class="organizer-controls-label">${isPlanned ? 'Suggest a change' : 'Suggestions'}</div>
      <span class="suggestions-count">${suggestions.length}</span>
    </div>
    <p class="suggestions-hint">
      ${isPlanned
        ? 'It\'s planned, but if something would make it better — or you can\'t make it as-is — say so. Tag time or place if it applies.'
        : 'Free-form. Tag time or place to help the organizer scan. Be brief.'}
    </p>

    <form id="suggestForm" class="suggest-form">
      <textarea class="profile-field-input suggest-textarea" id="suggestText"
                maxlength="${TEXT_MAX}" rows="2"
                placeholder="What would you suggest?"></textarea>
      <div class="suggest-tag-row">
        <label class="suggest-tag-chip">
          <input type="checkbox" data-tag="time"> <span>time</span>
        </label>
        <label class="suggest-tag-chip">
          <input type="checkbox" data-tag="place"> <span>place</span>
        </label>
        <div class="suggest-char-count" id="suggestChars">${TEXT_MAX}</div>
        <button class="btn-small" type="submit" id="suggestSubmit">Add</button>
      </div>
    </form>

    <div class="suggestions-list" id="suggestionsList">
      ${listError ? `<p class="suggestions-empty">${escapeHtml(listError)}</p>` : ''}
      ${!listError && suggestions.length === 0 ? `
        <p class="suggestions-empty">No suggestions yet. Be the first to nudge something.</p>
      ` : ''}
      ${suggestions.map((s) => renderSuggestion(s, { iAmOrganizer, myId })).join('')}
    </div>
  `;

  bindSuggestionForm(anchor, event, onChange);
  bindSuggestionRows(anchor, event, suggestions, { onChange, iAmOrganizer, myId });
}

function renderSuggestion(s, { iAmOrganizer, myId }) {
  const tags = (s.tags || []).map((t) => `<span class="suggest-tag suggest-tag-${escapeAttr(t)}">${escapeHtml(t)}</span>`).join('');
  const statusBadge = s.status === 'open' ? '' : `<span class="suggest-status suggest-status-${escapeAttr(s.status)}">${escapeHtml(s.status)}</span>`;
  const isAuthor = myId === s.byUserId;
  const isOpen = s.status === 'open';

  const supportClass = s.myVote === 'support' ? 'voted' : '';
  const objectClass = s.myVote === 'object' ? 'voted' : '';

  const orgResponse = s.organizerResponse
    ? `<div class="suggest-response">
         <span class="suggest-response-label">Organizer</span>
         <span class="suggest-response-text">${escapeHtml(s.organizerResponse)}</span>
       </div>`
    : '';

  const rejectionReason = s.status === 'rejected' && s.rejectionReason
    ? `<div class="suggest-response">
         <span class="suggest-response-label">Reason</span>
         <span class="suggest-response-text">${escapeHtml(s.rejectionReason)}</span>
       </div>`
    : '';

  // Actions row depends on role and status.
  const actions = isOpen ? `
    <div class="suggest-actions">
      <button class="suggest-vote ${supportClass}" data-suggest-action="support" data-id="${escapeAttr(s.suggestionId)}">
        ✓ ${s.supportCount ?? 0}
      </button>
      <button class="suggest-vote ${objectClass}" data-suggest-action="object" data-id="${escapeAttr(s.suggestionId)}">
        ✗ ${s.objectCount ?? 0}
      </button>
      ${s.myVote ? `
        <button class="suggest-link" data-suggest-action="retract" data-id="${escapeAttr(s.suggestionId)}">retract my vote</button>
      ` : ''}
      ${isAuthor ? `<button class="suggest-link" data-suggest-action="withdraw" data-id="${escapeAttr(s.suggestionId)}">withdraw</button>` : ''}
      ${iAmOrganizer ? `
        <button class="suggest-link" data-suggest-action="respond" data-id="${escapeAttr(s.suggestionId)}">${s.organizerResponse ? 'edit response' : 'respond'}</button>
        <button class="suggest-link" data-suggest-action="adopt" data-id="${escapeAttr(s.suggestionId)}">adopt</button>
        <button class="suggest-link suggest-link-warn" data-suggest-action="reject" data-id="${escapeAttr(s.suggestionId)}">reject</button>
      ` : ''}
    </div>
  ` : '';

  return `
    <div class="suggest-row" data-suggest-row="${escapeAttr(s.suggestionId)}">
      <div class="suggest-meta">
        <span class="suggest-author">${escapeHtml(s.byUserName || 'someone')}</span>
        ${tags}
        ${statusBadge}
      </div>
      <p class="suggest-text">${escapeHtml(s.text)}</p>
      ${orgResponse}
      ${rejectionReason}
      ${actions}
    </div>
  `;
}

function bindSuggestionForm(anchor, event, onChange) {
  const form = anchor.querySelector('#suggestForm');
  const textarea = anchor.querySelector('#suggestText');
  const counter = anchor.querySelector('#suggestChars');
  textarea.addEventListener('input', () => {
    counter.textContent = TEXT_MAX - textarea.value.length;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text) return showToast('Add some words first.');
    const tags = Array.from(form.querySelectorAll('[data-tag]'))
      .filter((c) => c.checked)
      .map((c) => c.dataset.tag);

    const submit = form.querySelector('#suggestSubmit');
    submit.disabled = true;
    submit.textContent = 'Adding…';
    try {
      await commands.makeSuggestion({ eventId: event.eventId, text, tags });
      showToast('Added.');
      onChange?.();
    } catch (err) {
      showToast(err?.message || 'Could not add that. Try again.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Add';
    }
  });
}

function bindSuggestionRows(anchor, event, suggestions, { onChange, iAmOrganizer, myId }) {
  anchor.querySelectorAll('[data-suggest-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.suggestAction;
      const suggestionId = btn.dataset.id;
      const s = suggestions.find((x) => x.suggestionId === suggestionId);
      if (!s) return;
      try {
        if (action === 'support' || action === 'object') {
          if (s.myVote === action) {
            await commands.retractSuggestionVote({ eventId: event.eventId, suggestionId });
          } else {
            await commands.voteOnSuggestion({ eventId: event.eventId, suggestionId, vote: action });
          }
        } else if (action === 'retract') {
          await commands.retractSuggestionVote({ eventId: event.eventId, suggestionId });
        } else if (action === 'withdraw') {
          await commands.setSuggestionStatus({ eventId: event.eventId, suggestionId, status: 'withdrawn' });
        } else if (action === 'adopt') {
          await commands.setSuggestionStatus({ eventId: event.eventId, suggestionId, status: 'adopted' });
          showToast('Adopted.');
        } else if (action === 'reject') {
          const reason = prompt('Optional reason (≤200 chars):') ?? '';
          await commands.setSuggestionStatus({ eventId: event.eventId, suggestionId, status: 'rejected', reason });
          showToast('Rejected.');
        } else if (action === 'respond') {
          const response = prompt('Your response (≤200 chars):', s.organizerResponse ?? '');
          if (response == null) return;
          await commands.setSuggestionResponse({ eventId: event.eventId, suggestionId, response });
        }
        onChange?.();
      } catch (err) {
        showToast(err?.message || 'Could not save that.');
      }
    });
  });
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
