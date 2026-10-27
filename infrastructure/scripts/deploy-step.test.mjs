// A deploy step that fails stops the deploy, loudly (deploy-step.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDeployStep } from './deploy-step.mjs';

const where = { bucket: 's3://irl-site', region: 'us-west-2', profile: 'irl-nonprod' };
const fake = (result) => {
  const calls = [];
  const spawn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return result; };
  return { calls, spawn };
};

test('a step that succeeds runs aws with live output and returns', () => {
  const { calls, spawn } = fake({ status: 0 });
  runDeployStep('upload', ['s3', 'sync', 'dist/', 's3://irl-site/'], { where, spawn });
  assert.equal(calls[0].cmd, 'aws');
  assert.deepEqual(calls[0].args, ['s3', 'sync', 'dist/', 's3://irl-site/']);
  assert.equal(calls[0].opts.stdio, 'inherit');
});

test('a non-zero exit throws, naming the step, the status, and where it ran', () => {
  const { spawn } = fake({ status: 1 });
  assert.throws(
    () => runDeployStep('upload', ['s3', 'sync', 'dist/', 's3://irl-site/'], { where, spawn, after: 'Run it again.' }),
    (err) => {
      assert.match(err.message, /^Deploy failed at the upload step: aws s3 sync exited 1\./);
      assert.match(err.message, /bucket s3:\/\/irl-site, region us-west-2, profile irl-nonprod\./);
      assert.match(err.message, /Run it again\.$/);
      return true;
    },
  );
});

test('an aws CLI that cannot start is a failure too', () => {
  const { spawn } = fake({ status: null, error: new Error('spawn aws ENOENT') });
  assert.throws(
    () => runDeployStep('invalidation', ['cloudfront', 'create-invalidation'], { where, spawn }),
    /invalidation step: aws cloudfront create-invalidation could not run the aws CLI \(spawn aws ENOENT\)/,
  );
});

test('a killed step is a failure, and an unset profile is said plainly', () => {
  const { spawn } = fake({ status: null, signal: 'SIGTERM' });
  assert.throws(
    () => runDeployStep('upload', ['s3', 'sync'], { where: { ...where, profile: undefined }, spawn }),
    /killed by SIGTERM\. bucket s3:\/\/irl-site, region us-west-2, profile \(not set\)\./,
  );
});
