// Route handler for POST /admin/agreement-version.
//
// Bumping the required user-agreement version is itself a command —
// UpdateRequiredAgreementVersion on system#config — so the change is
// auditable and replayable (docs/event-sourcing.md → Agreement
// versioning). Unlike /admin/time this route exists in production too:
// terms changes are a production operation.

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const AGGREGATE_ID = 'system#config';
const VERSION_FORM = /^v\d+$/;

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function createUpdateAgreementVersionHandler({ runner, getRequiredAgreement }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims) return reply(401, { error: 'unauthorized' });
    if (claims['custom:role'] !== 'admin') return reply(403, { error: 'admin only' });

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }

    const { commandId, version } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (typeof version !== 'string' || !VERSION_FORM.test(version)) {
      return reply(400, { error: 'version must look like v1, v2, …' });
    }

    const current = await getRequiredAgreement();
    if (current.version === version) {
      return reply(409, { error: 'already the required version' });
    }

    const out = await runner.runCommand({
      commandId,
      aggregateId: AGGREGATE_ID,
      actorId: `user#${claims.sub}`,
      events: [{
        eventType: 'RequiredAgreementVersionUpdated',
        version: 1,
        seq: current.seq + 1,
        data: { version, previousVersion: current.version },
      }],
      result: { requiredAgreementVersion: version },
    });

    return reply(out.cached ? 200 : 201, out.result);
  };
}
