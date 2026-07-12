// Required-agreement-version loader + version comparison
// (docs/event-sourcing.md → Agreement versioning).
//
// irl-config holds `required_user_agreement_version`, written by the
// RequiredAgreementVersionUpdated projection. An absent row means no
// requirement has ever been set — every accepted version passes, which
// keeps fresh stacks and the pre-launch world working with zero setup.

import { GetCommand } from '@aws-sdk/lib-dynamodb';

const KEY = 'required_user_agreement_version';

export function createRequiredAgreementLoader({ client, configTable }) {
  return async function getRequiredAgreement() {
    const out = await client.send(new GetCommand({
      TableName: configTable,
      Key: { configKey: KEY },
    }));
    if (!out.Item) return { version: null, updatedAt: null, seq: 0 };
    return {
      version: out.Item.version ?? null,
      updatedAt: out.Item.updatedAt ?? null,
      seq: out.Item.seq ?? 0,
    };
  };
}

// Does an accepted version satisfy the required one? Versions are the
// 'v<n>' identifiers from terms.html. A *newer* accepted version passes
// (an admin rollback must not re-prompt everyone who accepted the newer
// terms); versions outside the v<n> form only pass on exact match.
export function meetsRequiredAgreement(accepted, required) {
  if (!required) return true;
  if (!accepted) return false;
  if (accepted === required) return true;
  const a = /^v(\d+)$/.exec(accepted);
  const r = /^v(\d+)$/.exec(required);
  if (a && r) return Number(a[1]) >= Number(r[1]);
  return false;
}
