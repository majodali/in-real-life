// Generate a deploy-ready src tree with runtime config substituted into
// app.html, then sync the result to S3 and invalidate CloudFront.
//
// Reads CDK outputs from the named stack (via `aws cloudformation
// describe-stacks`) and replaces the __IRL_*__ placeholders in
// src/app.html with the right values for that stack.
//
// Usage:
//   node infrastructure/scripts/inject-config.mjs <stack> [--dry-run]
//
//   stack      The CloudFormation stack name to read outputs from.
//              e.g. IrlStack, IrlStackTest, IrlStackProd.
//   --dry-run  Print the substituted app.html to stdout; don't deploy.
//
// Optional env:
//   IRL_BUCKET            Override site bucket name (default: from outputs)
//   IRL_DISTRIBUTION_ID   Override CloudFront distribution id (default: from outputs)
//   AWS_REGION            Default: us-east-1
//
// This script will eventually be wrapped by the deploy Lambda. Keeping
// it as a CLI for now lets manual deploys keep working through the
// migration.

import { spawnSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const srcDir = join(repoRoot, 'src');
const distDir = join(repoRoot, 'dist');

const stack = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const region = process.env.AWS_REGION || 'us-east-1';

if (!stack) {
  console.error('Usage: node infrastructure/scripts/inject-config.mjs <stack> [--dry-run]');
  process.exit(1);
}

function aws(args) {
  const out = spawnSync('aws', args, { encoding: 'utf-8' });
  if (out.status !== 0) {
    throw new Error(`aws ${args.join(' ')} failed: ${out.stderr.trim()}`);
  }
  return out.stdout.trim();
}

function readOutputs(stackName) {
  const json = aws([
    'cloudformation', 'describe-stacks',
    '--region', region,
    '--stack-name', stackName,
    '--query', 'Stacks[0].Outputs',
    '--output', 'json',
  ]);
  const outputs = JSON.parse(json);
  const map = {};
  for (const o of outputs) map[o.OutputKey] = o.OutputValue;
  return map;
}

const outputs = readOutputs(stack);

const required = (key, friendly) => {
  const v = outputs[key];
  if (!v) throw new Error(`Stack ${stack} is missing output ${key} (${friendly}). Has it been deployed?`);
  return v;
};

const config = {
  __IRL_API_BASE_URL__: required('ApiUrl', 'API URL'),
  __IRL_COGNITO_REGION__: region,
  __IRL_COGNITO_USER_POOL_ID__: required('UserPoolId', 'Cognito user pool id'),
  __IRL_COGNITO_USER_POOL_CLIENT_ID__: required('UserPoolClientId', 'Cognito user pool client id'),
  __IRL_FEEDBACK_URL__: outputs.FeedbackUrl ?? '', // optional
};

const htmlIn = readFileSync(join(srcDir, 'app.html'), 'utf-8');
let htmlOut = htmlIn;
for (const [placeholder, value] of Object.entries(config)) {
  htmlOut = htmlOut.split(placeholder).join(value);
}

if (dryRun) {
  process.stdout.write(htmlOut);
  process.exit(0);
}

// Build a clean dist/ that mirrors src/ with the substituted app.html.
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(srcDir, distDir, { recursive: true });
writeFileSync(join(distDir, 'app.html'), htmlOut);

// Drop the colocated test files; they're not part of the runtime bundle.
for (const f of walk(distDir)) {
  if (f.endsWith('.test.mjs')) rmSync(f);
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const bucket = process.env.IRL_BUCKET ?? required('BucketName', 'site bucket name');
const distId = process.env.IRL_DISTRIBUTION_ID ?? outputs.DistributionId;

console.log(`Syncing dist/ → s3://${bucket}/`);
spawnSync('aws', [
  's3', 'sync', distDir + '/', `s3://${bucket}/`,
  '--delete',
], { stdio: 'inherit' });

if (distId) {
  console.log(`Invalidating CloudFront ${distId}`);
  spawnSync('aws', [
    'cloudfront', 'create-invalidation',
    '--distribution-id', distId,
    '--paths', '/*',
  ], { stdio: 'inherit' });
} else {
  console.log('No DistributionId output on stack — skipping CloudFront invalidation.');
}

console.log('Done.');
