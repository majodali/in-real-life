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
const DELETE_KEY = 'irl_cmd_delete';
const PROPOSE_EVENT_KEY = 'irl_cmd_propose_event';

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

  async function deleteAccount() {
    const commandId = getOrMakeCommandId(DELETE_KEY);
    const result = await api.delete('/me', { commandId });
    storage.removeItem(DELETE_KEY);
    return result;
  }

  // Admin / workshop endpoints. Fresh commandId per call for advanceTime
  // because each click is a distinct user intent ("advance again");
  // network retries within a single call reuse the local id naturally.
  async function getTime() {
    return await api.get('/time');
  }

  async function advanceTime(args) {
    return await api.post('/admin/time', { commandId: makeId(), ...args });
  }

  async function getNotifyList() {
    return await api.get('/admin/notify-list');
  }

  async function proposeEvent({
    title, description, startTime, endTime, location, organizerName,
    minimumAttendance, autoPlanOnThreshold,
  }) {
    const commandId = getOrMakeCommandId(PROPOSE_EVENT_KEY);
    const body = { commandId, title, startTime, location, organizerName };
    if (description !== undefined) body.description = description;
    if (endTime !== undefined) body.endTime = endTime;
    if (minimumAttendance !== undefined) body.minimumAttendance = minimumAttendance;
    if (autoPlanOnThreshold !== undefined) body.autoPlanOnThreshold = autoPlanOnThreshold;
    const result = await api.post('/events', body);
    storage.removeItem(PROPOSE_EVENT_KEY);
    return result;
  }

  async function listEvents() {
    return await api.get('/events');
  }

  // Per-click commandId — each press is a distinct user intent, and a
  // network retry within a single press reuses the local id naturally.
  async function setEventInteraction({ eventId, level }) {
    return await api.put(`/events/${encodeURIComponent(eventId)}/interaction`, {
      commandId: makeId(),
      level,
    });
  }

  async function withdrawEventInteraction({ eventId }) {
    return await api.delete(`/events/${encodeURIComponent(eventId)}/interaction`, {
      commandId: makeId(),
    });
  }

  // Lifecycle (organizer-only). Each press is a distinct intent → fresh
  // commandId per call; an in-flight retry reuses it locally.
  async function scheduleEvent({ eventId }) {
    return await api.put(`/events/${encodeURIComponent(eventId)}/schedule`, {
      commandId: makeId(),
    });
  }

  async function cancelEvent({ eventId, reason }) {
    const body = { commandId: makeId() };
    if (reason !== undefined && reason !== '') body.reason = reason;
    return await api.put(`/events/${encodeURIComponent(eventId)}/cancel`, body);
  }

  async function setAutoPlanOnThreshold({ eventId, autoPlanOnThreshold }) {
    return await api.put(`/events/${encodeURIComponent(eventId)}/auto-plan`, {
      commandId: makeId(),
      autoPlanOnThreshold,
    });
  }

  // ─── Suggestions ───
  // Per-click commandId for every action — each press is a distinct intent.

  async function makeSuggestion({ eventId, text, tags = [] }) {
    return await api.post(`/events/${encodeURIComponent(eventId)}/suggestions`, {
      commandId: makeId(), text, tags,
    });
  }

  async function listSuggestions({ eventId }) {
    return await api.get(`/events/${encodeURIComponent(eventId)}/suggestions`);
  }

  async function setSuggestionStatus({ eventId, suggestionId, status, reason }) {
    const body = { commandId: makeId(), status };
    if (reason !== undefined && reason !== '') body.reason = reason;
    return await api.put(
      `/events/${encodeURIComponent(eventId)}/suggestions/${encodeURIComponent(suggestionId)}/status`,
      body,
    );
  }

  async function setSuggestionResponse({ eventId, suggestionId, response }) {
    return await api.put(
      `/events/${encodeURIComponent(eventId)}/suggestions/${encodeURIComponent(suggestionId)}/response`,
      { commandId: makeId(), response },
    );
  }

  async function voteOnSuggestion({ eventId, suggestionId, vote }) {
    return await api.put(
      `/events/${encodeURIComponent(eventId)}/suggestions/${encodeURIComponent(suggestionId)}/vote`,
      { commandId: makeId(), vote },
    );
  }

  async function retractSuggestionVote({ eventId, suggestionId }) {
    return await api.delete(
      `/events/${encodeURIComponent(eventId)}/suggestions/${encodeURIComponent(suggestionId)}/vote`,
      { commandId: makeId() },
    );
  }

  // ─── Polls ───

  async function makePoll({ eventId, question, options }) {
    return await api.post(`/events/${encodeURIComponent(eventId)}/polls`, {
      commandId: makeId(), question, options,
    });
  }

  async function listPolls({ eventId }) {
    return await api.get(`/events/${encodeURIComponent(eventId)}/polls`);
  }

  async function closePoll({ eventId, pollId, outcome }) {
    const body = { commandId: makeId() };
    if (outcome !== undefined && outcome !== null && outcome !== '') body.outcome = outcome;
    return await api.put(
      `/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}/close`,
      body,
    );
  }

  async function castPollVote({ eventId, pollId, optionId }) {
    return await api.put(
      `/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}/vote`,
      { commandId: makeId(), optionId },
    );
  }

  async function retractPollVote({ eventId, pollId }) {
    return await api.delete(
      `/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}/vote`,
      { commandId: makeId() },
    );
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
    deleteAccount,
    getTime,
    advanceTime,
    getNotifyList,
    proposeEvent,
    listEvents,
    setEventInteraction,
    withdrawEventInteraction,
    scheduleEvent,
    cancelEvent,
    setAutoPlanOnThreshold,
    makeSuggestion,
    listSuggestions,
    setSuggestionStatus,
    setSuggestionResponse,
    voteOnSuggestion,
    retractSuggestionVote,
    makePoll,
    listPolls,
    closePoll,
    castPollVote,
    retractPollVote,
  };
}
