// One AWS CLI step of a site deploy (inject-config.mjs), run with live
// output. A failed step stops the deploy and says so — which step, its
// exit status, and the bucket, region and profile it ran against — so a
// deploy that did not land can never end in "Done." (same fail-loudly
// stance as test/helpers/region.mjs).

import { spawnSync } from 'node:child_process';

/**
 * @param {string} what       what the step does, for the message ("upload")
 * @param {string[]} args     the `aws` arguments
 * @param {{ where: Record<string, string|undefined>, after?: string, spawn?: typeof spawnSync }} o
 *   where: what the step ran against, named in the failure message
 *   after: what a failed step leaves behind and how to recover
 * @returns {void} — throws on failure
 */
export function runDeployStep(what, args, { where, after, spawn = spawnSync }) {
  const out = spawn('aws', args, { stdio: 'inherit' });
  if (out.status === 0 && !out.error) return;
  const cause = out.error
    ? `could not run the aws CLI (${out.error.message})`
    : out.signal ? `killed by ${out.signal}` : `exited ${out.status}`;
  const context = Object.entries(where)
    .map(([k, v]) => `${k} ${v || '(not set)'}`)
    .join(', ');
  throw new Error(`Deploy failed at the ${what} step: aws ${args.slice(0, 2).join(' ')} ${cause}. ${context}.${after ? ` ${after}` : ''}`);
}
