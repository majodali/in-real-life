// Specifications for the per-aggregate key store.
//
// Backs crypto-shredding: one random AES key per aggregate, stored in the
// keys table keyed by aggregateId. getOrCreateKey is called on the write
// path (lazily, before the first PII event); deleteKey is the shred.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyStore } from './key-store.mjs';

function spy(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

let getResult;
let putBehaviour;
let client;
let store;

function buildClient() {
  return {
    send: spy(async (cmd) => {
      const kind = cmd.constructor.name;
      if (kind === 'GetCommand') return getResult;
      if (kind === 'PutCommand') return putBehaviour();
      if (kind === 'DeleteCommand') return {};
      throw new Error(`unexpected command ${kind}`);
    }),
  };
}

beforeEach(() => {
  getResult = {}; // no Item by default
  putBehaviour = () => ({});
  client = buildClient();
  store = createKeyStore({ client, keysTable: 'irl-user-keys-test' });
});

// ─── getOrCreateKey ───

test('returns the existing key when the row already exists', async () => {
  getResult = { Item: { aggregateId: 'user#abc', dataKey: 'existing-key-b64' } };
  client = buildClient();
  store = createKeyStore({ client, keysTable: 'irl-user-keys-test' });

  const key = await store.getOrCreateKey('user#abc');
  assert.equal(key, 'existing-key-b64');
  // No Put when the key already exists.
  assert.equal(client.send.calls.filter(([c]) => c.constructor.name === 'PutCommand').length, 0);
});

test('generates and persists a new 32-byte key when none exists', async () => {
  const key = await store.getOrCreateKey('user#abc');
  assert.equal(Buffer.from(key, 'base64').length, 32);

  const put = client.send.calls.map(([c]) => c).find((c) => c.constructor.name === 'PutCommand');
  assert.equal(put.input.TableName, 'irl-user-keys-test');
  assert.equal(put.input.Item.aggregateId, 'user#abc');
  assert.equal(put.input.Item.dataKey, key);
  assert.match(put.input.ConditionExpression, /attribute_not_exists/);
});

test('on a create race (conditional Put fails) re-reads and returns the winner key', async () => {
  let getCalls = 0;
  client = {
    send: spy(async (cmd) => {
      const kind = cmd.constructor.name;
      if (kind === 'GetCommand') {
        getCalls += 1;
        // First read: absent. Second read (after race): the winner's key.
        return getCalls === 1 ? {} : { Item: { aggregateId: 'user#abc', dataKey: 'winner-key' } };
      }
      if (kind === 'PutCommand') {
        const err = new Error('conditional');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
      throw new Error(`unexpected ${kind}`);
    }),
  };
  store = createKeyStore({ client, keysTable: 'irl-user-keys-test' });

  const key = await store.getOrCreateKey('user#abc');
  assert.equal(key, 'winner-key');
});

// ─── getKey ───

test('getKey returns the key when present, null when absent', async () => {
  getResult = { Item: { aggregateId: 'user#abc', dataKey: 'k' } };
  client = buildClient();
  store = createKeyStore({ client, keysTable: 'irl-user-keys-test' });
  assert.equal(await store.getKey('user#abc'), 'k');

  getResult = {};
  client = buildClient();
  store = createKeyStore({ client, keysTable: 'irl-user-keys-test' });
  assert.equal(await store.getKey('user#abc'), null);
});

// ─── deleteKey ───

test('deleteKey issues a DeleteCommand keyed by aggregateId (the shred)', async () => {
  await store.deleteKey('user#abc');
  const del = client.send.calls.map(([c]) => c).find((c) => c.constructor.name === 'DeleteCommand');
  assert.equal(del.input.TableName, 'irl-user-keys-test');
  assert.deepEqual(del.input.Key, { aggregateId: 'user#abc' });
});
