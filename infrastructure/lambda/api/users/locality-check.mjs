// Route handler for GET /locality/check.
//
// Public (no auth). The sign-up gate calls this with a postal code and
// branches the new user into either the regular sign-up flow (supported)
// or the "notify me when you arrive" capture (not supported). The
// allowlist itself lives in lib/supported-localities.mjs so /me/locality
// can reuse it for defence-in-depth.

import { getSupportedArea } from '../lib/supported-localities.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createLocalityCheckHandler() {
  return async function handler(event) {
    const raw = event?.queryStringParameters?.postalCode;
    if (raw === undefined || raw === null) {
      return reply(400, { error: 'postalCode query parameter required' });
    }
    const postalCode = String(raw).trim();
    if (!postalCode) {
      return reply(400, { error: 'postalCode query parameter required' });
    }

    const area = getSupportedArea(postalCode);
    if (area) return reply(200, { supported: true, area });
    return reply(200, { supported: false });
  };
}
