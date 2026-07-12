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
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createRouter } from './lib/router.mjs';
import { createCommandRunner } from './lib/command.mjs';
import { createProjector } from './lib/projection.mjs';
import { createWorkshopOffsetLoader } from './lib/workshop-time.mjs';
import { createKeyStore } from './lib/key-store.mjs';
import { piiFieldsFor } from './lib/pii-registry.mjs';
import { createTracer } from './lib/tracing.mjs';
import { createRequiredAgreementLoader } from './lib/agreement-version.mjs';
import { createAgreementGate } from './lib/agreement-gate.mjs';
import { createRealLlmProvider, createStubLlmProvider } from './lib/llm.mjs';
import {
  projectUserRegistered,
  projectUserProfileCreated,
  projectUserProfileUpdated,
  projectLocalityVerificationRequested,
  projectLocalityVerified,
  projectUserActivated,
  projectUserDeleted,
  projectOnboardingCompleted,
  projectUserKeyShredded,
  projectUserAgreementReaccepted,
} from './users/projections.mjs';
import { createReacceptAgreementHandler } from './users/agreement.mjs';
import { createUpdateAgreementVersionHandler } from './admin/agreement-version.mjs';
import { projectRequiredAgreementVersionUpdated } from './admin/agreement-projections.mjs';
import { createOnboardingHandler } from './users/onboarding.mjs';
import { createInterviewTurnHandler } from './users/interview.mjs';
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
  projectDebriefSubmitted,
} from './events/interaction-projections.mjs';
import {
  projectEventScheduled,
  projectEventCancelled,
  projectEventAutoPlanSettingChanged,
  projectEventEdited,
} from './events/lifecycle-projections.mjs';
import { createProposeEventHandler } from './events/propose.mjs';
import { createListEventsHandler } from './events/list.mjs';
import { createListAttendeesHandler } from './events/attendees.mjs';
import {
  createSetInteractionHandler,
  createWithdrawInteractionHandler,
  createSubmitDebriefHandler,
} from './events/interaction.mjs';
import {
  createScheduleEventHandler,
  createCancelEventHandler,
  createAutoPlanHandler,
  createEditEventHandler,
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

// LLM seam (D37): real Claude provider in production, deterministic stub in
// workshop/test. The API key lives in Secrets Manager; fetched lazily on the
// first production call and cached for the Lambda's lifetime.
const llm = isWorkshop
  ? createStubLlmProvider()
  : createRealLlmProvider({
    getApiKey: async () => {
      const sm = new SecretsManagerClient({});
      const out = await sm.send(new GetSecretValueCommand({
        SecretId: process.env.CLAUDE_API_KEY_SECRET_ARN,
      }));
      const secret = out.SecretString ?? '';
      try {
        const parsed = JSON.parse(secret);
        if (parsed && typeof parsed === 'object' && parsed.apiKey) return parsed.apiKey;
      } catch { /* raw string secret */ }
      return secret;
    },
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
    OnboardingCompleted: projectOnboardingCompleted,
    UserKeyShredded: projectUserKeyShredded,
    LocationNotifyRequested: projectLocationNotifyRequested,
    WorkshopTimeAdvanced: projectWorkshopTimeAdvanced,
    EventProposed: projectEventProposed,
    InterestExpressed: projectInterestExpressed,
    AttendanceConfirmed: projectAttendanceConfirmed,
    AttendanceWithdrawn: projectAttendanceWithdrawn,
    DebriefSubmitted: projectDebriefSubmitted,
    EventScheduled: projectEventScheduled,
    EventCancelled: projectEventCancelled,
    EventAutoPlanSettingChanged: projectEventAutoPlanSettingChanged,
    EventEdited: projectEventEdited,
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
    UserAgreementReaccepted: projectUserAgreementReaccepted,
    RequiredAgreementVersionUpdated: projectRequiredAgreementVersionUpdated,
  },
  tables,
});

const getRequiredAgreement = createRequiredAgreementLoader({
  client,
  configTable: tables.configTable,
});

// Gate on state-changing member routes: a user whose accepted agreement
// version has fallen behind must re-accept before any further commands.
// See lib/agreement-gate.mjs for the deliberate exemptions (reads,
// register, the re-accept route itself, deletion/export, admin, notify).
const requireCurrentAgreement = createAgreementGate({
  client,
  usersTable: process.env.USERS_TABLE,
  getRequiredAgreement,
});

// Reads _X_AMZN_TRACE_ID per call, so one instance serves every invocation.
const tracer = createTracer();

const runner = createCommandRunner({
  client,
  commandsTable: process.env.COMMANDS_TABLE,
  eventsLogTable: process.env.EVENTS_LOG_TABLE,
  projector,
  getOffset: getWorkshopOffset,
  keyStore,
  piiFieldsFor,
  tracer,
});

const registerHandler = createRegisterHandler({ runner });
const profileHandler = createProfileHandler({ runner, client, usersTable: tables.usersTable });
const updateProfileHandler = createUpdateProfileHandler({ runner, client, usersTable: tables.usersTable });
const localityHandler = createLocalityHandler({ runner, client, usersTable: tables.usersTable });
const localityCheckHandler = createLocalityCheckHandler();
const notifyHandler = createNotifyHandler({ runner });
const getMeHandler = createGetMeHandler({
  client,
  usersTable: tables.usersTable,
  getRequiredAgreement,
});
const reacceptAgreementHandler = createReacceptAgreementHandler({
  runner,
  client,
  usersTable: tables.usersTable,
  getRequiredAgreement,
});
const updateAgreementVersionHandler = createUpdateAgreementVersionHandler({
  runner,
  getRequiredAgreement,
});
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
const onboardingHandler = createOnboardingHandler({
  runner, client, usersTable: tables.usersTable, llm,
});
const interviewTurnHandler = createInterviewTurnHandler({
  client,
  usersTable: tables.usersTable,
  eventsTable: tables.eventsTable,
  llm,
  getOffset: getWorkshopOffset,
});
const getTimeHandler = createGetTimeHandler({ getOffset: getWorkshopOffset });
const advanceTimeHandler = createAdvanceTimeHandler({ runner, getOffset: getWorkshopOffset });
const notifyListHandler = createNotifyListHandler({
  client,
  eventsLogTable: process.env.EVENTS_LOG_TABLE,
});
const proposeEventHandler = createProposeEventHandler({ runner, makeEventId: ulid });
const listAttendeesHandler = createListAttendeesHandler({
  client,
  eventsTable: tables.eventsTable,
  interactionsTable: tables.interactionsTable,
});
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
  getOffset: getWorkshopOffset,
});
const withdrawInteractionHandler = createWithdrawInteractionHandler({
  runner, client,
  eventsTable: tables.eventsTable,
  interactionsTable: tables.interactionsTable,
});
const submitDebriefHandler = createSubmitDebriefHandler({
  runner, client,
  eventsTable: tables.eventsTable,
  interactionsTable: tables.interactionsTable,
  getOffset: getWorkshopOffset,
});
const scheduleEventHandler = createScheduleEventHandler({
  runner, client, eventsTable: tables.eventsTable,
});
const cancelEventHandler = createCancelEventHandler({
  runner, client, eventsTable: tables.eventsTable,
  getOffset: getWorkshopOffset,
});
const autoPlanHandler = createAutoPlanHandler({
  runner, client, eventsTable: tables.eventsTable,
});
const editEventHandler = createEditEventHandler({
  runner, client, eventsTable: tables.eventsTable,
  getOffset: getWorkshopOffset,
});
const makeSuggestionHandler = createMakeSuggestionHandler({
  runner, client, makeId: ulid,
  eventsTable: tables.eventsTable, suggestionsTable: tables.suggestionsTable,
  getOffset: getWorkshopOffset,
});
const listSuggestionsHandler = createListSuggestionsHandler({
  client,
  suggestionsTable: tables.suggestionsTable,
  suggestionVotesTable: tables.suggestionVotesTable,
});
const setSuggestionStatusHandler = createSetSuggestionStatusHandler({
  runner, client,
  eventsTable: tables.eventsTable, suggestionsTable: tables.suggestionsTable,
  getOffset: getWorkshopOffset,
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
  getOffset: getWorkshopOffset,
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
router.add('POST', '/me/agreement', reacceptAgreementHandler);
router.add('POST', '/me/profile', requireCurrentAgreement(profileHandler));
router.add('POST', '/me/onboarding', requireCurrentAgreement(onboardingHandler));
router.add('POST', '/me/interview/turn', requireCurrentAgreement(interviewTurnHandler));
router.add('PUT', '/me/profile', requireCurrentAgreement(updateProfileHandler));
router.add('POST', '/me/locality', requireCurrentAgreement(localityHandler));
router.add('GET', '/locality/check', localityCheckHandler);
router.add('POST', '/notify', notifyHandler);
router.add('GET', '/time', getTimeHandler);

router.add('GET', '/admin/notify-list', notifyListHandler);
router.add('POST', '/admin/agreement-version', updateAgreementVersionHandler);

router.add('POST', '/events', requireCurrentAgreement(proposeEventHandler));
router.add('GET', '/events', listEventsHandler);
router.add('GET', '/events/:eventId/attendees', listAttendeesHandler);
router.add('PUT', '/events/:eventId/interaction', requireCurrentAgreement(setInteractionHandler));
router.add('DELETE', '/events/:eventId/interaction', requireCurrentAgreement(withdrawInteractionHandler));
router.add('POST', '/events/:eventId/debrief', requireCurrentAgreement(submitDebriefHandler));
router.add('PUT', '/events/:eventId/schedule', requireCurrentAgreement(scheduleEventHandler));
router.add('PUT', '/events/:eventId/cancel', requireCurrentAgreement(cancelEventHandler));
router.add('PUT', '/events/:eventId/auto-plan', requireCurrentAgreement(autoPlanHandler));
router.add('PUT', '/events/:eventId', requireCurrentAgreement(editEventHandler));

router.add('POST', '/events/:eventId/suggestions', requireCurrentAgreement(makeSuggestionHandler));
router.add('GET', '/events/:eventId/suggestions', listSuggestionsHandler);
router.add('PUT', '/events/:eventId/suggestions/:suggestionId/status', requireCurrentAgreement(setSuggestionStatusHandler));
router.add('PUT', '/events/:eventId/suggestions/:suggestionId/response', requireCurrentAgreement(setSuggestionResponseHandler));
router.add('PUT', '/events/:eventId/suggestions/:suggestionId/vote', requireCurrentAgreement(voteSuggestionHandler));
router.add('DELETE', '/events/:eventId/suggestions/:suggestionId/vote', requireCurrentAgreement(retractSuggestionVoteHandler));

router.add('POST', '/events/:eventId/polls', requireCurrentAgreement(makePollHandler));
router.add('GET', '/events/:eventId/polls', listPollsHandler);
router.add('PUT', '/events/:eventId/polls/:pollId/close', requireCurrentAgreement(closePollHandler));
router.add('PUT', '/events/:eventId/polls/:pollId/vote', requireCurrentAgreement(castPollVoteHandler));
router.add('DELETE', '/events/:eventId/polls/:pollId/vote', requireCurrentAgreement(retractPollVoteHandler));

// Workshop-only routes are registered conditionally so they don't exist
// on the production Lambda's route table.
if (isWorkshop) {
  router.add('POST', '/admin/time', advanceTimeHandler);
}

export const handler = router.dispatch;
