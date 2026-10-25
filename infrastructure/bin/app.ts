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
// The ops repo is the authority for real environments; this path is for
// standalone dev synth. Concurrent workshops live there, not here.
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

// `--context stacks=<json>` arrives as a STRING (cdk.json context
// arrives parsed). Without this, iterating the string yields single
// characters and CDK builds one nameless stack with an undefined
// stage — a confusing failure a long way from its cause.
const rawStacks = app.node.tryGetContext('stacks');
const stacks: StackConfig[] = rawStacks === undefined
  ? defaults
  : (typeof rawStacks === 'string' ? JSON.parse(rawStacks) : rawStacks);
if (!Array.isArray(stacks)) {
  throw new Error('Context "stacks" must be an array of stack configs.');
}

// Stage is the resource namespace, not just the mode flag (see the
// Stage type). Two stacks sharing one collide on every physical name.
const stages = stacks.map((cfg) => cfg.stage);
const duplicate = stages.find((stage, i) => stages.indexOf(stage) !== i);
if (duplicate) {
  throw new Error(
    `Two stacks share stage "${duplicate}". Every physical resource name is `
    + 'keyed on stage, so the second deploy would fail. Give each its own '
    + "(e.g. 'workshop-oak').",
  );
}

for (const cfg of stacks) {
  new IrlStack(app, cfg.id, {
    env,
    stage: cfg.stage,
    domain: cfg.apex ? { apex: cfg.apex } : undefined,
  });
}
