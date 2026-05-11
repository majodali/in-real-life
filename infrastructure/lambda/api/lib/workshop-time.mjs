// Workshop-time offset loader.
//
// Reads the workshop-time row from irl-config; returns
// { offsetMs, description, updatedAt }. Absent row → zero offset.
// See workshop-time.test.mjs for the spec and docs/workshop-mode.md
// for how the offset is set (AdvanceWorkshopTime command) and consumed
// (runner uses it for simulatedTime).

import { GetCommand } from '@aws-sdk/lib-dynamodb';

const KEY = 'workshop-time';
const DEFAULT = { offsetMs: 0, description: 'real time', updatedAt: null, seq: 0 };

export function createWorkshopOffsetLoader({ client, configTable }) {
  return async function getOffset() {
    const out = await client.send(new GetCommand({
      TableName: configTable,
      Key: { configKey: KEY },
    }));
    if (!out.Item) return DEFAULT;
    return {
      offsetMs: out.Item.offsetMs ?? 0,
      description: out.Item.description ?? 'real time',
      updatedAt: out.Item.updatedAt ?? null,
      seq: out.Item.seq ?? 0,
    };
  };
}
