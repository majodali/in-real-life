// What a member reads when something fails (src/js/errors.js).
//
// The API's messages are matched by status and wording, so these tests
// read the backend's own source: every pattern must still match a
// message the backend sends with that status. A reworded server message
// fails here instead of quietly falling back to the generic line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { errorKey, errorText, API_ERRORS } from './errors.js';

const API_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'infrastructure', 'lambda', 'api');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.mjs') && !p.endsWith('.test.mjs')) out.push(p);
  }
  return out;
}

// [status, message] for every error the API source sends. Template
// parts (${…}) read as "X", which every pattern treats as a wildcard word.
function backendErrors() {
  const found = [];
  const shapes = [
    /reply\((\d{3}),\s*\{\s*error:\s*(['`])((?:(?!\2).)*)\2/g,
    /statusCode:\s*(\d{3}),[\s\S]{0,200}?error:\s*(['`])((?:(?!\2).)*)\2/g,
  ];
  for (const file of walk(API_SRC)) {
    const source = readFileSync(file, 'utf-8');
    for (const shape of shapes) {
      for (const m of source.matchAll(shape)) found.push([Number(m[1]), m[3].replace(/\$\{[^}]*\}/g, 'X')]);
    }
  }
  return found;
}

const httpError = (status, error) => Object.assign(new Error(error), { status, body: { error } });

test('every API pattern still matches a message the backend sends with that status', () => {
  const sent = backendErrors();
  assert.ok(sent.length > 100, `read ${sent.length} backend errors — the scan is broken`);
  for (const [status, pattern, key] of API_ERRORS) {
    assert.ok(
      sent.some(([s, message]) => s === status && pattern.test(message)),
      `${key}: no ${status} in the backend matches ${pattern}`,
    );
  }
});

test('a known API error gets its own words', () => {
  assert.equal(errorKey(httpError(409, 'event is over; can no longer change interest'), 'x.fallback'), 'errors.eventMovedOn');
  assert.equal(errorKey(httpError(409, 'event is full — you can still register interest'), 'x.fallback'), 'errors.eventFull');
  assert.equal(errorKey(httpError(401, 'unauthorized'), 'x.fallback'), 'errors.sessionExpired');
});

test('the same words with another status are not that error', () => {
  assert.equal(errorKey(httpError(400, 'event is over'), 'x.fallback'), 'x.fallback');
});

test('anything else gets the caller\'s own words, never the server\'s', () => {
  assert.equal(errorKey(httpError(500, 'internal server error'), 'event.cancel.failed'), 'event.cancel.failed');
  assert.equal(errorText(httpError(500, 'internal server error'), 'event.cancel.failed'), 'Could not cancel.');
});

test('no response at all reads as a connection problem, a code bug does not', () => {
  assert.equal(errorKey(new TypeError('Failed to fetch'), 'x.fallback'), 'errors.network');
  assert.equal(errorKey(new TypeError('Load failed'), 'x.fallback'), 'errors.network');
  assert.equal(errorKey(new TypeError("Cannot read properties of undefined (reading 'x')"), 'x.fallback'), 'x.fallback');
});

test('Cognito errors map by code', () => {
  const cognito = (code) => Object.assign(new Error('whatever Cognito says'), { code, status: 400 });
  assert.equal(errorText(cognito('NotAuthorizedException'), 'x.fallback'), 'Incorrect username or password.');
  assert.equal(errorKey(cognito('CodeMismatchException'), 'x.fallback'), 'errors.auth.codeMismatch');
  assert.equal(errorKey(cognito('SomethingNewException'), 'x.fallback'), 'x.fallback');
});

test('a call site can override a code or a status', () => {
  assert.equal(errorKey(httpError(404, 'whatever'), 'x.fallback', { 404: 'errors.eventGone' }), 'errors.eventGone');
});
