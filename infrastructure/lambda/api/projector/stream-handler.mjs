// DynamoDB Streams → projector adapter.
//
// Unwraps stream records into the enriched event records the projectors
// understand and reports partial batch failures, so a poison event retries
// (then bisects, then dead-letters via the event-source config) without
// blocking the records before it. Only INSERTs matter — the event log is
// append-only, so MODIFY/REMOVE would be operational noise (TTL, manual
// repair), never domain events.

export function createStreamHandler({ projectors, unmarshall }) {
  return async function handler(streamEvent) {
    const records = streamEvent?.Records ?? [];
    const batchItemFailures = [];

    for (const record of records) {
      if (record.eventName !== 'INSERT') continue;
      const image = record.dynamodb?.NewImage;
      if (!image) continue;

      const event = unmarshall(image);
      try {
        for (const projector of projectors) {
          await projector.applyEvent(event);
        }
      } catch (err) {
        console.error(JSON.stringify({
          message: 'projector failed',
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          seq: event.seq,
          error: err?.message,
        }));
        // Report the failure and stop: Lambda retries from this record,
        // so processing the rest of the batch now would only repeat.
        batchItemFailures.push({ itemIdentifier: record.dynamodb.SequenceNumber });
        break;
      }
    }

    return { batchItemFailures };
  };
}
