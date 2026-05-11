// Route handler for GET /time.
//
// See get-time.test.mjs for the spec and docs/workshop-mode.md for the
// workshop-time mechanism.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createGetTimeHandler({ getOffset }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims) return reply(401, { error: 'unauthorized' });

    const offset = await getOffset();
    const now = Date.now();
    return reply(200, {
      wallTime: new Date(now).toISOString(),
      simulatedTime: new Date(now + offset.offsetMs).toISOString(),
      offsetMs: offset.offsetMs,
      description: offset.description,
    });
  };
}
