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

// Themes the switcher offers. Morning Linen is the default everywhere
// (U9; app.html sets data-theme="morning-linen" statically so prod
// needs no JS for it). Grove is the named original identity — the
// un-attributed baseline styles — retained for comparison. Lantern is
// the future member-selectable dark theme (backlog). `fontsHref`
// lazily loads faces the base app doesn't ship (Pebble's Fraunces)
// the first time the theme is applied.
export const DEFAULT_THEME = 'morning-linen';

export const THEMES = [
  { id: 'morning-linen', label: 'Morning Linen' },
  { id: 'grove', label: 'Grove' },
  { id: 'lantern', label: 'Lantern' },
  {
    id: 'pebble',
    label: 'Pebble',
    fontsHref: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400&display=swap',
  },
];

function ensureFonts(theme) {
  if (!theme.fontsHref) return;
  const id = `theme-fonts-${theme.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = theme.fontsHref;
  document.head.appendChild(link);
}

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
  const theme = validTheme(id) ?? DEFAULT_THEME;
  ensureFonts(THEMES.find((t) => t.id === theme));
  if (theme === 'grove') {
    // Grove IS the un-attributed baseline stylesheet.
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  try { sessionStorage.setItem(STORAGE_KEY, theme); } catch { /* private mode */ }
  const url = new URL(window.location.href);
  if (theme === DEFAULT_THEME) url.searchParams.delete('theme');
  else url.searchParams.set('theme', theme);
  history.replaceState(null, '', url);
  const chip = document.getElementById('theme-chip');
  if (chip) {
    chip.textContent = `◐ ${THEMES.find((t) => t.id === theme).label}`;
  }
  return theme;
}

export function initTheme() {
  if (!WORKSHOP_MODE) return; // prod: static default theme, no chip, ?theme= ignored

  const chip = document.createElement('button');
  chip.id = 'theme-chip';
  chip.className = 'theme-chip';
  chip.type = 'button';
  chip.title = 'Switch design (workshop only)';
  document.body.appendChild(chip);

  let active = applyTheme(urlTheme() ?? storedTheme() ?? DEFAULT_THEME);
  chip.addEventListener('click', () => {
    const idx = THEMES.findIndex((t) => t.id === active);
    active = applyTheme(THEMES[(idx + 1) % THEMES.length].id);
  });
}
