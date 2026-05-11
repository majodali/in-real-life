// Specifications for the route registry / dispatcher.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from './router.mjs';

function event(method, path) {
  return {
    requestContext: { http: { method } },
    rawPath: path,
  };
}

test('dispatches to the handler registered for the matching method and path', async () => {
  const router = createRouter();
  router.add('GET', '/health', async () => ({ statusCode: 200, body: 'ok' }));

  const response = await router.dispatch(event('GET', '/health'));
  assert.equal(response.statusCode, 200);
});

test('returns 404 when no route matches', async () => {
  const router = createRouter();
  const response = await router.dispatch(event('GET', '/nope'));
  assert.equal(response.statusCode, 404);
});

test('returns 500 when a handler throws', async () => {
  const router = createRouter();
  router.add('GET', '/boom', async () => { throw new Error('boom'); });

  const response = await router.dispatch(event('GET', '/boom'));
  assert.equal(response.statusCode, 500);
});

test('distinguishes methods on the same path', async () => {
  const router = createRouter();
  router.add('GET', '/me', async () => ({ statusCode: 200, body: 'GET' }));
  router.add('POST', '/me', async () => ({ statusCode: 201, body: 'POST' }));

  const getResp = await router.dispatch(event('GET', '/me'));
  const postResp = await router.dispatch(event('POST', '/me'));

  assert.equal(getResp.statusCode, 200);
  assert.equal(postResp.statusCode, 201);
});

test('parameterized paths match and expose params on event.pathParams', async () => {
  const router = createRouter();
  let receivedParams;
  router.add('GET', '/events/:id', async (e) => {
    receivedParams = e.pathParams;
    return { statusCode: 200 };
  });

  await router.dispatch(event('GET', '/events/abc'));
  assert.deepEqual(receivedParams, { id: 'abc' });
});

test('parameterized paths do not match paths with a different segment count', async () => {
  const router = createRouter();
  router.add('GET', '/events/:id', async () => ({ statusCode: 200 }));

  const response = await router.dispatch(event('GET', '/events/abc/extra'));
  assert.equal(response.statusCode, 404);
});

test('exact paths take precedence over parameterized paths', async () => {
  const router = createRouter();
  let calledExact = false;
  let calledParam = false;
  router.add('GET', '/events/featured', async () => { calledExact = true; return { statusCode: 200 }; });
  router.add('GET', '/events/:id', async () => { calledParam = true; return { statusCode: 200 }; });

  await router.dispatch(event('GET', '/events/featured'));
  assert.equal(calledExact, true);
  assert.equal(calledParam, false);
});

test('default method is GET when not present on the event', async () => {
  const router = createRouter();
  router.add('GET', '/health', async () => ({ statusCode: 200, body: 'ok' }));

  const response = await router.dispatch({ rawPath: '/health' });
  assert.equal(response.statusCode, 200);
});
