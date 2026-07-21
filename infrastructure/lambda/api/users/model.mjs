// Routes for model legibility (D59, docs/profile-and-legibility.md):
//
//   GET  /me/model            — "How we understand you": the member's own
//                               Layer 2, translated to a member-facing
//                               shape. NEVER gated on agreement re-accept
//                               (legibility is a data right, like export).
//   POST /me/model/correction — the member's own word about themselves:
//                               emits UserModelCorrected; the async
//                               projector applies it with provenance
//                               `corrected` (beats all older evidence;
//                               later evidence resumes normal precedence).
//
// The never-shown rules are enforced HERE, server-side: no Layer 3
// (affinity, crews, tap stats), no contributor rating, no weights or
// scores of any kind. Raw store items never travel to a client.

import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { decryptValue } from '../lib/crypto-shred.mjs';
import { ENVELOPE_DIMENSIONS, isValidPosition, isValidEdge } from '../lib/envelope.mjs';
import { isValidReach, isValidAdjustment, isValidLocalityId } from '../lib/localities.mjs';
import { isValidTimeWindow } from '../lib/time-windows.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

// Provenance → member-facing language. `corrected` reads as the member's
// own word; stated is what they told us; observed/inferred is what we
// noticed. The store's vocabulary never leaks as-is.
function provenanceLanguage(provenance) {
  if (provenance === 'corrected' || provenance === 'stated') return 'you told us';
  return "we've noticed";
}

export function createGetModelHandler({ client, userModelTable, keyStore }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });
    const userId = claims.sub;

    const dataKey = await keyStore.getKey(`user#${userId}`);
    if (!dataKey) return reply(200, { model: null });

    const rows = [];
    let lastKey;
    do {
      const out = await client.send(new QueryCommand({
        TableName: userModelTable,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }));
      rows.push(...(out.Items ?? []));
      lastKey = out.LastEvaluatedKey;
    } while (lastKey);

    let envelope = null;
    let doors = [];
    const interests = [];
    const barriers = [];
    const strengths = [];
    let constraints = {};
    let provisional;

    for (const row of rows) {
      if (!row.model || typeof row.sk !== 'string') continue;
      // Layer 3 and stats never reach this response — not even elided;
      // simply untouched.
      if (row.sk.startsWith('affinity#') || row.sk.startsWith('crew#')
        || row.sk.startsWith('stats#') || row.sk.startsWith('rating#')) continue;

      const payload = decryptValue(row.model, dataKey);
      if (row.sk === 'profile#core') {
        constraints = payload.constraints ?? {};
        provisional = payload.provisional;
        doors = (payload.doors ?? []).map((d) => ({
          door: d.door,
          source: provenanceLanguage(d.provenance),
        }));
        envelope = {};
        for (const [dimension, dim] of Object.entries(payload.envelope ?? {})) {
          const latest = (dim.observations ?? []).at(-1);
          envelope[dimension] = {
            ...(dim.position !== undefined ? { position: dim.position } : {}),
            ...(dim.edgeToward !== undefined ? { edgeToward: dim.edgeToward } : {}),
            ...(dim.comfort !== undefined ? { comfort: dim.comfort } : {}),
            ...(dim.growthEdge !== undefined ? { growthEdge: dim.growthEdge } : {}),
            source: provenanceLanguage(dim.positionProvenance ?? dim.provenance),
            ...(dim.correctedAt ? { correctedAt: dim.correctedAt } : {}),
            ...(latest ? { latestObservation: latest.observation } : {}),
          };
        }
      } else if (row.sk.startsWith('interest#')) {
        // Weights deliberately absent — a number reads as a score.
        interests.push({
          tag: payload.tag,
          source: provenanceLanguage(payload.provenance),
        });
      } else if (row.sk.startsWith('barrier#')) {
        barriers.push({
          what: payload.what,
          source: provenanceLanguage(payload.provenance),
          ...(payload.easing ? { easing: true } : {}),
        });
      } else if (row.sk.startsWith('strength#')) {
        strengths.push({
          what: payload.what,
          ...(payload.willingToFacilitate ? { willingToFacilitate: true } : {}),
          source: provenanceLanguage(payload.provenance),
        });
      }
    }

    return reply(200, {
      model: envelope === null && interests.length === 0 && barriers.length === 0
        && strengths.length === 0
        ? null
        : { envelope, doors, interests, strengths, barriers, constraints, provisional },
    });
  };
}

export function createCorrectModelHandler({ runner, client, usersTable }) {
  return async function handler(event) {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) return reply(401, { error: 'unauthorized' });

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }
    const { commandId, correction } = body;
    if (!commandId) return reply(400, { error: 'commandId required' });
    if (typeof correction !== 'object' || correction === null) {
      return reply(400, { error: 'correction object required' });
    }

    // Validate the typed correction against the vocabulary — the member's
    // word must still be a word the model speaks.
    const c = correction;
    if (c.type === 'envelope') {
      if (!(c.dimension in ENVELOPE_DIMENSIONS)) {
        return reply(400, { error: 'unknown envelope dimension' });
      }
      if (c.position === undefined && c.edgeToward === undefined) {
        return reply(400, { error: 'an envelope correction sets position and/or edgeToward' });
      }
      if (c.position !== undefined && !isValidPosition(c.dimension, c.position)) {
        return reply(400, { error: 'unknown position for that dimension' });
      }
      if (c.edgeToward !== undefined && c.edgeToward !== null
        && !isValidEdge(c.dimension, c.edgeToward)) {
        return reply(400, { error: 'edgeToward must be a pole of that dimension (or null to clear)' });
      }
    } else if (c.type === 'interest-add' || c.type === 'interest-remove') {
      if (typeof c.tag !== 'string' || !c.tag.trim() || c.tag.length > 60) {
        return reply(400, { error: 'tag required (≤60 chars)' });
      }
      c.tag = c.tag.trim();
    } else if (c.type === 'barrier-remove') {
      if (typeof c.what !== 'string' || !c.what.trim()) {
        return reply(400, { error: 'what required' });
      }
      c.what = c.what.trim();
    } else if (c.type === 'constraint') {
      // D62: reach, per-locality adjustment, and/or time windows — at
      // least one, each vocabulary-validated (null clears).
      const touchesReach = c.travelReach !== undefined;
      const touchesLocality = c.localityId !== undefined || c.feels !== undefined;
      const touchesWindows = c.addTimeWindow !== undefined || c.removeTimeWindow !== undefined;
      if (!touchesReach && !touchesLocality && !touchesWindows) {
        return reply(400, { error: 'a constraint correction sets travelReach, a locality adjustment, and/or a time window' });
      }
      if (touchesReach && c.travelReach !== null && !isValidReach(c.travelReach)) {
        return reply(400, { error: 'travelReach must be here, nearby, a-trip, or anywhere (or null to clear)' });
      }
      if (touchesLocality) {
        if (!isValidLocalityId(c.localityId)) {
          return reply(400, { error: 'unknown localityId' });
        }
        if (c.feels !== null && !isValidAdjustment(c.feels)) {
          return reply(400, { error: 'feels must be closer or further (or null to clear)' });
        }
      }
      if (c.addTimeWindow !== undefined && !isValidTimeWindow(c.addTimeWindow)) {
        return reply(400, { error: 'unknown time window' });
      }
      if (c.removeTimeWindow !== undefined && typeof c.removeTimeWindow !== 'string') {
        return reply(400, { error: 'removeTimeWindow must be a string' });
      }
    } else {
      return reply(400, { error: 'correction.type must be envelope, interest-add, interest-remove, barrier-remove, or constraint' });
    }

    const userId = claims.sub;
    const userRow = await client.send(new GetCommand({
      TableName: usersTable,
      Key: { userId },
    }));
    if (!userRow.Item) return reply(404, { error: 'user not registered' });

    let out;
    try {
      out = await runner.runCommand({
        commandId,
        aggregateId: `user#${userId}`,
        actorId: `user#${userId}`,
        events: [{
          eventType: 'UserModelCorrected',
          version: 1,
          seq: userRow.Item.seq + 1,
          data: { userId, correction: c },
        }],
        result: { status: 'correction-recorded', type: c.type },
      });
    } catch (err) {
      if (err?.name === 'TransactionCanceledException') {
        return reply(409, { error: 'concurrent update, retry' });
      }
      throw err;
    }

    return reply(out.cached ? 200 : 201, out.result);
  };
}
