// Generate a deploy-ready src tree with runtime config substituted into
// app.html, then sync the result to S3 and invalidate CloudFront.
//
// Reads CDK outputs from the named stack (via `aws cloudformation
// describe-stacks`) and replaces the __IRL_*__ placeholders in
// src/app.html with the right values for that stack.
//
// Usage:
//   node infrastructure/scripts/inject-config.mjs <stack> [--copy-variant <name>] [--dry-run]
//
//   stack           The CloudFormation stack name to read outputs from.
//                   e.g. IrlStack, IrlStackTest, IrlStackProd.
//   --copy-variant  Layer a review variant of the page copy over the
//                   base bundle (src/copy/variants/<name>.js; workshop
//                   stacks only — docs/page-copy.md §5). Without it the
//                   stack serves the base copy.
//   --dry-run       Print the substituted app.html to stdout; don't deploy.
//
// Optional env:
//   IRL_BUCKET            Override site bucket name (default: from outputs)
//   IRL_DISTRIBUTION_ID   Override CloudFront distribution id (default: from outputs)
//   AWS_REGION            Default: the active profile's configured region
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
import { renderRegisters } from './render-registers.mjs';
import { renderCopy, baseCopy } from './render-copy.mjs';
import { checkVariant, findVariant, activeModule } from './copy-variants.mjs';
import { runDeployStep } from './deploy-step.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const srcDir = join(repoRoot, 'src');
const distDir = join(repoRoot, 'dist');

const stack = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const variantFlag = process.argv.indexOf('--copy-variant');
const variantName = variantFlag > 0 ? process.argv[variantFlag + 1] : undefined;
if (variantFlag > 0 && (!variantName || variantName.startsWith('--'))) {
  console.error('--copy-variant needs a name (src/copy/variants/index.js lists them).');
  process.exit(1);
}

// Region resolution: explicit env wins, then the active profile's
// configured default (respects AWS_PROFILE). NO hardcoded fallback —
// this value is not just CLI plumbing, it is substituted into the app
// as __IRL_COGNITO_REGION__, so a wrong guess ships a site pointed at
// the wrong Cognito region (and reads stack outputs from the wrong
// region — "Stack does not exist").
function profileRegion() {
  const out = spawnSync('aws', ['configure', 'get', 'region'], { encoding: 'utf-8' });
  return out.status === 0 ? out.stdout.trim() : '';
}
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || profileRegion();
if (!region) {
  console.error('No AWS region: set AWS_REGION or configure a default region on the active profile.');
  process.exit(1);
}

if (!stack) {
  console.error('Usage: node infrastructure/scripts/inject-config.mjs <stack> [--copy-variant <name>] [--dry-run]');
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
  // Per-tab identity isolation flag (docs/admin-and-support.md):
  // everything but prod is a workshop stack, mirroring the API's rule.
  __IRL_WORKSHOP_MODE__: String((outputs.Stage ?? 'workshop') !== 'prod'),
};

const workshop = config.__IRL_WORKSHOP_MODE__ === 'true';

// A review variant of the page copy (docs/page-copy.md §5): workshop
// stacks only, and checked again here — a variant that rewords the
// Terms or names a key the base lacks never ships.
let variant = {};
if (variantName) {
  if (!workshop) {
    console.error(`Stack ${stack} is not a workshop stack: copy variants are for review rounds, never production.`);
    process.exit(1);
  }
  variant = findVariant(variantName).default;
  const problems = checkVariant(variant);
  if (problems.length) {
    console.error(`Copy variant "${variantName}" cannot ship:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Copy variant: ${variantName} (${Object.keys(variant).length} keys over the base)`);
}

// Pages this script owns. app.html takes the full runtime config; the
// public pages carry only the workshop flag (they offer the design
// switcher on workshop stacks — docs/ui-themes.md) and name their copy
// by key, filled here from the bundle (docs/page-copy.md), with the
// variant's keys over it. The copy review page is a workshop tool. CDK's
// own site upload excludes all of them, and copy/active.js
// (irl-stack.ts → DeploySite), so a half-finished deploy can never
// publish one unfilled or mismatched.
const PAGES = ['app.html', 'index.html', 'terms.html', 'copy-review.html'];
const copy = baseCopy(variant);

function substitute(name) {
  let html = renderCopy(readFileSync(join(srcDir, name), 'utf-8'), copy).html;
  for (const [placeholder, value] of Object.entries(config)) {
    html = html.split(placeholder).join(value);
  }
  return html;
}

const htmlOut = substitute('app.html');

if (dryRun) {
  process.stdout.write(htmlOut);
  process.exit(0);
}

// Build a clean dist/ that mirrors src/ with the substituted app.html.
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(srcDir, distDir, { recursive: true });
for (const name of PAGES) {
  writeFileSync(join(distDir, name), name === 'app.html' ? htmlOut : substitute(name));
}
// Which variant the app's screens layer over the base (src/copy/active.js
// ships as "none"); production never carries the review page.
if (variantName) writeFileSync(join(distDir, 'copy', 'active.js'), activeModule(variantName));
if (!workshop) rmSync(join(distDir, 'copy-review.html'));

// Drop the colocated test files; they're not part of the runtime bundle.
for (const f of walk(distDir)) {
  if (f.endsWith('.test.mjs')) rmSync(f);
}

// Generate the public register views (K-009, docs/hosted-register-views.md)
// into the bundle — every site deploy republishes the latest snapshot.
const registers = renderRegisters(join(distDir, 'registers'));
console.log(`Rendered ${registers.count} register pages (rev ${registers.revision})`);

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

// Cache-Control: no-cache — a browser may keep a file but must check it
// with the server (ETag → 304) before using it, so the first load after
// a deploy never mixes old and new modules. Without the header browsers
// guess a lifetime from Last-Modified. dist/ is rebuilt on every run, so
// every file is newer than its S3 copy and is re-uploaded with it.
// Both AWS steps must succeed, or the deploy stops here and says which
// step failed and against what — never "Done." over a site that did not
// change.
const where = { bucket: `s3://${bucket}`, region, profile: process.env.AWS_PROFILE };
try {
  console.log(`Syncing dist/ → s3://${bucket}/`);
  runDeployStep('upload', [
    's3', 'sync', distDir + '/', `s3://${bucket}/`,
    '--delete',
    '--cache-control', 'no-cache',
  ], {
    where,
    after: 'Some files may have uploaded and others not, so the site can be a mix of old and new: fix the cause and run this script again.',
  });

  if (distId) {
    console.log(`Invalidating CloudFront ${distId}`);
    runDeployStep('invalidation', [
      'cloudfront', 'create-invalidation',
      '--distribution-id', distId,
      '--paths', '/*',
    ], {
      where: { ...where, distribution: distId },
      after: 'The files are uploaded; run this script again, or invalidate /* on the distribution by hand.',
    });
  } else {
    console.log('No DistributionId output on stack — skipping CloudFront invalidation.');
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}

console.log(`Done: s3://${bucket}${distId ? `, CloudFront ${distId} invalidated` : ''}.`);
