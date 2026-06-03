// IRL API Lambda — composition root.
//
// Pulls env vars, wires shared deps (DynamoDB client, command runner, projector,
// workshop-time loader), instantiates per-route handlers, registers them, and
// exports the dispatch fn. Behaviour lives in the imported modules; this file
// is wiring only.
//
// Mode is derived from STAGE: 'prod' → production, anything else → workshop.
// Workshop-only routes are registered inside `if (isWorkshop) { ... }` so they
// don't exist on production stacks. See docs/workshop-mode.md.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { createRouter } from './lib/router.mjs';
import { createCommandRunner } from './lib/command.mjs';
import { createProjector } from './lib/projection.mjs';
import { createWorkshopOffsetLoader } from './lib/workshop-time.mjs';
import { createKeyStore } from './lib/key-store.mjs';
import { piiFieldsFor } from './lib/pii-registry.mjs';
import {
  projectUserRegistered,
  projectUserProfileCreated,
  projectUserProfileUpdated,
  projectLocalityVerificationRequested,
  projectLocalityVerified,
  projectUserActivated,
  projectUserDeleted,
} from './users/projections.mjs';
import { createRegisterHandler } from './users/register.mjs';
import { createProfileHandler } from './users/profile.mjs';
import { createUpdateProfileHandler } from './users/profile-update.mjs';
import { createLocalityHandler } from './users/locality.mjs';
import { createLocalityCheckHandler } from './users/locality-check.mjs';
import { createGetMeHandler } from './users/me.mjs';
import { createExportHandler } from './users/export.mjs';
import { createDeleteHandler } from './users/delete.mjs';
import { projectLocationNotifyRequested } from './notify/projections.mjs';
import { createNotifyHandler } from './notify/notify.mjs';
import { projectWorkshopTimeAdvanced } from './workshop/projections.mjs';
import { createGetTimeHandler } from './workshop/get-time.mjs';
import { createAdvanceTimeHandler } from './workshop/admin-time.mjs';
import { createNotifyListHandler } from './admin/notify-list.mjs';
import { projectEventProposed } from './events/projections.mjs';
import {
  projectInterestExpressed,
  projectAttendanceConfirmed,
  projectAttendanceWithdrawn,
} from './events/interaction-projections.mjs';
import {
  projectEventScheduled,
  projectEventCancelled,
  projectEventAutoPlanSettingChanged,
} from './events/lifecycle-projections.mjs';
import { createProposeEventHandler } from './events/propose.mjs';
import { createListEventsHandler } from './events/list.mjs';
import {
  createSetInteractionHandler,
  createWithdrawInteractionHandler,
} from './events/interaction.mjs';
import {
  createScheduleEventHandler,
  createCancelEventHandler,
  createAutoPlanHandler,
} from './events/lifecycle.mjs';
import {
  projectSuggestionMade,
  projectSuggestionWithdrawn,
  projectSuggestionAdopted,
  projectSuggestionRejected,
  projectSuggestionResponded,
  projectSuggestionVoteExpressed,
  projectSuggestionVoteRetracted,
} from './events/suggestion-projections.mjs';
import {
  createMakeSuggestionHandler,
  createListSuggestionsHandler,
  createSetSuggestionStatusHandler,
  createSetSuggestionResponseHandler,
  createVoteSuggestionHandler,
  createRetractSuggestionVoteHandler,
} from './events/suggestion.mjs';
import {
  projectPollCreated,
  projectPollClosed,
  projectPollVoteCast,
  projectPollVoteRetracted,
} from './events/poll-projections.mjs';
import {
  createMakePollHandler,
  createListPollsHandler,
  createClosePollHandler,
  createCastPollVoteHandler,
  createRetractPollVoteHandler,
} from './events/poll.mjs';
import { ulid } from './lib/ulid.mjs';

const stage = process.env.STAGE || 'workshop';
const mode = stage === 'prod' ? 'production' : 'workshop';
const isWorkshop = mode === 'workshop';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

const tables = {
  usersTable: process.env.USERS_TABLE,
  eventsTable: process.env.EVENTS_TABLE,
  interactionsTable: process.env.INTERACTIONS_TABLE,
  suggestionsTable: process.env.SUGGESTIONS_TABLE,
  suggestionVotesTable: process.env.SUGGESTION_VOTES_TABLE,
  pollsTable: process.env.POLLS_TABLE,
  pollVotesTable: process.env.POLL_VOTES_TABLE,
  configTable: process.env.CONFIG_TABLE,
};

const getWorkshopOffset = createWorkshopOffsetLoader({
  client,
  configTable: tables.configTable,
});

const keyStore = createKeyStore({
  client,
  keysTable: process.env.USER_KEYS_TABLE,
});

const projector = createProjector({
  registry: {
    UserRegistered: projectUserRegistered,
    UserProfileCreated: projectUserProfileCreated,
    UserProfileUpdated: projectUserProfileUpdated,
    LocalityVerificationRequested: projectLocalityVerificationRequested,
    LocalityVerified: projectLocalityVerified,
    UserActivated: projectUserActivated,
    UserDeleted: projectUserDeleted,
    LocationNotifyRequested: projectLocationNotifyRequested,
    WorkshopTimeAdvanced: projectWorkshopTimeAdvanced,
    EventProposed: projectEventProposed,
    InterestExpressed: projectInterestExpressed,
    AttendanceConfirmed: projectAttendanceConfirmed,
    AttendanceWithdrawn: projectAttendanceWithdrawn,
    EventScheduled: projectEventScheduled,
    EventCancelled: projectEventCancelled,
    EventAutoPlanSettingChanged: projectEventAutoPlanSettingChanged,
    SuggestionMade: projectSuggestionMade,
    SuggestionWithdrawn: projectSuggestionWithdrawn,
    SuggestionAdopted: projectSuggestionAdopted,
    SuggestionRejected: projectSuggestionRejected,
    SuggestionResponded: projectSuggestionResponded,
    SuggestionVoteExpressed: projectSuggestionVoteExpressed,
    SuggestionVoteRetracted: projectSuggestionVoteRetracted,
    PollCreated: projectPollCreated,
    PollClosed: projectPollClosed,
    PollVoteCast: projectPollVoteCast,
    PollVoteRetracted: projectPollVoteRetracted,
  },
  tables,
});

const runner = createCommandRunner({
  client,
  commandsTable: process.env.COMMANDS_TABLE,
  eventsLogTable: process.env.EVENTS_LOG_TABLE,
  projector,
  getOffset: getWorkshopOffset,
  keyStore,
  piiFieldsFor,
});

const registerHandler = createRegisterHandler({ runner });
const profileHandler = createProfileHandler({ runner, client, usersTable: tables.usersTable });
const updateProfileHandler = createUpdateProfileHandler({ runner, client, usersTable: tables.usersTable });
const localityHandler = createLocalityHandler({ runner, client, usersTable: tables.usersTable });
const localityCheckHandler = createLocalityCheckHandler();
const notifyHandler = createNotifyHandler({ runner });
const getMeHandler = createGetMeHandler({ client, usersTable: tables.usersTable });
const exportHandler = createExportHandler({
  client,
  usersTable: tables.usersTable,
  eventsLogTable: process.env.EVENTS_LOG_TABLE,
  keyStore,
  piiFieldsFor,
});
const deleteHandler = createDeleteHandler({
  runner,
  client,
  usersTable: tables.usersTable,
  keyStore,
  cognito,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
});
const getTimeHandler = createGetTimeHandler({ getOffset: getWorkshopOffset });
const advanceTimeHandler = createAdvanceTimeHandler({ runner, getOffset: getWorkshopOffset });
const notifyListHandler = createNotifyListHandler({
  client,
  eventsLogTable: process.env.EVENTS_LOG_TABLE,
});
const proposeEventHandler = createProposeEventHandler({ runner, makeEventId: ulid });
const listEventsHandler = createListEventsHandler({
  client,
  eventsTable: tables.eventsTable,
  interactionsTable: tables.interactionsTable,
  getOffset: getWorkshopOffset,
});
const setInteractionHandler = createSetInteractionHandler({
  runner, client,
  eventsTable: tables.eventsTable,
  interactionsTable: tables.interactionsTable,
});
const withdrawInteractionHandler = createWithdrawInteractionHandler({
  runner, client,
  eventsTable: tables.eventsTable,
  interactionsTable: tables.interactionsTable,
});
const scheduleEventHandler = createScheduleEventHandler({
  runner, client, eventsTable: tables.eventsTable,
});
const cancelEventHandler = createCancelEventHandler({
  runner, client, eventsTable: tables.eventsTable,
});
const autoPlanHandler = createAutoPlanHandler({
  runner, client, eventsTable: tables.eventsTable,
});
const makeSuggestionHandler = createMakeSuggestionHandler({
  runner, client, makeId: ulid,
  eventsTable: tables.eventsTable, suggestionsTable: tables.suggestionsTable,
});
const listSuggestionsHandler = createListSuggestionsHandler({
  client,
  suggestionsTable: tables.suggestionsTable,
  suggestionVotesTable: tables.suggestionVotesTable,
});
const setSuggestionStatusHandler = createSetSuggestionStatusHandler({
  runner, client,
  eventsTable: tables.eventsTable, suggestionsTable: tables.suggestionsTable,
});
const setSuggestionResponseHandler = createSetSuggestionResponseHandler({
  runner, client,
  eventsTable: tables.eventsTable, suggestionsTable: tables.suggestionsTable,
});
const voteSuggestionHandler = createVoteSuggestionHandler({
  runner, client,
  eventsTable: tables.eventsTable,
  suggestionsTable: tables.suggestionsTable,
  suggestionVotesTable: tables.suggestionVotesTable,
});
const retractSuggestionVoteHandler = createRetractSuggestionVoteHandler({
  runner, client,
  suggestionVotesTable: tables.suggestionVotesTable,
});
const makePollHandler = createMakePollHandler({
  runner, client, makeId: ulid,
  eventsTable: tables.eventsTable, pollsTable: tables.pollsTable,
});
const listPollsHandler = createListPollsHandler({
  client,
  pollsTable: tables.pollsTable,
  pollVotesTable: tables.pollVotesTable,
});
const closePollHandler = createClosePollHandler({
  runner, client,
  eventsTable: tables.eventsTable, pollsTable: tables.pollsTable,
});
const castPollVoteHandler = createCastPollVoteHandler({
  runner, client,
  eventsTable: tables.eventsTable,
  pollsTable: tables.pollsTable,
  pollVotesTable: tables.pollVotesTable,
});
const retractPollVoteHandler = createRetractPollVoteHandler({
  runner, client,
  pollVotesTable: tables.pollVotesTable,
});

const router = createRouter();

router.add('GET', '/health', async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ok: true,
    time: new Date().toISOString(),
    stage,
    mode,
    tables: {
      users: tables.usersTable,
      events: tables.eventsTable,
      interactions: tables.interactionsTable,
      config: tables.configTable,
      eventsLog: process.env.EVENTS_LOG_TABLE,
      commands: process.env.COMMANDS_TABLE,
    },
  }),
}));

router.add('GET', '/me', getMeHandler);
router.add('GET', '/me/export', exportHandler);
router.add('DELETE', '/me', deleteHandler);
router.add('POST', '/me/register', registerHandler);
router.add('POST', '/me/profile', profileHandler);
router.add('PUT', '/me/profile', updateProfileHandler);
router.add('POST', '/me/locality', localityHandler);
router.add('GET', '/locality/check', localityCheckHandler);
router.add('POST', '/notify', notifyHandler);
router.add('GET', '/time', getTimeHandler);

router.add('GET', '/admin/notify-list', notifyListHandler);

router.add('POST', '/events', proposeEventHandler);
router.add('GET', '/events', listEventsHandler);
router.add('PUT', '/events/:eventId/interaction', setInteractionHandler);
router.add('DELETE', '/events/:eventId/interaction', withdrawInteractionHandler);
router.add('PUT', '/events/:eventId/schedule', scheduleEventHandler);
router.add('PUT', '/events/:eventId/cancel', cancelEventHandler);
router.add('PUT', '/events/:eventId/auto-plan', autoPlanHandler);

router.add('POST', '/events/:eventId/suggestions', makeSuggestionHandler);
router.add('GET', '/events/:eventId/suggestions', listSuggestionsHandler);
router.add('PUT', '/events/:eventId/suggestions/:suggestionId/status', setSuggestionStatusHandler);
router.add('PUT', '/events/:eventId/suggestions/:suggestionId/response', setSuggestionResponseHandler);
router.add('PUT', '/events/:eventId/suggestions/:suggestionId/vote', voteSuggestionHandler);
router.add('DELETE', '/events/:eventId/suggestions/:suggestionId/vote', retractSuggestionVoteHandler);

router.add('POST', '/events/:eventId/polls', makePollHandler);
router.add('GET', '/events/:eventId/polls', listPollsHandler);
router.add('PUT', '/events/:eventId/polls/:pollId/close', closePollHandler);
router.add('PUT', '/events/:eventId/polls/:pollId/vote', castPollVoteHandler);
router.add('DELETE', '/events/:eventId/polls/:pollId/vote', retractPollVoteHandler);

// Workshop-only routes are registered conditionally so they don't exist
// on the production Lambda's route table.
if (isWorkshop) {
  router.add('POST', '/admin/time', advanceTimeHandler);
}

export const handler = router.dispatch;
