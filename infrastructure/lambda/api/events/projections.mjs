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
    startTime: d.startTime,
    endTime: d.endTime,
    location: d.location,
    organizerId: d.organizerId,
    organizerName: d.organizerName,
    lifecycleState: 'proposed',
    interestCount: 0,
    confirmedCount: 0,
    createdAt: event.wallTime,
  };
  if (d.description !== undefined) item.description = d.description;
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
