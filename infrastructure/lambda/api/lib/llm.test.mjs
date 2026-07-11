// Specifications for the LLM seam (D37).
//
// The stub provider must be deterministic, schema-shaped, and loud about
// missing canned entries. The real provider must speak the Claude Messages
// API shape (structured outputs via output_config.format), cache the API
// key across calls, and fail clearly on refusals, truncation, and non-2xx.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealLlmProvider,
  createStubLlmProvider,
  STUB_ONBOARDING_EXTRACTION,
} from './llm.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

// ─── Stub provider ───

test('stub returns the canned onboarding extraction', async () => {
  const llm = createStubLlmProvider();
  const out = await llm.complete({ task: 'onboarding-extraction', schema: {} });
  assert.deepEqual(out, STUB_ONBOARDING_EXTRACTION);
  assert.equal(out.provisional, true);
});

test('stub output is a fresh clone each call — caller mutation is safe', async () => {
  const llm = createStubLlmProvider();
  const first = await llm.complete({ task: 'onboarding-extraction' });
  first.narrative.goal = 'mutated';
  const second = await llm.complete({ task: 'onboarding-extraction' });
  assert.notEqual(second.narrative.goal, 'mutated');
});

test('stub throws on an unknown task', async () => {
  const llm = createStubLlmProvider();
  await assert.rejects(
    () => llm.complete({ task: 'nonexistent-task' }),
    /no canned output for task "nonexistent-task"/,
  );
});

test('stub accepts custom canned entries, including functions', async () => {
  const llm = createStubLlmProvider({
    canned: {
      'onboarding-extraction': { replaced: true },
      'robot-debrief': () => ({ again: 'yes' }),
    },
  });
  assert.deepEqual(await llm.complete({ task: 'onboarding-extraction' }), { replaced: true });
  assert.deepEqual(await llm.complete({ task: 'robot-debrief' }), { again: 'yes' });
});

// ─── Real provider ───

function okResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

const schemaPayload = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"hello":"world"}' }],
};

test('real provider sends the Claude Messages API shape with structured output', async () => {
  const fetchFn = spy(async () => okResponse(schemaPayload));
  const llm = createRealLlmProvider({ getApiKey: async () => 'key-123', fetchFn });

  const out = await llm.complete({
    task: 'onboarding-extraction',
    system: 'extract things',
    messages: [{ role: 'user', content: 'transcript here' }],
    schema: { type: 'object' },
    maxTokens: 999,
  });

  assert.deepEqual(out, { hello: 'world' });
  assert.equal(fetchFn.calls.length, 1);
  const [url, init] = fetchFn.calls[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-api-key'], 'key-123');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');

  const body = JSON.parse(init.body);
  assert.equal(body.model, 'claude-opus-4-8');
  assert.equal(body.max_tokens, 999);
  assert.equal(body.system, 'extract things');
  assert.deepEqual(body.output_config, {
    format: { type: 'json_schema', schema: { type: 'object' } },
  });
});

test('real provider returns raw text when no schema is given', async () => {
  const fetchFn = spy(async () => okResponse({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'plain answer' }],
  }));
  const llm = createRealLlmProvider({ getApiKey: async () => 'k', fetchFn });

  const out = await llm.complete({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(out, 'plain answer');
  assert.equal(JSON.parse(fetchFn.calls[0][1].body).output_config, undefined);
});

test('real provider fetches the API key once and caches it', async () => {
  const getApiKey = spy(async () => 'cached-key');
  const fetchFn = spy(async () => okResponse(schemaPayload));
  const llm = createRealLlmProvider({ getApiKey, fetchFn });

  await llm.complete({ messages: [], schema: {} });
  await llm.complete({ messages: [], schema: {} });

  assert.equal(getApiKey.calls.length, 1);
  assert.equal(fetchFn.calls.length, 2);
});

test('real provider throws on non-2xx with status and detail', async () => {
  const fetchFn = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
  const llm = createRealLlmProvider({ getApiKey: async () => 'k', fetchFn });
  await assert.rejects(() => llm.complete({ messages: [] }), /429 rate limited/);
});

test('real provider throws on refusal and truncation stop reasons', async () => {
  const refusing = createRealLlmProvider({
    getApiKey: async () => 'k',
    fetchFn: async () => okResponse({ stop_reason: 'refusal', content: [] }),
  });
  await assert.rejects(() => refusing.complete({ messages: [] }), /refused/);

  const truncated = createRealLlmProvider({
    getApiKey: async () => 'k',
    fetchFn: async () => okResponse({ stop_reason: 'max_tokens', content: [] }),
  });
  await assert.rejects(() => truncated.complete({ messages: [] }), /truncated/);
});
