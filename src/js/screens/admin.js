// ─── Admin / workshop screen ───
//
// Time controls (advance / set / reset) and notify-list browser. Gated to
// custom:role=admin claims; the backend re-verifies on every call. The
// time-action validation/dispatch lives in admin-handlers.js (unit-tested).

import { commands, auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleTimeAction } from './admin-handlers.js';

export function renderAdmin() {
  const claims = auth.getCurrentClaims();
  if (!claims) {
    navigate('signin');
    return;
  }
  if (claims['custom:role'] !== 'admin') {
    showToast('Admin only.');
    navigate('feed');
    return;
  }

  const container = document.getElementById('screen-admin');
  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-header-top">
        <button class="detail-back" id="adminBack">← Back</button>
      </div>
      <div class="profile-header-title">Admin · workshop</div>
    </div>
    <div class="profile-body">

      <div class="profile-card admin-card">
        <div class="admin-section-title">Workshop time</div>
        <div class="admin-time-display" id="adminTimeDisplay">Loading…</div>

        <div class="admin-time-row">
          <label class="profile-field-label" for="adminAdvanceHours">Advance hours</label>
          <div class="admin-inline-form">
            <input class="profile-field-input" id="adminAdvanceHours"
                   type="number" inputmode="numeric" step="1" placeholder="e.g. 6">
            <button class="btn-small" id="adminAdvanceHoursBtn">Advance</button>
          </div>
        </div>

        <div class="admin-time-row">
          <label class="profile-field-label" for="adminAdvanceDays">Advance days</label>
          <div class="admin-inline-form">
            <input class="profile-field-input" id="adminAdvanceDays"
                   type="number" inputmode="numeric" step="1" placeholder="e.g. 7">
            <button class="btn-small" id="adminAdvanceDaysBtn">Advance</button>
          </div>
        </div>

        <div class="admin-time-row">
          <label class="profile-field-label" for="adminSetDatetime">Set to a specific time</label>
          <div class="admin-inline-form">
            <input class="profile-field-input" id="adminSetDatetime" type="datetime-local">
            <button class="btn-small" id="adminSetBtn">Set</button>
          </div>
        </div>

        <div class="admin-time-row">
          <button class="btn-small admin-reset-btn" id="adminResetBtn">Reset to real time</button>
        </div>
      </div>

      <div class="profile-card admin-card">
        <div class="admin-section-title">Notify list</div>
        <div class="admin-notify-meta" id="adminNotifyMeta">Loading…</div>
        <div class="admin-notify-list" id="adminNotifyList"></div>
      </div>

    </div>
  `;

  document.getElementById('adminBack').addEventListener('click', () => {
    navigate('profile');
  });

  // Time controls
  bindTimeAction('adminAdvanceHoursBtn', () => ({
    action: 'advance',
    args: { hours: parseNumber(document.getElementById('adminAdvanceHours').value) },
  }));

  bindTimeAction('adminAdvanceDaysBtn', () => ({
    action: 'advance',
    args: { days: parseNumber(document.getElementById('adminAdvanceDays').value) },
  }));

  bindTimeAction('adminSetBtn', () => ({
    action: 'set',
    args: { datetime: toIsoDatetime(document.getElementById('adminSetDatetime').value) },
  }));

  bindTimeAction('adminResetBtn', () => ({ action: 'reset', args: {} }));

  // First loads
  refreshTimeDisplay();
  refreshNotifyList();
}

function bindTimeAction(btnId, makeRequest) {
  const btn = document.getElementById(btnId);
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Working…';
    try {
      const { action, args } = makeRequest();
      await handleTimeAction({
        action, args, commands, showToast,
        onSuccess: (result) => {
          renderTimeResult(result);
          refreshTimeDisplay();
        },
      });
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

async function refreshTimeDisplay() {
  const el = document.getElementById('adminTimeDisplay');
  if (!el) return;
  try {
    const t = await commands.getTime();
    renderTimeResult(t, el);
  } catch (err) {
    el.textContent = err?.message || 'Could not load time.';
  }
}

function renderTimeResult(result, el = document.getElementById('adminTimeDisplay')) {
  if (!el || !result) return;
  const sim = result.simulatedTime
    ? new Date(result.simulatedTime).toLocaleString()
    : null;
  const offsetMs = result.offsetMs ?? 0;
  const desc = result.description || (offsetMs === 0 ? 'real time' : '');
  el.innerHTML = sim
    ? `<strong>${escapeHtml(sim)}</strong><br><small>${escapeHtml(desc)}</small>`
    : `<strong>${escapeHtml(desc)}</strong>`;
}

async function refreshNotifyList() {
  const meta = document.getElementById('adminNotifyMeta');
  const list = document.getElementById('adminNotifyList');
  if (!meta || !list) return;
  try {
    const data = await commands.getNotifyList();
    const entries = data.entries || [];
    meta.textContent = entries.length === 0
      ? 'Nobody has signed up to be notified yet.'
      : `${entries.length} ${entries.length === 1 ? 'person' : 'people'} waiting.`;
    list.innerHTML = entries.map((e) => `
      <div class="admin-notify-row">
        <div class="admin-notify-email">${escapeHtml(e.email || '—')}</div>
        <div class="admin-notify-meta-line">
          <span>${escapeHtml(e.postalCode || '—')}${e.country ? ` · ${escapeHtml(e.country)}` : ''}</span>
          <span>${escapeHtml(formatDate(e.requestedAt))}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    meta.textContent = err?.message || 'Could not load the notify list.';
    list.innerHTML = '';
  }
}

function parseNumber(str) {
  if (str === '' || str == null) return undefined;
  const n = Number(str);
  return Number.isFinite(n) ? n : undefined;
}

// <input type="datetime-local"> emits "2026-06-01T12:00" (no timezone). Treat
// it as local time and convert to an ISO string the backend can parse.
function toIsoDatetime(localValue) {
  if (!localValue) return undefined;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
