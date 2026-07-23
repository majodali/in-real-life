// Projections for the workshop-time aggregate (system#workshop-time).
//
// See projections.test.mjs for specs and docs/workshop-mode.md for the
// broader workshop-time mechanism.

// WorkshopSeedConfigured pins the slot → locality bindings the seeded
// personas were built with (D64 slice 2): the events phase reads them
// back so a later selective add binds identically, and a re-seed with
// different bindings can be refused instead of splitting the room.
export function projectWorkshopSeedConfigured(event, tables) {
  return {
    Put: {
      TableName: tables.configTable,
      Item: {
        configKey: 'workshop-seed',
        localityBindings: event.data.localityBindings,
        // The generation salts every seed commandId: after a full
        // teardown (test stacks), a fresh seeding must never collide
        // with the previous generation's still-cached command records.
        generation: event.data.generation,
        updatedAt: event.wallTime,
        seq: event.seq,
        eventId: event.eventId,
      },
    },
  };
}

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
