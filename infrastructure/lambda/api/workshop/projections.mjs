// Projections for the workshop-time aggregate (system#workshop-time).
//
// See projections.test.mjs for specs and docs/workshop-mode.md for the
// broader workshop-time mechanism.

export function projectWorkshopTimeAdvanced(event, tables) {
  return {
    Put: {
      TableName: tables.configTable,
      Item: {
        configKey: 'workshop-time',
        offsetMs: event.data.newOffsetMs,
        description: event.data.description,
        updatedAt: event.wallTime,
        seq: event.seq,
        eventId: event.eventId,
      },
    },
  };
}
