// ─── Reusable card-based interview engine ───
//
// Usage:
//   startInterview(container, {
//     questions,      // array of question objects from data.js
//     onComplete,     // callback(responses[]) when all questions answered
//     onCancel,       // callback() if user backs out
//     existingName,   // skip name question if provided (for repeat interviews)
//     showProgress,   // show progress dots (default true)
//   })

let state = {
  questions: [],
  responses: [],  // { questionId, questionText, response, timestamp }
  currentIndex: 0,
  container: null,
  onComplete: null,
  onCancel: null,
  existingName: null,
  showProgress: true,
};

export function startInterview(container, opts) {
  let questions = opts.questions;

  // Skip name question if existingName provided
  if (opts.existingName) {
    questions = questions.filter(q => q.type !== 'name');
  }

  state = {
    questions,
    responses: [],
    currentIndex: 0,
    container,
    onComplete: opts.onComplete || (() => {}),
    onCancel: opts.onCancel || (() => {}),
    existingName: opts.existingName || null,
    showProgress: opts.showProgress !== false,
  };

  renderCard();
}

function renderCard() {
  const { questions, currentIndex, container, showProgress } = state;
  const q = questions[currentIndex];
  const total = questions.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;

  // Get existing response if user is navigating back
  const existing = state.responses[currentIndex]?.response || '';

  container.innerHTML = `
    <div class="interview-card" data-direction="forward">
      ${showProgress ? `
        <div class="interview-progress">
          ${questions.map((_, i) => `<div class="progress-dot ${i === currentIndex ? 'active' : i < currentIndex ? 'done' : ''}"></div>`).join('')}
        </div>
      ` : ''}

      <div class="interview-content">
        <h2 class="interview-question">${q.text}</h2>
        ${q.subtext ? `<p class="interview-subtext">${q.subtext}</p>` : ''}

        <div class="interview-input-area">
          ${renderInput(q, existing)}
        </div>

        ${q.helpers ? `
          <div class="interview-helpers" id="helpersSection">
            <button class="helpers-toggle" id="helpersToggle">
              \u{1F4A1} Need a prompt?
            </button>
            <div class="helpers-list" id="helpersList" style="display:none">
              ${q.helpers.map(h => `<div class="helper-item">${h}</div>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="interview-nav">
        ${isFirst && !state.existingName
          ? `<button class="interview-nav-btn cancel" id="navCancel">Cancel</button>`
          : `<button class="interview-nav-btn back" id="navBack">\u2190 Back</button>`
        }
        <div class="interview-nav-spacer"></div>
        ${q.skippable ? `<button class="interview-nav-btn skip" id="navSkip">Skip</button>` : ''}
        <button class="interview-nav-btn next" id="navNext" ${!existing && q.type !== 'name' ? '' : ''}>
          ${isLast ? 'Done' : 'Next \u2192'}
        </button>
      </div>
    </div>
  `;

  bindEvents(q, isFirst, isLast);
}

function renderInput(q, existing) {
  switch (q.type) {
    case 'name':
      return `
        <input
          class="interview-text-input"
          id="interviewInput"
          type="text"
          placeholder="Your first name"
          value="${escapeHtml(existing)}"
          autocomplete="off"
          maxlength="30"
        >
      `;

    case 'text':
    default:
      return `
        <textarea
          class="interview-textarea"
          id="interviewInput"
          placeholder="Type your answer here..."
          rows="4"
        >${escapeHtml(existing)}</textarea>
      `;
  }
}

function bindEvents(q, isFirst, isLast) {
  const input = document.getElementById('interviewInput');
  const nextBtn = document.getElementById('navNext');
  const backBtn = document.getElementById('navBack');
  const cancelBtn = document.getElementById('navCancel');
  const skipBtn = document.getElementById('navSkip');
  const helpersToggle = document.getElementById('helpersToggle');
  const helpersList = document.getElementById('helpersList');

  // Focus input
  if (input) {
    setTimeout(() => input.focus(), 100);
  }

  // Auto-grow textarea
  if (input && input.tagName === 'TEXTAREA') {
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.max(input.scrollHeight, 100) + 'px';
    });
  }

  // Enter key on name input
  if (q.type === 'name' && input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goNext(q, isLast);
    });
  }

  // Next
  if (nextBtn) {
    nextBtn.addEventListener('click', () => goNext(q, isLast));
  }

  // Back
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      saveCurrentResponse(q);
      state.currentIndex--;
      renderCard();
    });
  }

  // Cancel
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => state.onCancel());
  }

  // Skip
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      // Save empty response for skipped
      state.responses[state.currentIndex] = {
        questionId: q.id,
        questionText: q.text,
        response: '',
        timestamp: new Date().toISOString(),
        skipped: true,
      };
      if (isLast) {
        finish();
      } else {
        state.currentIndex++;
        renderCard();
      }
    });
  }

  // Helpers toggle
  if (helpersToggle && helpersList) {
    helpersToggle.addEventListener('click', () => {
      const visible = helpersList.style.display !== 'none';
      helpersList.style.display = visible ? 'none' : 'flex';
      helpersToggle.textContent = visible ? '\u{1F4A1} Need a prompt?' : '\u{1F4A1} Hide prompts';
    });
  }
}

function goNext(q, isLast) {
  const input = document.getElementById('interviewInput');
  const value = input ? input.value.trim() : '';

  // Require input for name, optional for others
  if (q.type === 'name' && !value) {
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 400);
    return;
  }

  saveCurrentResponse(q);

  if (isLast) {
    finish();
  } else {
    state.currentIndex++;
    renderCard();
  }
}

function saveCurrentResponse(q) {
  const input = document.getElementById('interviewInput');
  const value = input ? input.value.trim() : '';
  state.responses[state.currentIndex] = {
    questionId: q.id,
    questionText: q.text,
    response: value,
    timestamp: new Date().toISOString(),
  };
}

function finish() {
  // Filter out empty/skipped responses (keep them in array but onComplete gets all)
  const responses = state.responses.filter(r => r);
  state.onComplete(responses);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
