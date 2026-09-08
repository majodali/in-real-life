// ─── Theme switching (docs/ui-themes.md) ───
//
// The July 2026 UI directions are implemented as themes over the
// existing class names. Morning Linen is the default identity (set
// statically as data-theme on each page, so there is no flash and no
// JS dependency); this module only handles *switching*.
//
// Storage: the choice is a personalization, so it lives in
// localStorage — it follows the person across tabs and reloads, and
// the same key is what a future member-facing appearance setting
// (backlog: member-selectable dark theme) will write. A `?theme=`
// parameter still works as a one-shot override for shared review
// links; applying it writes the choice to localStorage and drops the
// parameter from the URL.
//
// The switcher chip is workshop-only. This module reads the injected
// config flag directly rather than importing config.js, so it also
// runs on the public pages (index/terms), which carry only the
// workshop flag and not the full API config.

export const DEFAULT_THEME = 'morning-linen';

// Themes the switcher offers. Grove is the named original identity —
// the un-attributed baseline styles. Lantern is the future
// member-selectable dark theme (backlog). `fontsHref` lazily loads
// faces the base app doesn't ship (Pebble's Fraunces).
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

const STORAGE_KEY = 'irl_theme';

const workshopMode = () =>
  (typeof globalThis !== 'undefined' && globalThis.__IRL_CONFIG__?.workshopMode) === true;

function validTheme(id) {
  return THEMES.some((t) => t.id === id) ? id : null;
}

function storedTheme() {
  try { return validTheme(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

function urlTheme() {
  return validTheme(new URLSearchParams(window.location.search).get('theme'));
}

function ensureFonts(theme) {
  if (!theme?.fontsHref) return;
  const id = `theme-fonts-${theme.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = theme.fontsHref;
  document.head.appendChild(link);
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
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* private mode */ }
  // The stored choice is the state now — keep the URL clean.
  const url = new URL(window.location.href);
  if (url.searchParams.has('theme')) {
    url.searchParams.delete('theme');
    history.replaceState(null, '', url);
  }
  const chip = document.getElementById('theme-chip');
  if (chip) chip.textContent = `◐ ${THEMES.find((t) => t.id === theme).label}`;
  return theme;
}

// Apply the stored/overridden choice. Runs on every page (including
// the public ones) so a chosen theme is consistent site-wide; the
// chip is added on workshop stacks only.
export function initTheme() {
  let active = applyTheme(urlTheme() ?? storedTheme() ?? DEFAULT_THEME);
  if (!workshopMode()) return; // prod: no switcher chip

  const chip = document.createElement('button');
  chip.id = 'theme-chip';
  chip.className = 'theme-chip';
  chip.type = 'button';
  chip.title = 'Switch design (workshop only)';
  chip.textContent = `◐ ${THEMES.find((t) => t.id === active).label}`;
  document.body.appendChild(chip);

  chip.addEventListener('click', () => {
    const idx = THEMES.findIndex((t) => t.id === active);
    active = applyTheme(THEMES[(idx + 1) % THEMES.length].id);
  });
}
