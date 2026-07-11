// Command idempotency wrapper.
//
// runCommand owns the full event lifecycle: enrich → project → transact.
// The projector receives enriched events (with eventId, wallTime, etc.) so
// projection functions can reference event metadata. See command.test.mjs
// for the spec and docs/event-sourcing.md for the design rationale.

import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from './ulid.mjs';
import { encryptPii } from './crypto-shred.mjs';

const COMMAND_TTL_SECONDS = 24 * 3600;

export function createCommandRunner({
  client,
  commandsTable,
  eventsLogTable,
  projector,
  getOffset,
  keyStore,
  piiFieldsFor,
}) {
  return {
    runCommand: (input) => runCommand(
      { client, commandsTable, eventsLogTable, projector, getOffset, keyStore, piiFieldsFor },
      input,
    ),
  };
}

async function runCommand(
  { client, commandsTable, eventsLogTable, projector, getOffset, keyStore, piiFieldsFor },
  { commandId, aggregateId, events, result, actorId = 'system', traceId },
) {
  // 1. Idempotency check
  const prior = await fetchCachedResult(client, commandsTable, commandId);
  if (prior) {
    return { cached: true, events: [], result: prior.result };
  }

  // 2. Enrich events with metadata (eventId, wallTime, simulatedTime, etc.)
  const now = Date.now();
  const wallTime = new Date(now).toISOString();
  const offset = getOffset ? await getOffset() : { offsetMs: 0 };
  const simulatedTime = new Date(now + offset.offsetMs).toISOString();
  const eventRecords = events.map((e) => ({
    aggregateId,
    seq: e.seq,
    eventId: ulid(),
    eventType: e.eventType,
    version: e.version,
    commandId,
    actorId,
    wallTime,
    simulatedTime,
    // PK of the events-by-time-bucket GSI: one partition per simulated day,
    // for cross-aggregate replay and analytics (docs/event-sourcing.md).
    bucket: simulatedTime.slice(0, 10),
    data: e.data,
    ...(traceId !== undefined && { traceId }),
  }));

  // 3. Project enriched events to state-table writes.
  //    Projections run on CLEARTEXT events — the state rows are the read
  //    model and are hard-deleted on account deletion, so they don't need
  //    shredding. Only the immutable event log does.
  const stateWrites = projector ? projector.applyTo(eventRecords) : [];

  // 3b. Crypto-shred: encrypt PII fields on the records bound for the
  //     event log. Skipped entirely for aggregates with no PII events
  //     (e.g. workshop-time) so they never get a key.
  let logRecords = eventRecords;
  if (keyStore && piiFieldsFor) {
    const anyPii = eventRecords.some((r) => piiFieldsFor(r.eventType).length > 0);
    if (anyPii) {
      const dataKey = await keyStore.getOrCreateKey(aggregateId);
      logRecords = eventRecords.map((r) => {
        const fields = piiFieldsFor(r.eventType);
        if (fields.length === 0) return r;
        return { ...r, data: encryptPii(r.data, fields, dataKey) };
      });
    }
  }

  // 4. Build the transaction
  const ttl = Math.floor(Date.now() / 1000) + COMMAND_TTL_SECONDS;
  const commandPut = {
    Put: {
      TableName: commandsTable,
      Item: {
        commandId,
        result,
        eventId: eventRecords[0]?.eventId,
        createdAt: wallTime,
        ttl,
      },
      ConditionExpression: 'attribute_not_exists(commandId)',
    },
  };

  const eventPuts = logRecords.map((item) => ({
    Put: {
      TableName: eventsLogTable,
      Item: item,
      ConditionExpression: 'attribute_not_exists(seq)',
    },
  }));

  const transactItems = [commandPut, ...eventPuts, ...stateWrites];

  // 5. Execute
  try {
    await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (err) {
    if (
      err.name === 'TransactionCanceledException'
      && err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed'
    ) {
      const concurrent = await fetchCachedResult(client, commandsTable, commandId);
      if (concurrent) {
        return { cached: true, events: [], result: concurrent.result };
      }
    }
    throw err;
  }

  return { cached: false, events: eventRecords, result };
}

async function fetchCachedResult(client, commandsTable, commandId) {
  const out = await client.send(new GetCommand({
    TableName: commandsTable,
    Key: { commandId },
  }));
  return out.Item || null;
}
