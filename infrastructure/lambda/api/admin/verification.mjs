// The Members panel's backend (docs/admin-and-support.md → Members):
//
//   GET  /admin/verification-queue — pending locality requests, minimal
//        fields (PII minimalism: identity + the locality claim, §3).
//   POST /admin/verify-locality    — the PRODUCTION verify action,
//        closing the loop workshop mode auto-verifies: LocalityVerified
//        (verifiedBy: the admin, method: 'admin') then UserActivated —
//        the same two commands as the auto chain, with the admin as the
//        audited actor. Decline is deliberately NOT here (R3/R4; the
//        helpful-decline principle is recorded in the design note).
//   GET  /admin/member             — thin lookup by email: state-row
//        basics for support conversations. Deliberately not a model
//        viewer; nothing beyond the state row ever leaves here.

import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function requireAdmin(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || !claims.sub) return { error: reply(401, { error: 'unauthorized' }) };
  if (claims['custom:role'] !== 'admin') return { error: reply(403, { error: 'admin only' }) };
  return { adminId: claims.sub };
}

// State-row basics only — the fields a support conversation needs.
function memberBasics(item) {
  return {
    userId: item.userId,
    name: item.name ?? null,
    email: item.email ?? null,
    city: item.city ?? null,
    postalCode: item.postalCode ?? null,
    localityRequestedAt: item.localityRequestedAt ?? null,
    localityVerified: item.localityVerified === true,
    activatedAt: item.activatedAt ?? null,
    onboardingCompletedAt: item.onboardingCompletedAt ?? null,
    agreementVersion: item.agreementVersion ?? null,
    createdAt: item.createdAt ?? null,
  };
}

export function createVerificationQueueHandler({ client, usersTable }) {
  return async function handler(event) {
    const gate = requireAdmin(event);
    if (gate.error) return gate.error;

    // Scan-with-filter is fine at admin cadence and community scale; a
    // sparse GSI is the upgrade if queues ever grow past a few pages.
    const items = [];
    let ExclusiveStartKey;
    do {
      const out = await client.send(new ScanCommand({
        TableName: usersTable,
        FilterExpression: 'attribute_exists(localityRequestedAt) AND attribute_not_exists(localityVerified)',
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }));
      items.push(...(out.Items ?? []));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    items.sort((a, b) => String(a.localityRequestedAt).localeCompare(String(b.localityRequestedAt)));
    return reply(200, { pending: items.map(memberBasics), count: items.length });
  };
}

export function createVerifyLocalityHandler({ runner, client, usersTable }) {
  return async function handler(event) {
    const gate = requireAdmin(event);
    if (gate.error) return gate.error;

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }
    const { commandId, userId } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (!userId || typeof userId !== 'string') return reply(400, { error: 'userId required' });

    const userRow = await client.send(new GetCommand({
      TableName: usersTable, Key: { userId },
    }));
    if (!userRow.Item) return reply(404, { error: 'user not found' });
    if (!userRow.Item.localityRequestedAt) {
      return reply(409, { error: 'no verification request on file' });
    }
    if (userRow.Item.localityVerified === true) {
      return reply(409, { error: 'already verified' });
    }

    const currentSeq = userRow.Item.seq;
    const baseInput = { aggregateId: `user#${userId}`, actorId: `user#${gate.adminId}` };

    // Same two-step chain as the workshop auto-path (locality.mjs),
    // derived commandIds so retries converge mid-chain.
    try {
      await runner.runCommand({
        ...baseInput,
        commandId,
        events: [{
          eventType: 'LocalityVerified',
          version: 1,
          seq: currentSeq + 1,
          data: { userId, verifiedBy: gate.adminId, method: 'admin' },
        }],
        result: { userId, status: 'verified' },
      });
      const out = await runner.runCommand({
        ...baseInput,
        commandId: `${commandId}:activate`,
        events: [{
          eventType: 'UserActivated',
          version: 1,
          seq: currentSeq + 2,
          data: { userId },
        }],
        result: { userId, status: 'activated' },
      });
      return reply(out.cached ? 200 : 201, out.result);
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'state changed underneath — reload the queue' });
      }
      throw err;
    }
  };
}

export function createMemberLookupHandler({ client, usersTable }) {
  return async function handler(event) {
    const gate = requireAdmin(event);
    if (gate.error) return gate.error;

    const email = (event?.queryStringParameters?.email ?? '').trim().toLowerCase();
    if (!email) return reply(400, { error: 'email query parameter required' });

    let found = null;
    let ExclusiveStartKey;
    do {
      const out = await client.send(new ScanCommand({
        TableName: usersTable,
        FilterExpression: 'email = :e',
        ExpressionAttributeValues: { ':e': email },
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }));
      if (out.Items?.length) [found] = out.Items;
      ExclusiveStartKey = found ? undefined : out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    if (!found) return reply(404, { error: 'no member with that email' });
    return reply(200, { member: memberBasics(found) });
  };
}
