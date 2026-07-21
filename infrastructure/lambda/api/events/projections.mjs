// Projections for the Event aggregate.
//
// Each function takes an event + tables config and returns a DynamoDB write
// op suitable for inclusion in a TransactWriteItems request. See
// projections.test.mjs for the spec.

export function projectEventProposed(event, tables) {
  const d = event.data;
  const item = {
    eventId: d.eventId,
    seq: event.seq,
    source: d.source,
    title: d.title,
    organizerId: d.organizerId,
    organizerName: d.organizerName,
    // External events are born planned (D53): they're already real, so
    // there's nothing to propose — the steward lists, members commit.
    lifecycleState: d.source === 'external' ? 'planned' : 'proposed',
    interestCount: 0,
    confirmedCount: 0,
    createdAt: event.wallTime,
  };
  // Absent on ideas (time/place-less proposals) — readers derive the
  // 'idea' stage from the gap (lib/lifecycle-state.mjs).
  if (d.startTime !== undefined) item.startTime = d.startTime;
  if (d.endTime !== undefined) item.endTime = d.endTime;
  if (d.location !== undefined) item.location = d.location;
  if (d.localityId !== undefined) item.localityId = d.localityId;
  if (d.eventTypeId !== undefined) item.eventTypeId = d.eventTypeId;
  if (d.eventTypeSource !== undefined) item.eventTypeSource = d.eventTypeSource;
  if (d.description !== undefined) item.description = d.description;
  if (d.cost !== undefined) item.cost = d.cost;
  if (d.maxAttendance !== undefined) item.maxAttendance = d.maxAttendance;
  if (d.meetingSpot !== undefined) item.meetingSpot = d.meetingSpot;
  if (d.shape !== undefined) item.shape = d.shape;
  if (d.minimumAttendance !== undefined) item.minimumAttendance = d.minimumAttendance;
  item.timesApproximate = d.timesApproximate === true;
  item.autoPlanOnThreshold = d.autoPlanOnThreshold === true;

  return {
    Put: {
      TableName: tables.eventsTable,
      Item: item,
      ConditionExpression: 'attribute_not_exists(eventId)',
    },
  };
}
