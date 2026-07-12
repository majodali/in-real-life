// X-Ray tracing helper (docs/event-sourcing.md → Tracing & observability).
//
// Lambda's Tracing.ACTIVE gives us the function segment and auto-traced
// AWS SDK calls; this module adds the custom subsegments around command
// phases without pulling in the X-Ray SDK. Subsegment documents go
// straight to the in-container X-Ray daemon over UDP — the same wire
// protocol the SDK uses — attached to the invocation's facade segment
// from the _X_AMZN_TRACE_ID env var.
//
// Two hard rules:
//   - Tracing must never break a request: emit is fire-and-forget and
//     every failure is swallowed.
//   - The trace header is read per call, not at module load — Lambda
//     rotates _X_AMZN_TRACE_ID on every invocation.

import { createSocket } from 'node:dgram';
import { randomBytes } from 'node:crypto';

const DAEMON_HEADER = '{"format": "json", "version": 1}\n';

// "Root=1-...;Parent=53995c3f...;Sampled=1" → { root, parent, sampled }.
export function parseTraceHeader(header) {
  if (typeof header !== 'string' || header.length === 0) return null;
  const fields = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  if (!fields.Root) return null;
  return {
    root: fields.Root,
    parent: fields.Parent,
    sampled: fields.Sampled === '1',
  };
}

function defaultEmit(doc) {
  try {
    const address = process.env.AWS_XRAY_DAEMON_ADDRESS || '169.254.79.2:2000';
    const [host, port] = address.split(':');
    const payload = Buffer.from(DAEMON_HEADER + JSON.stringify(doc), 'utf8');
    const socket = createSocket('udp4');
    socket.unref();
    socket.send(payload, Number(port), host, () => socket.close());
  } catch {
    // Never let telemetry take down the request path.
  }
}

export function createTracer({
  getTraceHeader = () => process.env._X_AMZN_TRACE_ID,
  emit = defaultEmit,
  now = Date.now,
} = {}) {
  // The Root trace id — for the per-command log line and the traceId
  // field on event records (log ↔ trace ↔ event correlation).
  function traceId() {
    return parseTraceHeader(getTraceHeader())?.root;
  }

  // Run fn inside a named subsegment. Emits only when the invocation is
  // traced and sampled; otherwise it's a plain passthrough. The error
  // path marks the subsegment as faulted and rethrows untouched.
  async function subsegment(name, fn) {
    const context = parseTraceHeader(getTraceHeader());
    if (!context?.sampled || !context.parent) return fn();

    const startTime = now() / 1000;
    const doc = {
      type: 'subsegment',
      id: randomBytes(8).toString('hex'),
      trace_id: context.root,
      parent_id: context.parent,
      name,
      start_time: startTime,
    };
    try {
      const result = await fn();
      emit({ ...doc, end_time: now() / 1000 });
      return result;
    } catch (err) {
      emit({
        ...doc,
        end_time: now() / 1000,
        fault: true,
        cause: {
          exceptions: [{
            message: String(err?.message ?? err),
            type: String(err?.name ?? 'Error'),
          }],
        },
      });
      throw err;
    }
  }

  return { traceId, subsegment };
}
