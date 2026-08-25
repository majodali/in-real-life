// ─── Workshop theme switching (docs/plans/ui-restyle.md) ───
//
// The July 2026 UI directions are implemented as themes over the
// existing class names, switchable at runtime so design reviews can
// flip between them in the running app. Workshop-only: production
// never renders the chip and always uses the default theme.
//
// Selection: `?theme=<id>` in the URL wins (shareable review links),
// then the per-tab choice (sessionStorage — same isolation as
// workshop identity), then the default. Switching updates the URL via
// replaceState so the current view is always shareable as seen.

import { WORKSHOP_MODE } from './config.js';

// Themes the switcher offers. `current` is the shipped UI and the
// default everywhere; directions are appended here as they land.
export const THEMES = [
  { id: 'current', label: 'Current' },
  { id: 'morning-linen', label: 'Morning Linen' },
];

const STORAGE_KEY = 'irl_theme';

function validTheme(id) {
  return THEMES.some((t) => t.id === id) ? id : null;
}

function storedTheme() {
  try { return validTheme(sessionStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

function urlTheme() {
  return validTheme(new URLSearchParams(window.location.search).get('theme'));
}

export function applyTheme(id) {
  const theme = validTheme(id) ?? 'current';
  if (theme === 'current') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  try { sessionStorage.setItem(STORAGE_KEY, theme); } catch { /* private mode */ }
  const url = new URL(window.location.href);
  if (theme === 'current') url.searchParams.delete('theme');
  else url.searchParams.set('theme', theme);
  history.replaceState(null, '', url);
  const chip = document.getElementById('theme-chip');
  if (chip) {
    chip.textContent = `◐ ${THEMES.find((t) => t.id === theme).label}`;
  }
  return theme;
}

export function initTheme() {
  if (!WORKSHOP_MODE) return; // prod: default theme, no chip, ?theme= ignored

  const chip = document.createElement('button');
  chip.id = 'theme-chip';
  chip.className = 'theme-chip';
  chip.type = 'button';
  chip.title = 'Switch design (workshop only)';
  document.body.appendChild(chip);

  let active = applyTheme(urlTheme() ?? storedTheme() ?? 'current');
  chip.addEventListener('click', () => {
    const idx = THEMES.findIndex((t) => t.id === active);
    active = applyTheme(THEMES[(idx + 1) % THEMES.length].id);
  });
}
