// Specifications for the X-Ray tracing helper.
//
// Subsegments attach to the invocation's facade segment (parsed from
// _X_AMZN_TRACE_ID) and are emitted over the daemon wire protocol; when
// the invocation isn't traced or sampled, everything degrades to a plain
// passthrough. Tracing must never alter a result or an error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTraceHeader, createTracer } from './tracing.mjs';

const HEADER = 'Root=1-6810f7a1-abcdef0123456789abcdef01;Parent=53995c3f42cd8ad8;Sampled=1';

// ─── parseTraceHeader ───

test('parses root, parent, and sampled from a Lambda trace header', () => {
  assert.deepEqual(parseTraceHeader(HEADER), {
    root: '1-6810f7a1-abcdef0123456789abcdef01',
    parent: '53995c3f42cd8ad8',
    sampled: true,
  });
});

test('treats Sampled other than 1 as not sampled', () => {
  const parsed = parseTraceHeader(HEADER.replace('Sampled=1', 'Sampled=0'));
  assert.equal(parsed.sampled, false);
});

test('returns null for missing or malformed headers', () => {
  assert.equal(parseTraceHeader(undefined), null);
  assert.equal(parseTraceHeader(''), null);
  assert.equal(parseTraceHeader('garbage'), null);
});

// ─── traceId ───

test('traceId returns the Root, or undefined when untraced', () => {
  const traced = createTracer({ getTraceHeader: () => HEADER });
  assert.equal(traced.traceId(), '1-6810f7a1-abcdef0123456789abcdef01');

  const untraced = createTracer({ getTraceHeader: () => undefined });
  assert.equal(untraced.traceId(), undefined);
});

// ─── subsegment ───

function collector() {
  const docs = [];
  return { docs, emit: (doc) => docs.push(doc) };
}

test('emits a timed subsegment attached to the facade segment', async () => {
  const { docs, emit } = collector();
  let t = 1_000_000;
  const tracer = createTracer({ getTraceHeader: () => HEADER, emit, now: () => (t += 500) });

  const result = await tracer.subsegment('transact-write', async () => 42);

  assert.equal(result, 42);
  assert.equal(docs.length, 1);
  const [doc] = docs;
  assert.equal(doc.type, 'subsegment');
  assert.equal(doc.name, 'transact-write');
  assert.equal(doc.trace_id, '1-6810f7a1-abcdef0123456789abcdef01');
  assert.equal(doc.parent_id, '53995c3f42cd8ad8');
  assert.match(doc.id, /^[0-9a-f]{16}$/);
  assert.ok(doc.end_time > doc.start_time);
  assert.equal(doc.fault, undefined);
});

test('marks the subsegment faulted on error and rethrows untouched', async () => {
  const { docs, emit } = collector();
  const tracer = createTracer({ getTraceHeader: () => HEADER, emit });
  const boom = new Error('nope');
  boom.name = 'TransactionCanceledException';

  await assert.rejects(
    () => tracer.subsegment('transact-write', async () => { throw boom; }),
    (err) => err === boom,
  );

  assert.equal(docs[0].fault, true);
  assert.deepEqual(docs[0].cause.exceptions, [
    { message: 'nope', type: 'TransactionCanceledException' },
  ]);
});

test('passes through without emitting when unsampled or untraced', async () => {
  const { docs, emit } = collector();
  for (const header of [undefined, HEADER.replace('Sampled=1', 'Sampled=0'), 'Root=1-x']) {
    const tracer = createTracer({ getTraceHeader: () => header, emit });
    assert.equal(await tracer.subsegment('x', async () => 'ran'), 'ran');
  }
  assert.equal(docs.length, 0);
});

test('reads the trace header per call, not at creation', async () => {
  const { docs, emit } = collector();
  let header;
  const tracer = createTracer({ getTraceHeader: () => header, emit });

  await tracer.subsegment('first', async () => {});
  header = HEADER;
  await tracer.subsegment('second', async () => {});

  assert.deepEqual(docs.map((d) => d.name), ['second']);
});
