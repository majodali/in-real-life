// ─── The operator console (docs/admin-and-support.md, D64) ───
//
// In-app, role-gated panels: Workshop (time; seed arrives next slice),
// Members (verification queue + lookup), Registers (read-only views),
// Health, Policy (agreement + notify). Gated to custom:role=admin
// claims; the backend re-verifies on every call. Time-action
// validation/dispatch lives in admin-handlers.js (unit-tested).

import { commands, auth } from '../services.js';
import { navigate, showToast } from '../app.js';
import { handleTimeAction } from './admin-handlers.js';
import { loadLocalities } from '../localities.js';

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
        <div class="admin-section-title">Members · verification queue</div>
        <div class="admin-notify-meta" id="adminQueueMeta">Loading…</div>
        <div class="admin-notify-list" id="adminQueueList"></div>
      </div>

      <div class="profile-card admin-card">
        <div class="admin-section-title">Members · lookup</div>
        <div class="admin-inline-form">
          <input class="profile-field-input" id="adminLookupEmail" type="email"
                 placeholder="member email">
          <button class="btn-small" id="adminLookupBtn">Find</button>
        </div>
        <div class="admin-notify-list" id="adminLookupResult"></div>
      </div>

      <div class="profile-card admin-card">
        <div class="admin-section-title">Registers · read-only</div>
        <p class="auth-subtext">
          Curation stays in code until the strawman posture is revisited;
          this is the future editor's slot.
        </p>
        <div class="admin-notify-meta" id="adminRegisters">Loading…</div>
      </div>

      <div class="profile-card admin-card">
        <div class="admin-section-title">Health</div>
        <div class="admin-notify-meta" id="adminHealth">Loading…</div>
      </div>

      <div class="profile-card admin-card">
        <div class="admin-section-title">Required agreement version</div>
        <p class="auth-subtext">
          Bumping this asks every member on an older version to re-accept the
          Terms of Use at their next sign-in. Update terms.html first.
        </p>
        <div class="admin-time-row">
          <div class="admin-inline-form">
            <input class="profile-field-input" id="adminAgreementVersion"
                   type="text" placeholder="e.g. v2" maxlength="10">
            <button class="btn-small" id="adminAgreementVersionBtn">Set required</button>
          </div>
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

  // Required agreement version
  const versionBtn = document.getElementById('adminAgreementVersionBtn');
  versionBtn.addEventListener('click', async () => {
    const version = document.getElementById('adminAgreementVersion').value.trim();
    versionBtn.disabled = true;
    try {
      const result = await commands.setRequiredAgreementVersion({ version });
      showToast(`Required agreement version is now ${result.requiredAgreementVersion}.`);
    } catch (err) {
      showToast(err?.message || 'Could not update the required version.');
    } finally {
      versionBtn.disabled = false;
    }
  });

  // Members · lookup
  const lookupBtn = document.getElementById('adminLookupBtn');
  lookupBtn.addEventListener('click', async () => {
    const email = document.getElementById('adminLookupEmail').value.trim();
    const out = document.getElementById('adminLookupResult');
    if (!email) return;
    lookupBtn.disabled = true;
    try {
      const { member } = await commands.findMember({ email });
      out.innerHTML = `
        <div class="admin-notify-row">
          <div class="admin-notify-email">${escapeHtml(member.name || '—')} · ${escapeHtml(member.email)}</div>
          <div class="admin-notify-meta-line">
            <span>${member.localityVerified ? 'verified' : 'not verified'}${member.activatedAt ? ' · active' : ''}${member.onboardingCompletedAt ? ' · onboarded' : ''}</span>
            <span>agreement ${escapeHtml(member.agreementVersion || '—')}</span>
          </div>
        </div>`;
    } catch (err) {
      out.innerHTML = `<div class="admin-notify-row">${escapeHtml(err?.message || 'Lookup failed.')}</div>`;
    } finally {
      lookupBtn.disabled = false;
    }
  });

  // First loads
  refreshTimeDisplay();
  refreshNotifyList();
  refreshVerificationQueue();
  refreshRegisters();
  refreshHealth();
}

async function refreshVerificationQueue() {
  const meta = document.getElementById('adminQueueMeta');
  const list = document.getElementById('adminQueueList');
  if (!meta || !list) return;
  try {
    const { pending } = await commands.getVerificationQueue();
    meta.textContent = pending.length === 0
      ? 'No pending verification requests.'
      : `${pending.length} waiting.`;
    list.innerHTML = pending.map((p) => `
      <div class="admin-notify-row" data-user="${escapeHtml(p.userId)}">
        <div class="admin-notify-email">${escapeHtml(p.name || '—')} · ${escapeHtml(p.email || '—')}</div>
        <div class="admin-notify-meta-line">
          <span>${escapeHtml(p.city || '—')} ${escapeHtml(p.postalCode || '')}</span>
          <span>${escapeHtml(formatDate(p.localityRequestedAt))}</span>
        </div>
        <div class="admin-notify-meta-line">
          <span></span>
          <button class="btn-small" data-verify="${escapeHtml(p.userId)}">Verify</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-verify]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Verifying…';
        try {
          await commands.adminVerifyLocality({ userId: btn.dataset.verify });
          showToast('Verified and activated.');
          refreshVerificationQueue();
        } catch (err) {
          showToast(err?.message || 'Could not verify.');
          btn.disabled = false;
          btn.textContent = 'Verify';
        }
      });
    });
  } catch (err) {
    meta.textContent = err?.message || 'Could not load the queue.';
    list.innerHTML = '';
  }
}

async function refreshRegisters() {
  const el = document.getElementById('adminRegisters');
  if (!el) return;
  try {
    const [register, types] = await Promise.all([
      loadLocalities({ commands }),
      commands.getEventTypes(),
    ]);
    const localities = [...register.byId.values()]
      .map((l) => `${l.name}${l.served ? ' (served)' : ''}`).join(' · ');
    const kinds = (types.eventTypes ?? [])
      .map((t) => `${t.name} [${t.family}]`).join(' · ');
    el.innerHTML = `
      <strong>Localities</strong><br>${escapeHtml(localities)}<br><br>
      <strong>Event types</strong><br>${escapeHtml(kinds)}`;
  } catch (err) {
    el.textContent = err?.message || 'Could not load the registers.';
  }
}

async function refreshHealth() {
  const el = document.getElementById('adminHealth');
  if (!el) return;
  try {
    const h = await commands.getAdminHealth();
    const dlq = h.projector?.ok
      ? `DLQ depth ${h.projector.dlqDepth ?? '—'}${h.projector.dlqDepth > 0 ? ' ⚠' : ''}`
      : `projector probe failed: ${h.projector?.error ?? '—'}`;
    const cfg = h.config?.ok
      ? `agreement ${h.config.requiredAgreementVersion ?? '—'} · sim ${formatDate(h.config.simulatedTime)}`
      : `config probe failed: ${h.config?.error ?? '—'}`;
    const counts = h.storePulse?.ok
      ? Object.entries(h.storePulse.approximateItemCounts ?? {})
        .map(([k, v]) => `${k} ${v ?? '—'}`).join(' · ')
      : `store probe failed: ${h.storePulse?.error ?? '—'}`;
    el.innerHTML = `
      <strong>${escapeHtml(h.stage)} · ${escapeHtml(h.mode)}</strong><br>
      ${escapeHtml(dlq)}<br>${escapeHtml(cfg)}<br>
      <small>${escapeHtml(counts)} (approximate)</small>`;
  } catch (err) {
    el.textContent = err?.message || 'Could not load health.';
  }
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
