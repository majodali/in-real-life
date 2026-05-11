// ─── localStorage wrapper for in·real·life ───

const KEYS = {
  users: 'irl_users',
  activeUser: 'irl_active_user',
  rsvps: 'irl_rsvps',
  confirmations: 'irl_confirmations',
  attended: 'irl_attended',
  debriefs: 'irl_debriefs',
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

// ─── RSVPs ───

export function getRsvps(userId) {
  const all = read(KEYS.rsvps, {});
  return all[userId] || [];
}

export function isRsvped(userId, eventId) {
  return getRsvps(userId).includes(eventId);
}

export function toggleRsvp(userId, eventId) {
  const all = read(KEYS.rsvps, {});
  const list = all[userId] || [];
  const idx = list.indexOf(eventId);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(eventId);
  }
  all[userId] = list;
  write(KEYS.rsvps, all);
  return idx < 0; // true = now rsvped
}

// ─── Confirmations ───

export function getConfirmations(userId) {
  const all = read(KEYS.confirmations, {});
  return all[userId] || [];
}

export function isConfirmed(userId, eventId) {
  return getConfirmations(userId).includes(eventId);
}

export function confirmEvent(userId, eventId) {
  const all = read(KEYS.confirmations, {});
  const list = all[userId] || [];
  if (!list.includes(eventId)) {
    list.push(eventId);
  }
  all[userId] = list;
  write(KEYS.confirmations, all);
}

// ─── Attended ───

export function isAttended(userId, eventId) {
  const all = read(KEYS.attended, {});
  return (all[userId] || []).includes(eventId);
}

export function markAttended(userId, eventId) {
  const all = read(KEYS.attended, {});
  const list = all[userId] || [];
  if (!list.includes(eventId)) {
    list.push(eventId);
  }
  all[userId] = list;
  write(KEYS.attended, all);
}

// ─── Debriefs ───

export function getDebrief(userId, eventId) {
  const all = read(KEYS.debriefs, {});
  return all[userId]?.[eventId] || null;
}

export function hasDebriefed(userId, eventId) {
  return !!getDebrief(userId, eventId);
}

export function saveDebrief(userId, eventId, debrief) {
  const all = read(KEYS.debriefs, {});
  if (!all[userId]) all[userId] = {};
  all[userId][eventId] = {
    ...debrief,
    timestamp: new Date().toISOString(),
  };
  write(KEYS.debriefs, all);
}

