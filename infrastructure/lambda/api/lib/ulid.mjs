// ULID generator — 26-char Crockford base32, lex-sortable by time, monotonic within a ms.
// See docs/event-sourcing.md for why ULIDs and not UUIDs.

import { randomBytes } from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length; // 32
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const TIME_MAX = Math.pow(2, 48) - 1;

let lastTime = -1;
let lastRandom = '';

export function ulid(timestamp) {
  const ts = timestamp ?? Date.now();
  if (ts < 0 || ts > TIME_MAX) {
    throw new Error(`timestamp out of range: ${ts}`);
  }

  let randomPart;
  if (ts === lastTime) {
    randomPart = incrementBase32(lastRandom);
  } else {
    randomPart = encodeRandom(RANDOM_LEN);
  }
  lastTime = ts;
  lastRandom = randomPart;

  return encodeTime(ts, TIME_LEN) + randomPart;
}

export function decodeTime(id) {
  if (typeof id !== 'string' || id.length !== 26) {
    throw new Error('invalid ULID: expected 26-character string');
  }
  let ts = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    const idx = ENCODING.indexOf(id[i]);
    if (idx < 0) {
      throw new Error(`invalid ULID character: '${id[i]}'`);
    }
    ts = ts * ENCODING_LEN + idx;
  }
  return ts;
}

function encodeTime(ts, len) {
  let s = '';
  for (let i = len; i > 0; i--) {
    const mod = ts % ENCODING_LEN;
    s = ENCODING[mod] + s;
    ts = Math.floor(ts / ENCODING_LEN);
  }
  return s;
}

function encodeRandom(len) {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ENCODING[bytes[i] % ENCODING_LEN];
  }
  return s;
}

function incrementBase32(s) {
  const chars = s.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = ENCODING.indexOf(chars[i]);
    if (idx < ENCODING_LEN - 1) {
      chars[i] = ENCODING[idx + 1];
      return chars.join('');
    }
    chars[i] = ENCODING[0];
  }
  throw new Error('random part overflow (>2^80 calls in same millisecond)');
}
