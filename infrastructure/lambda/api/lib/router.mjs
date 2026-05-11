// Route registry and dispatcher.
//
// See router.test.mjs for the spec. The dispatcher matches exact routes first,
// then parameterized routes (e.g. /events/:id). On a parameterized match, it
// attaches the captured params to event.pathParams.

export function createRouter() {
  const routes = {};

  function add(method, path, fn) {
    routes[`${method} ${path}`] = fn;
  }

  async function dispatch(event) {
    const method = event?.requestContext?.http?.method || 'GET';
    const rawPath = event?.rawPath || '/';

    const exactKey = `${method} ${rawPath}`;
    if (routes[exactKey]) {
      return invoke(routes[exactKey], event, exactKey);
    }

    for (const [pattern, fn] of Object.entries(routes)) {
      const [pMethod, pPath] = pattern.split(' ');
      if (pMethod !== method) continue;
      const params = matchPath(pPath, rawPath);
      if (params) {
        event.pathParams = params;
        return invoke(fn, event, pattern);
      }
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'not found', method, path: rawPath }) };
  }

  return { add, dispatch };
}

async function invoke(fn, event, label) {
  try {
    return await fn(event);
  } catch (err) {
    console.error(`Error in ${label}:`, err);
    return { statusCode: 500, body: JSON.stringify({ error: 'internal server error' }) };
  }
}

function matchPath(pattern, actual) {
  const patternParts = pattern.split('/');
  const actualParts = actual.split('/');
  if (patternParts.length !== actualParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = actualParts[i];
    } else if (patternParts[i] !== actualParts[i]) {
      return null;
    }
  }
  return params;
}
