// Route handler for GET /admin/health — the self-diagnosing deploy,
// promoted (docs/admin-and-support.md → Health).
//
// The cheap, always-true reads the functional suite's diagnose.mjs
// already proved out: projector DLQ depth (the one number that says
// "the model store is falling behind"), config sanity, and a table
// pulse. Every probe is independently failure-tolerant — a broken
// probe reports itself broken; it never takes the panel down.
// Logs/traces stay in CloudWatch/X-Ray (linked, not rebuilt).

import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { countOpenConductConcerns } from './conduct.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

async function probe(fn) {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'probe failed' };
  }
}

// sqs / ddbControl are injected AWS SDK clients (SQSClient /
// DynamoDBClient) plus their command constructors — injected whole so
// tests never mock module internals.
export function createAdminHealthHandler({
  client, tables, stage, mode,
  sqs, getQueueAttributesCommand, dlqUrl,
  ddbControl, describeTableCommand,
  getOffset,
}) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });
    if (claims['custom:role'] !== 'admin') return reply(403, { error: 'admin only' });

    const projector = await probe(async () => {
      if (!sqs || !dlqUrl) return { skipped: 'no DLQ configured' };
      const out = await sqs.send(new getQueueAttributesCommand({
        QueueUrl: dlqUrl,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
      }));
      return {
        dlqDepth: Number(out.Attributes?.ApproximateNumberOfMessages ?? 0),
        dlqInFlight: Number(out.Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0),
      };
    });

    const config = await probe(async () => {
      const [agreement, offset] = await Promise.all([
        client.send(new GetCommand({
          TableName: tables.configTable,
          Key: { configKey: 'required_user_agreement_version' },
        })),
        getOffset ? getOffset() : Promise.resolve(null),
      ]);
      return {
        requiredAgreementVersion: agreement.Item?.value ?? null,
        workshopOffsetMs: offset?.offsetMs ?? 0,
        simulatedTime: new Date(Date.now() + (offset?.offsetMs ?? 0)).toISOString(),
      };
    });

    // Approximate item counts (DescribeTable updates ~6-hourly) — a
    // pulse, not an audit.
    const storePulse = await probe(async () => {
      const watched = {
        users: tables.usersTable,
        events: tables.eventsTable,
        interactions: tables.interactionsTable,
        eventsLog: tables.eventsLogTable,
        userModel: tables.userModelTable,
        commands: tables.commandsTable,
      };
      const counts = {};
      for (const [name, tableName] of Object.entries(watched)) {
        if (!tableName) continue;
        const out = await ddbControl.send(new describeTableCommand({ TableName: tableName }));
        counts[name] = out.Table?.ItemCount ?? null;
      }
      return { approximateItemCounts: counts };
    });

    // Safety pulse (activity register E2): the one count that must
    // never sit unnoticed — open conduct concerns.
    const safety = await probe(async () => ({
      openConductConcerns: await countOpenConductConcerns({
        client, scanCommand: ScanCommand, interactionsTable: tables.interactionsTable,
      }),
    }));

    return reply(200, { stage, mode, projector, config, storePulse, safety });
  };
}
