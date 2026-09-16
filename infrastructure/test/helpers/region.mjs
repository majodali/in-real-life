// Region + credential resolution for the functional suite.
//
// The suite talks to a deployed stack, so a wrong region is
// indistinguishable from a missing stack ("Stack with id IrlStackTest
// does not exist"). The old `process.env.AWS_REGION || 'us-east-1'`
// fallback made that the DEFAULT failure after workloads moved to
// us-west-2 (ops account-strategy): an explicit `region:` on the
// client also overrides whatever region the active profile configures,
// so `aws sso login --profile irl-nonprod` was not enough.
//
// Same rule as scripts/inject-config.mjs: explicit env wins, then the
// active profile's configured region (respects AWS_PROFILE), then a
// loud failure — never a guess.

import { spawnSync } from 'node:child_process';

function profileRegion() {
  const out = spawnSync('aws', ['configure', 'get', 'region'], { encoding: 'utf-8' });
  return out.status === 0 ? out.stdout.trim() : '';
}

let cachedRegion;

export function awsRegion() {
  if (cachedRegion) return cachedRegion;
  const region = process.env.AWS_REGION
    || process.env.AWS_DEFAULT_REGION
    || profileRegion();
  if (!region) {
    throw new Error(
      'No AWS region for the functional suite: set AWS_REGION (workloads '
      + 'are in us-west-2) or configure a default region on the active '
      + 'profile. Nothing is guessed — a wrong region reads as a missing stack.',
    );
  }
  cachedRegion = region;
  return region;
}

// What identity/region the run is actually using — for error messages
// that would otherwise send someone hunting a stack that is right there.
export function awsContext() {
  return `region=${awsRegion()} profile=${process.env.AWS_PROFILE || '(default)'}`;
}
