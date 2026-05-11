// Loads the test stack's CDK outputs once per test run.

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

const STACK_NAME = process.env.TEST_STACK_NAME || 'IrlStackTest';
const REGION = process.env.AWS_REGION || 'us-east-1';

let cached;

export async function loadTestConfig() {
  if (cached) return cached;
  const cf = new CloudFormationClient({ region: REGION });
  const out = await cf.send(new DescribeStacksCommand({ StackName: STACK_NAME }));
  const outputs = out.Stacks?.[0]?.Outputs ?? [];
  const get = (k) => outputs.find((o) => o.OutputKey === k)?.OutputValue;

  const stage = get('Stage') || 'test';
  cached = {
    apiUrl: get('ApiUrl'),
    userPoolId: get('UserPoolId'),
    userPoolClientId: get('UserPoolClientId'),
    stage,
    region: REGION,
    tables: {
      users: `irl-users-${stage}`,
      eventsLog: `irl-events-log-${stage}`,
      commands: `irl-commands-${stage}`,
      config: `irl-config-${stage}`,
    },
  };

  for (const k of ['apiUrl', 'userPoolId', 'userPoolClientId']) {
    if (!cached[k]) {
      throw new Error(`missing CDK output ${k} on ${STACK_NAME} — has the stack been deployed?`);
    }
  }
  return cached;
}
