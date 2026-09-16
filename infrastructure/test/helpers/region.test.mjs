// Guards the wrong-region failure mode: a hardcoded fallback made
// "Stack with id IrlStackTest does not exist" the default outcome
// after workloads moved to us-west-2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const helperDir = dirname(fileURLToPath(import.meta.url));
const importRegion = `import('${join(helperDir, 'region.mjs').replaceAll('\\', '/')}')`;

// A clean env: no region vars, and a PATH-less shell so a developer
// machine's `aws configure get region` can't answer either.
function runWith(env, code) {
  return spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf-8',
    env: { ...process.env, AWS_REGION: '', AWS_DEFAULT_REGION: '', PATH: '', ...env },
  });
}

test('AWS_REGION wins', () => {
  const out = runWith({ AWS_REGION: 'us-west-2' },
    `${importRegion}.then(m => console.log(m.awsRegion()))`);
  assert.equal(out.stdout.trim(), 'us-west-2');
});

test('AWS_DEFAULT_REGION is honored when AWS_REGION is unset', () => {
  const out = runWith({ AWS_DEFAULT_REGION: 'eu-west-1' },
    `${importRegion}.then(m => console.log(m.awsRegion()))`);
  assert.equal(out.stdout.trim(), 'eu-west-1');
});

test('no resolvable region fails loudly — never a guessed default', () => {
  const out = runWith({},
    `${importRegion}.then(m => m.awsRegion()).catch(e => { console.log(e.message); })`);
  assert.match(out.stdout, /No AWS region/);
  assert.doesNotMatch(out.stdout, /us-east-1/);
});

test('awsContext names the region and profile actually in use', () => {
  const out = runWith({ AWS_REGION: 'us-west-2', AWS_PROFILE: 'irl-nonprod' },
    `${importRegion}.then(m => console.log(m.awsContext()))`);
  assert.equal(out.stdout.trim(), 'region=us-west-2 profile=irl-nonprod');
});
