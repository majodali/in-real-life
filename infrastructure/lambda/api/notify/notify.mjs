// Route handler for POST /notify.
//
// Public (no auth). Captures interest from prospective users whose postal
// code isn't yet supported by the sign-up gate. Emits a
// LocationNotifyRequested event keyed by lowercased email; one event per
// submission, idempotent on commandId.

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createNotifyHandler({ runner }) {
  return async function handler(event) {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }

    const { commandId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });

    const email = (body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return reply(400, { error: 'valid email required' });

    const postalCode = (body.postalCode ?? '').trim();
    if (!postalCode) return reply(400, { error: 'postalCode required' });

    const country = body.country ?? 'US';
    const aggregateId = `notify#${email}`;

    const events = [{
      eventType: 'LocationNotifyRequested',
      version: 1,
      seq: 1,
      data: { email, postalCode, country },
    }];

    const out = await runner.runCommand({
      commandId,
      aggregateId,
      actorId: aggregateId,
      events,
      result: { status: 'received' },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}
