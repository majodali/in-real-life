// Loads the test stack's CDK outputs once per test run.

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { awsRegion, awsContext } from './region.mjs';

const STACK_NAME = process.env.TEST_STACK_NAME || 'IrlStackTest';
const REGION = awsRegion();

let cached;

export async function loadTestConfig() {
  if (cached) return cached;
  const cf = new CloudFormationClient({ region: REGION });
  let out;
  try {
    out = await cf.send(new DescribeStacksCommand({ StackName: STACK_NAME }));
  } catch (err) {
    // "does not exist" is almost always the wrong region or the wrong
    // credentials, not a missing deploy — say which ones were used.
    throw new Error(
      `Could not read stack ${STACK_NAME} (${awsContext()}): ${err.message}\n`
      + 'If the stack is deployed, check that this region and profile are the '
      + 'ones you deployed to (workloads are in us-west-2; export AWS_REGION '
      + 'and AWS_PROFILE, or set a region on the profile).',
      { cause: err },
    );
  }
  const outputs = out.Stacks?.[0]?.Outputs ?? [];
  const get = (k) => outputs.find((o) => o.OutputKey === k)?.OutputValue;

  const stage = get('Stage') || 'test';
  cached = {
    apiUrl: get('ApiUrl'),
    userPoolId: get('UserPoolId'),
    userPoolClientId: get('UserPoolClientId'),
    // Optional (older deploys may predate them): projector observability.
    projectorFunctionName: get('ProjectorFunctionName'),
    projectorDlqUrl: get('ProjectorDlqUrl'),
    stage,
    region: REGION,
    tables: {
      users: `irl-users-${stage}`,
      events: `irl-events-${stage}`,
      interactions: `irl-interactions-${stage}`,
      suggestions: `irl-suggestions-${stage}`,
      suggestionVotes: `irl-suggestion-votes-${stage}`,
      polls: `irl-polls-${stage}`,
      pollVotes: `irl-poll-votes-${stage}`,
      eventsLog: `irl-events-log-${stage}`,
      commands: `irl-commands-${stage}`,
      config: `irl-config-${stage}`,
      userKeys: `irl-user-keys-${stage}`,
      userModel: `irl-user-model-${stage}`,
    },
  };

  for (const k of ['apiUrl', 'userPoolId', 'userPoolClientId']) {
    if (!cached[k]) {
      throw new Error(`missing CDK output ${k} on ${STACK_NAME} — has the stack been deployed?`);
    }
  }
  return cached;
}
