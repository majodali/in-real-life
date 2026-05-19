// Specifications for the authenticated API client.
//
// api.js is a thin wrapper around fetch that:
//   - prepends the API base URL
//   - attaches Authorization: Bearer <idToken> from the auth module (when
//     a token is available)
//   - parses JSON responses
//   - on 401, calls auth.refresh() and retries the request once with the
//     new token; if refresh fails, propagates the original 401

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from './api.js';

const BASE_URL = 'https://api.test';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

let fetchCalls;
let fetchResults;
let fetchCallIndex;
let auth;
let api;

beforeEach(() => {
  fetchCalls = [];
  fetchResults = [];
  fetchCallIndex = 0;

  const fakeFetch = (url, opts) => {
    fetchCalls.push({ url, opts });
    return Promise.resolve(fetchResults[fetchCallIndex++] ?? jsonResponse({}));
  };

  auth = {
    getValidIdToken: spy(async () => 'test-token'),
    refresh: spy(async () => ({ idToken: 'new-token' })),
  };

  api = createApi({ baseUrl: BASE_URL, auth, fetch: fakeFetch });
});

// ─── Method + URL ───

test('get(path) sends a GET request to baseUrl + path', async () => {
  fetchResults = [jsonResponse({ ok: true })];
  await api.get('/me');
  assert.equal(fetchCalls[0].url, `${BASE_URL}/me`);
  assert.equal(fetchCalls[0].opts.method, 'GET');
  assert.equal(fetchCalls[0].opts.body, undefined);
});

test('post(path, body) sends POST with JSON body and Content-Type header', async () => {
  fetchResults = [jsonResponse({ ok: true })];
  await api.post('/me/register', { commandId: 'c', agreementVersion: 'v1' });

  const call = fetchCalls[0];
  assert.equal(call.opts.method, 'POST');
  assert.equal(call.opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.opts.body), { commandId: 'c', agreementVersion: 'v1' });
});

test('put and delete are supported with the same shape', async () => {
  fetchResults = [jsonResponse({}), jsonResponse({})];
  await api.put('/me', { x: 1 });
  await api.delete('/me');
  assert.equal(fetchCalls[0].opts.method, 'PUT');
  assert.equal(fetchCalls[1].opts.method, 'DELETE');
});

test('delete sends a JSON body when one is supplied (for commandId-bearing deletes)', async () => {
  fetchResults = [jsonResponse({})];
  await api.delete('/me', { commandId: 'cmd-1' });
  assert.equal(fetchCalls[0].opts.method, 'DELETE');
  assert.equal(fetchCalls[0].opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(fetchCalls[0].opts.body), { commandId: 'cmd-1' });
});

// ─── Authorization header ───

test('attaches Authorization: Bearer <idToken> from auth.getValidIdToken', async () => {
  fetchResults = [jsonResponse({})];
  await api.get('/me');
  assert.equal(fetchCalls[0].opts.headers.Authorization, 'Bearer test-token');
});

test('omits Authorization when auth.getValidIdToken returns null', async () => {
  auth.getValidIdToken = spy(async () => null);
  api = createApi({ baseUrl: BASE_URL, auth, fetch: (url, opts) => {
    fetchCalls.push({ url, opts });
    return Promise.resolve(fetchResults[fetchCallIndex++] ?? jsonResponse({}));
  } });
  fetchResults = [jsonResponse({})];

  await api.get('/health');
  assert.equal(fetchCalls[0].opts.headers.Authorization, undefined);
});

// ─── Response parsing ───

test('returns the parsed JSON body on success', async () => {
  fetchResults = [jsonResponse({ userId: 'abc' })];
  const result = await api.get('/me');
  assert.deepEqual(result, { userId: 'abc' });
});

test('returns null on 204 No Content', async () => {
  fetchResults = [{ ok: true, status: 204, json: async () => { throw new Error('no body'); } }];
  const result = await api.delete('/something');
  assert.equal(result, null);
});

// ─── Error handling ───

test('throws on a 4xx with status and parsed body attached', async () => {
  fetchResults = [jsonResponse({ error: 'bad input' }, { status: 400 })];

  let caught;
  try { await api.post('/me/register', {}); } catch (e) { caught = e; }
  assert.ok(caught);
  assert.equal(caught.status, 400);
  assert.deepEqual(caught.body, { error: 'bad input' });
  assert.match(caught.message, /bad input/);
});

test('throws on a 5xx', async () => {
  fetchResults = [jsonResponse({ error: 'oops' }, { status: 500 })];
  await assert.rejects(() => api.get('/me'), /oops|500/);
});

// ─── 401 refresh-and-retry ───

test('on 401 with a token, calls auth.refresh and retries once with the new token', async () => {
  fetchResults = [
    jsonResponse({ error: 'expired' }, { status: 401 }),
    jsonResponse({ userId: 'abc' }),
  ];

  const result = await api.get('/me');

  assert.deepEqual(result, { userId: 'abc' });
  assert.equal(auth.refresh.calls.length, 1);
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[1].opts.headers.Authorization, 'Bearer new-token');
});

test('on 401 when refresh fails, propagates the original 401 error', async () => {
  fetchResults = [jsonResponse({ error: 'expired' }, { status: 401 })];
  auth.refresh = spy(async () => { throw new Error('no refresh token'); });
  api = createApi({ baseUrl: BASE_URL, auth, fetch: (url, opts) => {
    fetchCalls.push({ url, opts });
    return Promise.resolve(fetchResults[fetchCallIndex++] ?? jsonResponse({}));
  } });

  let caught;
  try { await api.get('/me'); } catch (e) { caught = e; }
  assert.ok(caught);
  assert.equal(caught.status, 401);
});

test('does not attempt refresh when the original request had no token', async () => {
  auth.getValidIdToken = spy(async () => null);
  api = createApi({ baseUrl: BASE_URL, auth, fetch: (url, opts) => {
    fetchCalls.push({ url, opts });
    return Promise.resolve(fetchResults[fetchCallIndex++] ?? jsonResponse({}));
  } });
  fetchResults = [jsonResponse({ error: 'unauthorized' }, { status: 401 })];

  await assert.rejects(() => api.get('/me'), /unauthorized|401/);
  assert.equal(auth.refresh.calls.length, 0);
});
