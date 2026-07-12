// Projections for the system#config aggregate's agreement events.
//
// RequiredAgreementVersionUpdated maintains the
// `required_user_agreement_version` row in irl-config that the agreement
// gate and GET /me read (docs/event-sourcing.md → Agreement versioning).

export function projectRequiredAgreementVersionUpdated(event, tables) {
  return {
    Put: {
      TableName: tables.configTable,
      Item: {
        configKey: 'required_user_agreement_version',
        version: event.data.version,
        previousVersion: event.data.previousVersion ?? null,
        updatedAt: event.wallTime,
        seq: event.seq,
        eventId: event.eventId,
      },
    },
  };
}
