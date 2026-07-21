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
const ONBOARDING_KEY = 'irl_cmd_onboarding';
const REACCEPT_KEY = 'irl_cmd_reaccept_agreement';
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

  // Profile basics only (D42): name, avatar, vibe. Interview content rides
  // on completeOnboarding, never here.
  async function createProfile({
    name,
    avatar,
    vibeMessage = '',
  }) {
    const commandId = getOrMakeCommandId(PROFILE_KEY);
    const body = { commandId, name, vibeMessage };
    if (avatar !== undefined) body.avatar = avatar;
    const result = await api.post('/me/profile', body);
    storage.removeItem(PROFILE_KEY);
    return result;
  }

  // One interview turn (POST /me/interview/turn). Ephemeral — no commandId:
  // the server persists nothing per turn (D5), so a repeat is harmless.
  async function interviewTurn({ transcript }) {
    return await api.post('/me/interview/turn', { transcript });
  }

  // Close the interview: the server runs the extraction call and emits
  // OnboardingCompleted — the sole interview carrier (D42).
  async function completeOnboarding({ transcript }) {
    const commandId = getOrMakeCommandId(ONBOARDING_KEY);
    const result = await api.post('/me/onboarding', { commandId, transcript });
    storage.removeItem(ONBOARDING_KEY);
    return result;
  }

  // Accept a bumped Terms of Use version (POST /me/agreement). The version
  // must be the one the server said is required — the screen passes it
  // through from GET /me, never the local AGREEMENT_VERSION constant,
  // which can lag behind a freshly bumped requirement.
  async function reacceptAgreement({ agreementVersion }) {
    const commandId = getOrMakeCommandId(REACCEPT_KEY);
    const result = await api.post('/me/agreement', { commandId, agreementVersion });
    storage.removeItem(REACCEPT_KEY);
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

  async function setRequiredAgreementVersion({ version }) {
    return await api.post('/admin/agreement-version', { commandId: makeId(), version });
  }

  async function proposeEvent({
    title, description, startTime, endTime, location, organizerName,
    minimumAttendance, autoPlanOnThreshold, cost, maxAttendance,
    source, meetingSpot,
  }) {
    const commandId = getOrMakeCommandId(PROPOSE_EVENT_KEY);
    const body = { commandId, title, startTime, location, organizerName };
    if (description !== undefined) body.description = description;
    if (endTime !== undefined) body.endTime = endTime;
    if (minimumAttendance !== undefined) body.minimumAttendance = minimumAttendance;
    if (autoPlanOnThreshold !== undefined) body.autoPlanOnThreshold = autoPlanOnThreshold;
    if (cost !== undefined) body.cost = cost;
    if (maxAttendance !== undefined) body.maxAttendance = maxAttendance;
    if (source !== undefined) body.source = source;
    if (meetingSpot !== undefined) body.meetingSpot = meetingSpot;
    const result = await api.post('/events', body);
    storage.removeItem(PROPOSE_EVENT_KEY);
    return result;
  }

  async function listEvents() {
    return await api.get('/events');
  }

  // The curated locality register (D62) — public reference data.
  async function getLocalities() {
    return await api.get('/localities');
  }

  // The event-type register (D63) — serves the organizer's kind picker.
  async function getEventTypes() {
    return await api.get('/event-types');
  }

  // "I wish this was closer" (D62/R8) — capture-only demand signal.
  // Per-click commandId: wishing again on another day is a fresh act.
  async function wishCloser({ eventId }) {
    return await api.post(`/events/${encodeURIComponent(eventId)}/wish`, {
      commandId: makeId(),
      wish: 'closer',
    });
  }

  // One reflection turn (ephemeral, no commandId — nothing persists per
  // turn); the close records ReflectionRecorded with a per-event
  // persisted commandId so retries converge.
  async function reflectionTurn({ eventId, transcript }) {
    return await api.post('/me/reflection/turn', { eventId, transcript });
  }

  async function completeReflection({ eventId, transcript, perspectivesOffered }) {
    const key = `irl_cmd_reflection_${eventId}`;
    const commandId = getOrMakeCommandId(key);
    const body = { commandId, eventId, transcript };
    if (perspectivesOffered?.length) body.perspectivesOffered = perspectivesOffered;
    const result = await api.post('/me/reflection', body);
    storage.removeItem(key);
    return result;
  }

  async function listAttendees({ eventId }) {
    return await api.get(`/events/${encodeURIComponent(eventId)}/attendees`);
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

  async function editEvent({ eventId, title, description, startTime, endTime, location, cost, maxAttendance, meetingSpot, shape }) {
    const body = { commandId: makeId() };
    if (title !== undefined) body.title = title;
    if (description !== undefined) body.description = description;
    if (startTime !== undefined) body.startTime = startTime;
    if (endTime !== undefined) body.endTime = endTime;
    if (location !== undefined) body.location = location;
    if (cost !== undefined) body.cost = cost;
    if (maxAttendance !== undefined) body.maxAttendance = maxAttendance;
    if (meetingSpot !== undefined) body.meetingSpot = meetingSpot;
    if (shape !== undefined) body.shape = shape;
    return await api.put(`/events/${encodeURIComponent(eventId)}`, body);
  }

  // Tiered debrief (docs/debrief.md). One debrief per event → the
  // commandId persists per event so a retry converges instead of
  // duplicating.
  async function submitDebrief({
    eventId, attended, again, noShowReason, outcomeTexture, people,
    surprise, reflection, conductConcern, conductNote,
  }) {
    const key = `irl_cmd_debrief_${eventId}`;
    const commandId = getOrMakeCommandId(key);
    const body = { commandId, attended };
    if (again !== undefined) body.again = again;
    if (noShowReason) body.noShowReason = noShowReason;
    if (outcomeTexture?.length) body.outcomeTexture = outcomeTexture;
    if (people?.length) body.people = people;
    if (surprise) body.surprise = surprise;
    if (reflection) body.reflection = reflection;
    if (conductConcern) body.conductConcern = true;
    if (conductNote) body.conductNote = conductNote;
    const result = await api.post(`/events/${encodeURIComponent(eventId)}/debrief`, body);
    storage.removeItem(key);
    return result;
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

  // ─── Model legibility (D59) ───

  async function getModel() {
    return await api.get('/me/model');
  }

  // Per-click commandId — each correction is a distinct intent ("set it
  // again" must take again); a network retry within one press reuses the
  // id at the API layer naturally.
  async function correctModel({ correction }) {
    return await api.post('/me/model/correction', {
      commandId: makeId(),
      correction,
    });
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
    interviewTurn,
    completeOnboarding,
    reacceptAgreement,
    setRequiredAgreementVersion,
    updateProfile,
    verifyLocality,
    checkLocality,
    requestNotify,
    exportData,
    deleteAccount,
    getModel,
    correctModel,
    getTime,
    advanceTime,
    getNotifyList,
    proposeEvent,
    listEvents,
    getLocalities,
    getEventTypes,
    wishCloser,
    listAttendees,
    reflectionTurn,
    completeReflection,
    setEventInteraction,
    withdrawEventInteraction,
    scheduleEvent,
    cancelEvent,
    setAutoPlanOnThreshold,
    editEvent,
    submitDebrief,
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
