// Crypto-shred primitives.
//
// Per-user AES-256-GCM. PII fields on events are encrypted with the user's
// data key before they're written to the immutable event log. Deleting
// that key (on account deletion) makes the ciphertext permanently
// undecryptable — the event's structure (seq, type, timestamps, non-PII
// fields) survives for replay and audit, but the PII is gone.
//
// Envelope format: "v1:<ivB64>:<tagB64>:<ctB64>". Values are JSON-encoded
// before encryption so non-string PII (arrays, objects) round-trips.

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;

export function generateDataKey() {
  return randomBytes(32).toString('base64');
}

export function encryptValue(value, keyB64) {
  const key = Buffer.from(keyB64, 'base64');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

export function decryptValue(envelope, keyB64) {
  const parts = String(envelope).split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('crypto-shred: malformed envelope');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = Buffer.from(keyB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(pt.toString('utf8'));
}

export function encryptPii(data, fields, keyB64) {
  const out = { ...data };
  for (const field of fields) {
    if (out[field] !== undefined) {
      out[field] = encryptValue(out[field], keyB64);
    }
  }
  return out;
}

export function decryptPii(data, fields, keyB64) {
  const out = { ...data };
  for (const field of fields) {
    if (out[field] !== undefined) {
      out[field] = decryptValue(out[field], keyB64);
    }
  }
  return out;
}
