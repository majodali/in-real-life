// Poll helper for eventually-consistent reads (the async Streams projector
// lands seconds after the command). Resolves with the first truthy value;
// throws past the deadline so a stuck projector fails loudly, not silently.

export async function waitFor(fn, {
  timeoutMs = 90_000, intervalMs = 2_000, label = 'condition',
} = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
    }
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  }
}
