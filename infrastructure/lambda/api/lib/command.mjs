// Command idempotency wrapper.
//
// runCommand owns the full event lifecycle: enrich → project → transact.
// The projector receives enriched events (with eventId, wallTime, etc.) so
// projection functions can reference event metadata. See command.test.mjs
// for the spec and docs/event-sourcing.md for the design rationale.
//
// Observability (event-sourcing.md → Tracing & observability): every
// invocation emits exactly one structured JSON log line (status ok /
// cached / error, with durationMs), X-Ray subsegments wrap the phases,
// and the invocation's traceId is stamped on each event record so the
// log line, the trace, and the log rows all correlate.

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
  tracer,
  log = (line) => console.log(JSON.stringify(line)),
}) {
  const deps = {
    client,
    commandsTable,
    eventsLogTable,
    projector,
    getOffset,
    keyStore,
    piiFieldsFor,
    trace: tracer ? (name, fn) => tracer.subsegment(name, fn) : (_name, fn) => fn(),
    tracer,
  };
  return {
    runCommand: async (input) => {
      const startedAt = Date.now();
      const line = {
        level: 'info',
        traceId: input.traceId ?? tracer?.traceId(),
        commandId: input.commandId,
        eventType: input.events?.[0]?.eventType,
        actorId: input.actorId ?? 'system',
        aggregateId: input.aggregateId,
        seq: input.events?.[0]?.seq,
      };
      try {
        const out = await runCommand(deps, input);
        log({
          ...line,
          eventId: out.events[0]?.eventId ?? out.priorEventId,
          status: out.cached ? 'cached' : 'ok',
          durationMs: Date.now() - startedAt,
        });
        const { priorEventId, ...publicOut } = out;
        return publicOut;
      } catch (err) {
        log({
          ...line,
          level: 'error',
          status: 'error',
          errorType: err?.name ?? 'Error',
          error: err?.message,
          stack: err?.stack,
          durationMs: Date.now() - startedAt,
        });
        throw err;
      }
    },
  };
}

async function runCommand(
  { client, commandsTable, eventsLogTable, projector, getOffset, keyStore, piiFieldsFor, trace, tracer },
  { commandId, aggregateId, events, result, actorId = 'system', traceId },
) {
  const effectiveTraceId = traceId ?? tracer?.traceId();

  // 1. Idempotency check
  const prior = await trace('idempotency-check', () =>
    fetchCachedResult(client, commandsTable, commandId));
  if (prior) {
    return { cached: true, events: [], result: prior.result, priorEventId: prior.eventId };
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
    ...(effectiveTraceId !== undefined && { traceId: effectiveTraceId }),
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
      const dataKey = await trace('encrypt-pii', () => keyStore.getOrCreateKey(aggregateId));
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
    await trace('transact-write', () =>
      client.send(new TransactWriteCommand({ TransactItems: transactItems })));
  } catch (err) {
    if (
      err.name === 'TransactionCanceledException'
      && err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed'
    ) {
      const concurrent = await fetchCachedResult(client, commandsTable, commandId);
      if (concurrent) {
        return { cached: true, events: [], result: concurrent.result, priorEventId: concurrent.eventId };
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
