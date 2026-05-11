// Command idempotency wrapper.
//
// runCommand owns the full event lifecycle: enrich → project → transact.
// The projector receives enriched events (with eventId, wallTime, etc.) so
// projection functions can reference event metadata. See command.test.mjs
// for the spec and docs/event-sourcing.md for the design rationale.

import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from './ulid.mjs';

const COMMAND_TTL_SECONDS = 24 * 3600;

export function createCommandRunner({ client, commandsTable, eventsLogTable, projector, getOffset }) {
  return {
    runCommand: (input) => runCommand({ client, commandsTable, eventsLogTable, projector, getOffset }, input),
  };
}

async function runCommand(
  { client, commandsTable, eventsLogTable, projector, getOffset },
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
    data: e.data,
    ...(traceId !== undefined && { traceId }),
  }));

  // 3. Project enriched events to state-table writes
  const stateWrites = projector ? projector.applyTo(eventRecords) : [];

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

  const eventPuts = eventRecords.map((item) => ({
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
