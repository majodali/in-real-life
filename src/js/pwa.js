// ─── Installability wiring (design spec §5) ───
//
// Registers the service worker so the site can be installed to a home
// screen. Nothing here prompts: the install ask stays passive until
// evidence says members want it (spec §10 watch — G6 makes install
// valuable to *us*, which is exactly the pressure that produces
// nagging banners).
//
// Registration is best-effort. A browser without service workers, a
// private window that blocks them, or a file:// preview all fall
// through silently — the site works the same, it just cannot be
// installed.

export function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* install is a nice-to-have; never surface this to a member */
    });
  });
}

// True when the page is running as an installed web app. iOS needs the
// non-standard `standalone` flag. Push work (H8) will want this: on
// iOS the Push API only exists in this context.
export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || window.navigator.standalone === true;
}
