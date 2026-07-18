// Projector self-diagnosis for the functional suite.
//
// A poll timeout on the user-model store is a symptom with several
// distinct causes (stalled event-source mapping, DLQ'd batches, a runtime
// error in the projector, plain slowness). Instead of failing blind, the
// suite gathers what the runner's credentials can see and folds it into
// the error message, so a red run IS the diagnosis:
//
//   - DLQ depth (ApproximateNumberOfMessages) + one sample body
//   - recent 'projector failed' log lines from the Lambda's log group
//   - whether the user-model table has ANY rows at all (a projector that
//     has never written differs from one that's merely behind)
//
// Every probe is best-effort: missing outputs, missing IAM, or a missing
// log group degrade to a note, never a throw.
//
// The CI test-runner role needs (grant in the ops repo; each denial below
// names its own requirement):
//   dynamodb:Scan          on table/irl-user-model-*
//   sqs:GetQueueAttributes + sqs:ReceiveMessage on the projector DLQ
//   logs:FilterLogEvents   on log-group:/aws/lambda/<projector fn>*

import { SQSClient, GetQueueAttributesCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './cleanup.mjs';

const REGION = process.env.AWS_REGION || 'us-east-1';

export async function projectorDiagnostics(config) {
  const notes = [];

  // DLQ depth + a sample of what died.
  if (config.projectorDlqUrl) {
    try {
      const sqs = new SQSClient({ region: REGION });
      const attrs = await sqs.send(new GetQueueAttributesCommand({
        QueueUrl: config.projectorDlqUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      }));
      const depth = attrs.Attributes?.ApproximateNumberOfMessages ?? '?';
      notes.push(`DLQ depth: ${depth}`);
      if (Number(depth) > 0) {
        const sample = await sqs.send(new ReceiveMessageCommand({
          QueueUrl: config.projectorDlqUrl,
          MaxNumberOfMessages: 1,
          VisibilityTimeout: 0, // peek — leave the message in place
        }));
        const body = sample.Messages?.[0]?.Body;
        if (body) notes.push(`DLQ sample: ${body.slice(0, 400)}`);
      }
    } catch (err) {
      notes.push(`DLQ peek unavailable (${err?.name}) — CI role needs sqs:GetQueueAttributes + sqs:ReceiveMessage on the projector DLQ`);
    }
  } else {
    notes.push('DLQ URL not in stack outputs (deploy predates ProjectorDlqUrl?)');
  }

  // Recent projector error lines.
  if (config.projectorFunctionName) {
    try {
      const logs = new CloudWatchLogsClient({ region: REGION });
      const out = await logs.send(new FilterLogEventsCommand({
        logGroupName: `/aws/lambda/${config.projectorFunctionName}`,
        startTime: Date.now() - 30 * 60 * 1000,
        filterPattern: '?"projector failed" ?"ERROR" ?"Task timed out"',
        limit: 5,
      }));
      const lines = (out.events ?? []).map((e) => e.message.trim().slice(0, 300));
      notes.push(lines.length
        ? `recent projector errors:\n    ${lines.join('\n    ')}`
        : 'no projector errors in the last 30m');
    } catch (err) {
      notes.push(`log peek unavailable (${err?.name}) — CI role needs logs:FilterLogEvents on /aws/lambda/<projector fn>`);
    }
  } else {
    notes.push('projector function name not in stack outputs');
  }

  // Has the projector EVER written here?
  try {
    const scan = await ddb.send(new ScanCommand({
      TableName: config.tables.userModel,
      Limit: 3,
      ProjectionExpression: 'userId, sk',
    }));
    const rows = scan.Items ?? [];
    notes.push(rows.length
      ? `user-model has rows (sample: ${rows.map((r) => r.sk).join(', ')})`
      : 'user-model table is EMPTY — the projector may never have written');
  } catch (err) {
    notes.push(`user-model scan unavailable (${err?.name}) — CI role needs dynamodb:Scan on irl-user-model-*`);
  }

  return notes.join('\n  ');
}
