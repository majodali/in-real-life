// Specifications for the locality register (D62,
// docs/localities-and-constraints.md): curated effort bands from typed
// direct edges — no coordinates, no transitive reachability — plus the
// member-side reach/adjustment math and the sign-up gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMUNITY, LOCALITIES, BANDS, REACHES,
  isValidLocalityId, isValidReach, isValidAdjustment, localityName,
  bandBetween, effectiveBand, bandsBeyondReach,
  localityForPostalCode, servedAreaForPostalCode,
} from './localities.mjs';

test('the community anchors on Bainbridge with a real timezone', () => {
  assert.equal(COMMUNITY.homeLocalityId, 'bainbridge-island');
  assert.ok(isValidLocalityId(COMMUNITY.homeLocalityId));
  assert.equal(COMMUNITY.timezone, 'America/Los_Angeles');
});

test('edges are symmetric by construction, declared once', () => {
  const byId = new Map(LOCALITIES.map((l) => [l.id, l]));
  for (const l of LOCALITIES) {
    for (const n of l.neighbors) {
      assert.ok(byId.get(n).neighbors.includes(l.id), `${l.id}↔${n} neighbor symmetry`);
    }
    for (const c of l.crossings) {
      assert.ok(byId.get(c).crossings.includes(l.id), `${l.id}↔${c} crossing symmetry`);
    }
  }
  // Suquamish's neighbors were declared on other entries — symmetry
  // filled them in.
  assert.ok(byId.get('suquamish').neighbors.includes('poulsbo'));
  assert.ok(byId.get('seattle').crossings.includes('bainbridge-island'));
});

test('bands derive from direct edges only: here / nearby / a-trip / far', () => {
  assert.equal(bandBetween('bainbridge-island', 'bainbridge-island'), 'here');
  assert.equal(bandBetween('bainbridge-island', 'poulsbo'), 'nearby');
  assert.equal(bandBetween('bainbridge-island', 'seattle'), 'a-trip');
  // Kingston is neighbor-of-neighbor — no transitive nearby.
  assert.equal(bandBetween('bainbridge-island', 'kingston'), 'far');
  assert.equal(bandBetween('bainbridge-island', 'bremerton'), 'far');
  assert.equal(bandBetween('no-such-place', 'poulsbo'), null);
});

test('adjustments shift the effective band one step, clamped, both directions', () => {
  assert.equal(effectiveBand('bainbridge-island', 'bremerton', { bremerton: 'closer' }), 'a-trip');
  assert.equal(effectiveBand('bainbridge-island', 'poulsbo', { poulsbo: 'further' }), 'a-trip');
  assert.equal(effectiveBand('bainbridge-island', 'bremerton', { bremerton: 'further' }), 'far', 'clamped at far');
  assert.equal(effectiveBand('bainbridge-island', 'poulsbo', {}), 'nearby', 'no adjustment, median band');
  assert.equal(effectiveBand('bainbridge-island', 'poulsbo', { poulsbo: 'love-it' }), 'nearby', 'unknown feels ignored');
});

test('bandsBeyondReach: excess bands past the reach; anywhere and unknowns excess nothing', () => {
  assert.equal(bandsBeyondReach('far', 'here'), 3);
  assert.equal(bandsBeyondReach('a-trip', 'nearby'), 1);
  assert.equal(bandsBeyondReach('nearby', 'a-trip'), 0);
  assert.equal(bandsBeyondReach('far', 'anywhere'), 0);
  assert.equal(bandsBeyondReach('far', undefined), 0, 'unset reach = anywhere');
  assert.equal(bandsBeyondReach(null, 'here'), 0, 'unresolvable band never penalized');
});

test('vocabulary guards: bands, reaches, adjustments, names', () => {
  assert.deepEqual(BANDS, ['here', 'nearby', 'a-trip', 'far']);
  assert.deepEqual(REACHES, ['here', 'nearby', 'a-trip', 'anywhere']);
  assert.ok(isValidReach('anywhere'));
  assert.ok(!isValidReach('far'), 'far is a band, not a reach');
  assert.ok(isValidAdjustment('closer') && isValidAdjustment('further'));
  assert.ok(!isValidAdjustment('never'));
  assert.equal(localityName('poulsbo'), 'Poulsbo');
});

test('postal resolution and the served gate: banding a place never widens sign-up', () => {
  assert.equal(localityForPostalCode('98110'), 'bainbridge-island');
  assert.equal(localityForPostalCode(' 98370 '), 'poulsbo');
  assert.equal(localityForPostalCode('99999'), null);

  assert.equal(servedAreaForPostalCode('98110'), 'Bainbridge Island');
  assert.equal(servedAreaForPostalCode('98370'), null, 'in the register, not served');
  assert.equal(servedAreaForPostalCode(null), null);
});
