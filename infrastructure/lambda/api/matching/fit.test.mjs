// Specifications for fit scoring v1 (docs/matching-spec.md → Fit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, tagMatches, fitScore } from './fit.mjs';
import { RANKING_TUNABLES } from './tunables.mjs';

test('tokenize lowercases, splits on non-alphanumerics, strips naive plurals', () => {
  const tokens = tokenize('Board Games & Pizza-Night!');
  assert.ok(tokens.has('board'));
  assert.ok(tokens.has('game')); // "games" → "game"
  assert.ok(tokens.has('pizza'));
  assert.ok(tokens.has('night'));
});

test('plural stripping never touches short words or -ss endings', () => {
  assert.ok(tokenize('chess').has('chess'));
  assert.ok(tokenize('gas').has('gas'));
});

test('a tag matches when at least half its tokens appear', () => {
  const eventTokens = tokenize('Board game night at the hall');
  assert.equal(tagMatches('board games', eventTokens), true);
  assert.equal(tagMatches('pottery', eventTokens), false);
  // 1 of 3 tokens < ceil(3/2) — no match
  assert.equal(tagMatches('night kayak fishing', eventTokens), false);
  // 2 of 3 ≥ ceil(3/2) — match
  assert.equal(tagMatches('game night snacks', eventTokens), true);
});

test('fitScore sums matched interests scaled by weight, capped at fitCap', () => {
  const event = { title: 'Board game night', description: 'casual, snacks provided' };
  const t = RANKING_TUNABLES;

  const one = fitScore([{ tag: 'board games', weight: 0.9 }], event, t);
  assert.ok(Math.abs(one - t.fitInterestWeight * 0.9) < 1e-9);

  const none = fitScore([{ tag: 'pottery', weight: 1 }], event, t);
  assert.equal(none, 0);

  // Missing weight falls back to the default
  const fallback = fitScore([{ tag: 'snacks' }], event, t);
  assert.ok(Math.abs(fallback - t.fitInterestWeight * t.interestDefaultWeight) < 1e-9);

  // Many matches saturate at the cap
  const many = fitScore(
    Array.from({ length: 10 }, () => ({ tag: 'game', weight: 1 })),
    event, t,
  );
  assert.equal(many, t.fitCap);
});

test('description text counts toward matching', () => {
  const event = { title: 'Thursday meetup', description: 'we play scrabble and chat' };
  assert.ok(fitScore([{ tag: 'scrabble', weight: 1 }], event, RANKING_TUNABLES) > 0);
});
