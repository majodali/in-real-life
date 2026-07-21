// Specifications for the client-side locality helpers (D62). The
// register is served, never mirrored — these tests exercise the band
// derivation and language over a served-shaped fixture.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLocalities, resetLocalitiesCache, bandBetween, bandLabel, localityLine,
} from './localities.js';

const SERVED = {
  localities: [
    { id: 'bainbridge-island', name: 'Bainbridge Island', neighbors: ['poulsbo'], crossings: ['seattle'] },
    { id: 'poulsbo', name: 'Poulsbo', neighbors: ['bainbridge-island'], crossings: [] },
    { id: 'seattle', name: 'Seattle', neighbors: [], crossings: ['bainbridge-island'] },
    { id: 'bremerton', name: 'Bremerton', neighbors: [], crossings: [] },
  ],
  community: { homeLocalityId: 'bainbridge-island', timezone: 'America/Los_Angeles' },
};

let register;

beforeEach(async () => {
  resetLocalitiesCache();
  register = await loadLocalities({ commands: { getLocalities: async () => SERVED } });
});

test('loads once and caches; register shape is queryable', async () => {
  let calls = 0;
  resetLocalitiesCache();
  const commands = { getLocalities: async () => { calls += 1; return SERVED; } };
  await loadLocalities({ commands });
  await loadLocalities({ commands });
  assert.equal(calls, 1);
});

test('band derivation matches the backend rule: direct edges only', () => {
  assert.equal(bandBetween(register, 'bainbridge-island', 'bainbridge-island'), 'here');
  assert.equal(bandBetween(register, 'bainbridge-island', 'poulsbo'), 'nearby');
  assert.equal(bandBetween(register, 'bainbridge-island', 'seattle'), 'a-trip');
  assert.equal(bandBetween(register, 'bainbridge-island', 'bremerton'), 'far');
  assert.equal(bandBetween(register, 'bainbridge-island', 'atlantis'), null);
});

test('locality lines speak effort, never distance; home is just the name', () => {
  assert.equal(localityLine(register, 'bainbridge-island', 'bainbridge-island'), 'Bainbridge Island');
  assert.equal(localityLine(register, 'bainbridge-island', 'poulsbo'), 'Poulsbo — an easy hop away');
  assert.equal(localityLine(register, 'bainbridge-island', 'seattle'), 'Seattle — a real trip away');
  assert.equal(localityLine(register, 'bainbridge-island', 'bremerton'), 'Bremerton — a long way away');
  assert.equal(localityLine(register, 'bainbridge-island', 'atlantis'), null);
  assert.equal(bandLabel('nearby'), 'an easy hop away');
});
