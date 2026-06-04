// ─── localStorage wrapper for in·real·life ───
//
// User identity + profile cache only. The prototype's RSVP / confirmation
// / attended / debrief layers used to live here too; those are now real
// events on the backend (see GET /events myLevel + myDebrief) and the
// local store no longer mirrors them.

const KEYS = {
  users: 'irl_users',
  activeUser: 'irl_active_user',
};

function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Users ───

export function getUsers() {
  return read(KEYS.users, []);
}

export function getUser(id) {
  return getUsers().find(u => u.id === id) || null;
}

export function saveUser(user) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) {
    users[idx] = user;
  } else {
    users.push(user);
  }
  write(KEYS.users, users);
  return user;
}

// ─── Update user profile fields ───

export function updateUserProfile(userId, fields) {
  const user = getUser(userId);
  if (!user) return null;
  const allowed = ['name', 'avatar', 'vibeMessage'];
  allowed.forEach(key => {
    if (fields[key] !== undefined) user[key] = fields[key];
  });
  return saveUser(user);
}

// ─── Append interview responses ───

export function addInterviewResponses(userId, newResponses) {
  const user = getUser(userId);
  if (!user) return null;
  if (!user.interviewResponses) user.interviewResponses = [];
  user.interviewResponses.push(...newResponses);
  return saveUser(user);
}

// ─── Active user ───

export function getActiveUserId() {
  return read(KEYS.activeUser, null);
}

export function getActiveUser() {
  const id = getActiveUserId();
  return id ? getUser(id) : null;
}

export function setActiveUser(id) {
  write(KEYS.activeUser, id);
}

export function clearActiveUser() {
  localStorage.removeItem(KEYS.activeUser);
}

// ─── Legacy cleanup ───
//
// Wipe the orphaned mock-era localStorage keys on next visit. One-time
// cleanup; safe to leave running indefinitely (no-op once removed).
try {
  for (const key of ['irl_rsvps', 'irl_confirmations', 'irl_attended', 'irl_debriefs']) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  }
} catch { /* ignore */ }
