// The service worker's fetch strategies (src/sw.js), run against a fake
// worker scope: code comes from the network first so a deploy is never
// half-seen; the cache is the offline fallback; images may be served
// from the cache; other origins (the API) are never touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'sw.js'), 'utf-8');
const ORIGIN = 'https://in-real.life';

const res = (body) => ({ body, ok: true, clone() { return res(body); } });

// A worker scope with one cache store and a scripted network.
function worker({ cached = {}, network }) {
  const store = new Map(Object.entries(cached).map(([path, body]) => [`${ORIGIN}${path}`, res(body)]));
  const handlers = {};
  const fetches = [];
  const keyOf = (r) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
  const cacheApi = {
    put: async (r, response) => { store.set(keyOf(r), response); },
    add: async () => {},
    match: async (r) => store.get(keyOf(r)),
  };
  const scope = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      open: async () => cacheApi,
      match: async (r) => store.get(keyOf(r)),
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async (request, init) => {
      fetches.push({ url: request.url, init });
      return network(request);
    },
    Response: { error: () => ({ error: true }) },
    URL,
    Promise,
  };
  vm.runInNewContext(SOURCE, scope);
  return {
    store,
    fetches,
    // Dispatch a fetch event; resolves to what the worker answered, or
    // undefined when it let the request pass through.
    async get(path, { mode = 'cors', origin = ORIGIN } = {}) {
      let answer;
      handlers.fetch({ request: { method: 'GET', url: `${origin}${path}`, mode }, respondWith: (p) => { answer = p; } });
      const out = answer && (await answer);
      await new Promise((r) => setTimeout(r, 0)); // let cache writes land
      return out;
    },
  };
}

test('code comes from the network first, revalidated, even when an older copy is cached', async () => {
  const w = worker({ cached: { '/js/copy.js': 'old' }, network: async () => res('new') });
  const out = await w.get('/js/copy.js');
  assert.equal(out.body, 'new');
  assert.equal(w.fetches[0].init?.cache, 'no-cache');
  assert.equal(w.store.get(`${ORIGIN}/js/copy.js`).body, 'new', 'the cache is refreshed for offline use');
});

test('every kind of code and data is network-first: modules, bundles, styles, JSON', async () => {
  for (const path of ['/copy/en-US/event.js', '/js/screens/feed.js', '/css/styles.css', '/manifest.json']) {
    const w = worker({ cached: { [path]: 'old' }, network: async () => res('new') });
    assert.equal((await w.get(path)).body, 'new', path);
  }
});

test('offline, code falls back to the cached copy', async () => {
  const w = worker({ cached: { '/js/app.js': 'cached' }, network: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal((await w.get('/js/app.js')).body, 'cached');
});

test('offline with nothing cached, code fails as a network error', async () => {
  const w = worker({ network: async () => { throw new TypeError('Failed to fetch'); } });
  assert.deepEqual(await w.get('/js/app.js'), { error: true });
});

test('a failed response is passed on but never cached', async () => {
  const w = worker({ cached: { '/js/app.js': 'good' }, network: async () => ({ ok: false, status: 404, clone() { return this; } }) });
  assert.equal((await w.get('/js/app.js')).status, 404);
  assert.equal(w.store.get(`${ORIGIN}/js/app.js`).body, 'good');
});

test('images may be served from the cache', async () => {
  const w = worker({ cached: { '/icons/icon-192.png': 'cached' }, network: async () => res('new') });
  assert.equal((await w.get('/icons/icon-192.png')).body, 'cached');
});

test('pages come from the network first', async () => {
  const w = worker({ cached: { '/app.html': 'old' }, network: async () => res('new') });
  assert.equal((await w.get('/app.html', { mode: 'navigate' })).body, 'new');
});

test('other origins — the API — pass straight through', async () => {
  const w = worker({ network: async () => res('api') });
  assert.equal(await w.get('/events', { origin: 'https://api.in-real.life' }), undefined);
  assert.equal(w.fetches.length, 0);
});
