#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { IrlStack } from '../lib/irl-stack.js';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

// Workshop stack — keeps the existing CFN stack name 'IrlStack' so the
// already-deployed site/Route53/ACM resources aren't orphaned.
new IrlStack(app, 'IrlStack', {
  env,
  stage: 'workshop',
});

// Test stack — backend-only (no site, no DNS, no custom domain).
// Functional tests target this stack's API Gateway URL.
new IrlStack(app, 'IrlStackTest', {
  env,
  stage: 'test',
});
