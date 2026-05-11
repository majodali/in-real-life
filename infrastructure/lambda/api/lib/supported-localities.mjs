// Allowlist of postal codes we serve and their human-readable area labels.
//
// One source of truth for both the public /locality/check gate and the
// authenticated /me/locality command. Expand by adding entries here; both
// callers pick up the change with no code edits.

const SUPPORTED = {
  '98110': 'Bainbridge Island',
};

export function getSupportedArea(postalCode) {
  if (postalCode == null) return null;
  const key = String(postalCode).trim();
  if (!key) return null;
  return SUPPORTED[key] ?? null;
}

export function isSupportedPostalCode(postalCode) {
  return getSupportedArea(postalCode) !== null;
}
