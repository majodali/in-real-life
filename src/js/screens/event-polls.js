// Polls section on the event-detail screen.
//
// Organizer-initiated polls — 2-5 options with a single question. Anyone
// authenticated can vote (one choice per poll). Tallies + a horizontal
// bar per option are visible to everyone. Organizer can close the poll,
// optionally picking a winning option (the outcome).
//
// Lives below the suggestions section on a proposed event.

import { commands } from '../services.js';
import { showToast } from '../app.js';
import * as store from '../store.js';

const QUESTION_MAX = 200;
const LABEL_MAX = 60;

export async function renderPollsSection(container, event, { onChange } = {}) {
  const anchor = container.querySelector('#pollsSection');
  if (!anchor) return;

  const me = store.getActiveUser();
  const myId = me?.id;
  const iAmOrganizer = me && me.id === event.organizerId;

  let polls = [];
  let listError = null;
  try {
    const out = await commands.listPolls({ eventId: event.eventId });
    polls = out.polls ?? [];
  } catch (err) {
    listError = err?.message || 'Could not load polls.';
  }

  anchor.innerHTML = `
    <div class="suggestions-header">
      <div class="organizer-controls-label">Polls</div>
      <span class="suggestions-count">${polls.length}</span>
    </div>

    ${iAmOrganizer ? `
      <details class="poll-new-details">
        <summary class="poll-new-summary">+ Create a poll</summary>
        ${renderPollForm()}
      </details>
    ` : ''}

    <div class="polls-list">
      ${listError ? `<p class="suggestions-empty">${escapeHtml(listError)}</p>` : ''}
      ${!listError && polls.length === 0 ? `
        <p class="suggestions-empty">No polls yet${iAmOrganizer ? ' — start one to get input from people.' : '.'}</p>
      ` : ''}
      ${polls.map((p) => renderPoll(p, { iAmOrganizer, myId })).join('')}
    </div>
  `;

  if (iAmOrganizer) bindPollForm(anchor, event, onChange);
  bindPollActions(anchor, event, polls, { onChange, iAmOrganizer });
}

function renderPollForm() {
  return `
    <form id="pollForm" class="poll-form">
      <textarea class="profile-field-input suggest-textarea" id="pollQuestion"
                rows="2" maxlength="${QUESTION_MAX}"
                placeholder="What are you asking?"></textarea>
      <div class="poll-options" id="pollOptions">
        ${pollOptionInput(0)}
        ${pollOptionInput(1)}
      </div>
      <div class="poll-form-actions">
        <button type="button" class="suggest-link" id="pollAddOption">+ Add option</button>
        <button type="submit" class="btn-small" id="pollSubmit">Create poll</button>
      </div>
    </form>
  `;
}

function pollOptionInput(i) {
  return `
    <input class="profile-field-input poll-option-input" type="text"
           data-poll-option maxlength="${LABEL_MAX}"
           placeholder="Option ${i + 1}">
  `;
}

function renderPoll(p, { iAmOrganizer, myId }) {
  const isOpen = p.status === 'open';
  const total = p.totalVotes ?? 0;
  const outcomeLabel = p.outcome
    ? p.options.find((o) => o.id === p.outcome)?.label
    : null;

  const optionsHtml = p.options.map((o) => {
    const count = p.tallies?.[o.id] ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const isMine = p.myVote === o.id;
    const isOutcome = p.outcome === o.id;
    return `
      <button class="poll-option ${isMine ? 'poll-option-mine' : ''} ${isOutcome ? 'poll-option-outcome' : ''}"
              data-poll-action="${isMine ? 'retract' : 'vote'}"
              data-poll-id="${escapeAttr(p.pollId)}"
              data-option-id="${escapeAttr(o.id)}"
              ${isOpen ? '' : 'disabled'}>
        <span class="poll-option-bar" style="width: ${pct}%"></span>
        <span class="poll-option-content">
          <span class="poll-option-label">${escapeHtml(o.label)}</span>
          <span class="poll-option-stats">${count} · ${pct}%</span>
        </span>
      </button>
    `;
  }).join('');

  return `
    <div class="poll-card">
      <div class="poll-question">${escapeHtml(p.question)}</div>
      <div class="poll-meta">
        ${total} ${total === 1 ? 'vote' : 'votes'}
        ${isOpen ? '' : ` · <span class="suggest-status suggest-status-closed">closed</span>`}
        ${outcomeLabel ? ` · outcome: ${escapeHtml(outcomeLabel)}` : ''}
      </div>
      <div class="poll-options-list">${optionsHtml}</div>
      ${isOpen && iAmOrganizer ? `
        <div class="poll-actions">
          <button class="suggest-link" data-poll-action="close" data-poll-id="${escapeAttr(p.pollId)}">close poll</button>
          ${p.options.map((o) => `
            <button class="suggest-link" data-poll-action="close-with"
                    data-poll-id="${escapeAttr(p.pollId)}"
                    data-option-id="${escapeAttr(o.id)}">
              close with "${escapeHtml(o.label)}"
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function bindPollForm(anchor, event, onChange) {
  const form = anchor.querySelector('#pollForm');
  if (!form) return;
  const optionsContainer = anchor.querySelector('#pollOptions');
  const addBtn = anchor.querySelector('#pollAddOption');
  addBtn.addEventListener('click', () => {
    const current = optionsContainer.querySelectorAll('[data-poll-option]').length;
    if (current >= 5) {
      showToast('Up to 5 options.');
      return;
    }
    optionsContainer.insertAdjacentHTML('beforeend', pollOptionInput(current));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = anchor.querySelector('#pollQuestion').value.trim();
    if (!question) return showToast('Add a question.');
    const options = Array.from(anchor.querySelectorAll('[data-poll-option]'))
      .map((i) => i.value.trim())
      .filter(Boolean);
    if (options.length < 2) return showToast('At least 2 options.');

    const submit = anchor.querySelector('#pollSubmit');
    submit.disabled = true;
    submit.textContent = 'Creating…';
    try {
      await commands.makePoll({ eventId: event.eventId, question, options });
      showToast('Poll created.');
      onChange?.();
    } catch (err) {
      showToast(err?.message || 'Could not create the poll.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create poll';
    }
  });
}

function bindPollActions(anchor, event, polls, { onChange, iAmOrganizer }) {
  anchor.querySelectorAll('[data-poll-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.pollAction;
      const pollId = btn.dataset.pollId;
      const optionId = btn.dataset.optionId;
      try {
        if (action === 'vote') {
          await commands.castPollVote({ eventId: event.eventId, pollId, optionId });
        } else if (action === 'retract') {
          await commands.retractPollVote({ eventId: event.eventId, pollId });
        } else if (action === 'close') {
          if (!confirm('Close this poll? No more votes after this.')) return;
          await commands.closePoll({ eventId: event.eventId, pollId });
          showToast('Poll closed.');
        } else if (action === 'close-with') {
          const p = polls.find((x) => x.pollId === pollId);
          const opt = p?.options.find((o) => o.id === optionId);
          if (!opt) return;
          if (!confirm(`Close with "${opt.label}" as the outcome?`)) return;
          await commands.closePoll({ eventId: event.eventId, pollId, outcome: optionId });
          showToast('Poll closed.');
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
