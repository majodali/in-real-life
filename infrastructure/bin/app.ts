#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { IrlStack, Stage } from '../lib/irl-stack.js';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  // Ambient region (the credentials' default), falling back to
  // us-east-1 — the legacy shared-account region. The dedicated
  // accounts deploy workloads in us-west-2 (ops account-strategy);
  // CI sets the region via its credentials config, and the ops repo
  // app pins regions explicitly per stack.
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Per-stack configuration is read from CDK context so deploying to a
// different account / domain only requires changing cdk.json (or passing
// `--context apex=<domain>` on the command line). The ops repo holds the
// authoritative context for prod and named-workshop stacks.
//
// Defaults below match the current dev deploys (IrlStack + IrlStackTest).
type StackConfig = {
  id: string;        // CloudFormation stack name
  stage: Stage;
  apex?: string;     // Custom apex domain — site served here, API at api.<apex>
};

const defaults: StackConfig[] = [
  // Workshop stack — keeps the CFN stack name 'IrlStack' so deployed
  // site/Route53/ACM resources aren't orphaned.
  { id: 'IrlStack', stage: 'workshop', apex: 'in-real.life' },
  // Test stack — backend-only (no site, no DNS, no custom domain).
  // Functional tests target the raw API Gateway URL.
  { id: 'IrlStackTest', stage: 'test' },
];

const stacks: StackConfig[] = app.node.tryGetContext('stacks') ?? defaults;

for (const cfg of stacks) {
  new IrlStack(app, cfg.id, {
    env,
    stage: cfg.stage,
    domain: cfg.apex ? { apex: cfg.apex } : undefined,
  });
}
