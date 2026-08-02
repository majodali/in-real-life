// The Safety panel's backend — the conduct-concern queue (activity
// register E2; the gap the July ops review surfaced: a member's
// conductConcern landed on the log and NOTHING read it).
//
//   GET  /admin/conduct-concerns     — open concerns, oldest first
//   POST /admin/conduct-concerns/ack — event-sourced acknowledgment
//
// D64 discipline, with its one named exception (recorded in
// admin-and-support.md → Safety): debrief content never reaches the
// console — EXCEPT the conduct note, readable here and only here.
// This is the safety-ops read the conduct quarantine was designed to
// enable (the flag stays cleartext for exactly this; the note is
// PII-encrypted under the reporter's key and decrypted server-side
// for the reviewing admin). Acknowledgment is a real command with the
// admin as audited actor — the queue empties through the log, never
// through an untracked click. The fuller due-process machinery
// (blocks, reporting, adjudication — D35/D50) remains Group 4 work;
// this is the inbox and the audit trail, deliberately minimal.

import { GetCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { decryptPii } from '../lib/crypto-shred.mjs';
import { piiFieldsFor } from '../lib/pii-registry.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function requireAdmin(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || !claims.sub) return { error: reply(401, { error: 'unauthorized' }) };
  if (claims['custom:role'] !== 'admin') return { error: reply(403, { error: 'admin only' }) };
  return { adminId: claims.sub };
}

export function createConductQueueHandler({
  client, interactionsTable, eventsTable, usersTable, eventsLogTable, keyStore,
}) {
  // The reporter's conduct note lives ONLY on the log event, encrypted
  // under the reporter's own user# key (piiKeyIdFor). A missing key
  // (deleted reporter) degrades to note-unavailable, never to an error.
  async function readNote(userId, eventId) {
    try {
      const out = await client.send(new QueryCommand({
        TableName: eventsLogTable,
        KeyConditionExpression: 'aggregateId = :a',
        ExpressionAttributeValues: { ':a': `interaction#${userId}#${eventId}` },
      }));
      const record = (out.Items ?? []).find(
        (e) => e.eventType === 'DebriefSubmitted' && e.data?.conductConcern === true,
      );
      if (!record) return null;
      const key = await keyStore.getKey(`user#${userId}`);
      if (!key) return null;
      const data = decryptPii(record.data, piiFieldsFor('DebriefSubmitted'), key);
      return data.conductNote ?? null;
    } catch {
      return null;
    }
  }

  return async function handler(event) {
    const gate = requireAdmin(event);
    if (gate.error) return gate.error;

    // Scan-with-filter at admin cadence (same call as the verification
    // queue): open = concern flagged, not yet acknowledged.
    const rows = [];
    let ExclusiveStartKey;
    do {
      const out = await client.send(new ScanCommand({
        TableName: interactionsTable,
        FilterExpression: '#d.conductConcern = :true AND attribute_not_exists(conductAckAt)',
        ExpressionAttributeNames: { '#d': 'debrief' },
        ExpressionAttributeValues: { ':true': true },
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }));
      rows.push(...(out.Items ?? []));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    rows.sort((a, b) => String(a.debrief?.submittedAt ?? '')
      .localeCompare(String(b.debrief?.submittedAt ?? '')));

    const concerns = [];
    for (const row of rows) {
      const [eventRow, userRow, note] = await Promise.all([
        client.send(new GetCommand({ TableName: eventsTable, Key: { eventId: row.eventId } }))
          .then((o) => o.Item ?? null).catch(() => null),
        client.send(new GetCommand({ TableName: usersTable, Key: { userId: row.userId } }))
          .then((o) => o.Item ?? null).catch(() => null),
        readNote(row.userId, row.eventId),
      ]);
      concerns.push({
        userId: row.userId,
        eventId: row.eventId,
        // Reporter identity: the follow-up conversation needs it — same
        // basics-only bar as the verification queue, nothing more.
        reporterName: userRow?.name ?? null,
        reporterEmail: userRow?.email ?? null,
        eventTitle: eventRow?.title ?? null,
        submittedAt: row.debrief?.submittedAt ?? null,
        note,
      });
    }

    return reply(200, { concerns, count: concerns.length });
  };
}

export function createAckConductHandler({ runner, client, interactionsTable }) {
  return async function handler(event) {
    const gate = requireAdmin(event);
    if (gate.error) return gate.error;

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }
    const { commandId, userId, eventId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!userId || !eventId) return reply(400, { error: 'userId and eventId required' });

    const row = await client.send(new GetCommand({
      TableName: interactionsTable, Key: { userId, eventId },
    })).then((o) => o.Item ?? null);
    if (!row) return reply(404, { error: 'interaction not found' });
    if (row.debrief?.conductConcern !== true) {
      return reply(409, { error: 'no conduct concern on this debrief' });
    }
    if (row.conductAckAt) return reply(409, { error: 'already acknowledged' });

    // Acknowledgment means "a human has seen this and taken it up" —
    // it is the audit record, not the resolution (resolution machinery
    // is Group 4's due-process work).
    try {
      const out = await runner.runCommand({
        commandId,
        aggregateId: `interaction#${userId}#${eventId}`,
        actorId: `user#${gate.adminId}`,
        events: [{
          eventType: 'ConductConcernAcknowledged',
          version: 1,
          seq: row.seq + 1,
          data: { userId, eventId, acknowledgedBy: gate.adminId },
        }],
        result: { userId, eventId, acknowledged: true },
      });
      return reply(out.cached ? 200 : 201, out.result);
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'state changed underneath — reload the queue' });
      }
      throw err;
    }
  };
}

// Cheap count for the health panel's safety line — same open-concern
// filter, COUNT only.
export async function countOpenConductConcerns({ client, scanCommand, interactionsTable }) {
  let total = 0;
  let ExclusiveStartKey;
  do {
    const out = await client.send(new scanCommand({
      TableName: interactionsTable,
      Select: 'COUNT',
      FilterExpression: '#d.conductConcern = :true AND attribute_not_exists(conductAckAt)',
      ExpressionAttributeNames: { '#d': 'debrief' },
      ExpressionAttributeValues: { ':true': true },
      ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
    }));
    total += out.Count ?? 0;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return total;
}
