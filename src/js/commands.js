// Command wrappers around the API client.
//
// Each command persists its commandId in storage on first attempt and
// clears it on success. If the call throws, the commandId stays so the
// next attempt reuses it — that way a network blip becomes a cache hit
// at the backend's idempotency table instead of a duplicate event.

import { AGREEMENT_VERSION } from './agreement.js';

const REGISTER_KEY = 'irl_cmd_register';
const PROFILE_KEY = 'irl_cmd_profile';
const PROFILE_UPDATE_KEY = 'irl_cmd_profile_update';
const LOCALITY_KEY = 'irl_cmd_locality';
const NOTIFY_KEY = 'irl_cmd_notify';

export function createCommands({
  api,
  storage = globalThis.localStorage,
  makeId = () => globalThis.crypto.randomUUID(),
}) {
  function getOrMakeCommandId(key) {
    let id = storage.getItem(key);
    if (!id) {
      id = makeId();
      storage.setItem(key, id);
    }
    return id;
  }

  async function register({ agreementVersion = AGREEMENT_VERSION } = {}) {
    const commandId = getOrMakeCommandId(REGISTER_KEY);
    const result = await api.post('/me/register', { commandId, agreementVersion });
    storage.removeItem(REGISTER_KEY);
    return result;
  }

  async function createProfile({
    name,
    avatar,
    vibeMessage = '',
    interviewResponses = [],
  }) {
    const commandId = getOrMakeCommandId(PROFILE_KEY);
    const body = { commandId, name, vibeMessage, interviewResponses };
    if (avatar !== undefined) body.avatar = avatar;
    const result = await api.post('/me/profile', body);
    storage.removeItem(PROFILE_KEY);
    return result;
  }

  async function updateProfile({ name, avatar, vibeMessage } = {}) {
    const commandId = getOrMakeCommandId(PROFILE_UPDATE_KEY);
    const body = { commandId };
    if (name !== undefined) body.name = name;
    if (avatar !== undefined) body.avatar = avatar;
    if (vibeMessage !== undefined) body.vibeMessage = vibeMessage;
    const result = await api.put('/me/profile', body);
    storage.removeItem(PROFILE_UPDATE_KEY);
    return result;
  }

  async function verifyLocality({ city, postalCode, country }) {
    const commandId = getOrMakeCommandId(LOCALITY_KEY);
    const body = { commandId, city };
    if (postalCode !== undefined) body.postalCode = postalCode;
    if (country !== undefined) body.country = country;
    const result = await api.post('/me/locality', body);
    storage.removeItem(LOCALITY_KEY);
    return result;
  }

  async function checkLocality({ postalCode }) {
    return await api.get(`/locality/check?postalCode=${encodeURIComponent(postalCode)}`);
  }

  async function exportData() {
    return await api.get('/me/export');
  }

  async function requestNotify({ email, postalCode, country }) {
    const commandId = getOrMakeCommandId(NOTIFY_KEY);
    const body = { commandId, email, postalCode };
    if (country !== undefined) body.country = country;
    const result = await api.post('/notify', body);
    storage.removeItem(NOTIFY_KEY);
    return result;
  }

  return {
    register,
    createProfile,
    updateProfile,
    verifyLocality,
    checkLocality,
    requestNotify,
    exportData,
  };
}
