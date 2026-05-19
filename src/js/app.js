// ─── App shell — routing + screen management ───

import * as store from './store.js';
import { renderFeed } from './screens/feed.js';
import { renderDetail } from './screens/detail.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderProfile } from './screens/profile.js';
import { renderDebrief } from './screens/debrief.js';
import { renderSignup } from './screens/signup.js';
import { renderConfirm } from './screens/confirm.js';
import { renderSignin } from './screens/signin.js';
import { renderWelcome } from './screens/welcome.js';
import { renderLocality } from './screens/locality.js';
import { renderLocation } from './screens/location.js';
import { renderAdmin } from './screens/admin.js';

const PUBLIC_SCREENS = new Set(['location', 'signup', 'confirm', 'signin', 'welcome', 'onboarding', 'locality']);

let currentScreen = null;

// ─── Toast ───

let toastTimer = null;

export function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ─── Routing ───

function parseHash() {
  const hash = window.location.hash.slice(1) || '';
  const parts = hash.split('/');
  return { screen: parts[0] || '', param: parts[1] || '' };
}

export function navigate(screen, param) {
  const hash = param ? `${screen}/${param}` : screen;
  window.location.hash = hash;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) {
    el.classList.add('active');
    currentScreen = id;
  }
}

function route() {
  const { screen, param } = parseHash();

  // If no active user and not on a public screen, redirect to dev page
  const activeUser = store.getActiveUser();
  if (!activeUser && !PUBLIC_SCREENS.has(screen)) {
    window.location.href = 'index.html';
    return;
  }

  switch (screen) {
    case 'location':
      showScreen('location');
      renderLocation();
      break;

    case 'signup':
      showScreen('signup');
      renderSignup(param);
      break;

    case 'confirm':
      showScreen('confirm');
      renderConfirm(param);
      break;

    case 'signin':
      showScreen('signin');
      renderSignin(param);
      break;

    case 'welcome':
      showScreen('welcome');
      renderWelcome();
      break;

    case 'onboarding':
      showScreen('onboarding');
      renderOnboarding();
      break;

    case 'locality':
      showScreen('locality');
      renderLocality();
      break;

    case 'detail':
      if (param) {
        showScreen('detail');
        renderDetail(param);
      } else {
        navigate('feed');
      }
      break;

    case 'debrief':
      if (param) {
        showScreen('debrief');
        renderDebrief(param);
      } else {
        navigate('feed');
      }
      break;

    case 'profile':
      showScreen('profile');
      renderProfile();
      break;

    case 'admin':
      showScreen('admin');
      renderAdmin();
      break;

    case 'feed':
    default:
      if (!activeUser) {
        window.location.href = 'index.html';
        return;
      }
      showScreen('feed');
      renderFeed();
      break;
  }
}

// ─── Init ───

export function init() {
  window.addEventListener('hashchange', route);
  route();
}
