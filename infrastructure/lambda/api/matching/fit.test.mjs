// Specifications for fit scoring v2 (docs/matching-spec.md → Fit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize, tagMatches, interestFit, doorFit, eventFit, structureFit,
  sizeFit, sizeBandOf, timeWindowFit, againFit, noveltyFit,
} from './fit.mjs';
import { RANKING_TUNABLES } from './tunables.mjs';

const t = RANKING_TUNABLES;

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

// ─── Interest fit: shape tier first, text fallback ───

test('sums matched interests scaled by weight; text fallback when no shape', () => {
  const event = { title: 'Board game night', description: 'casual, snacks provided' };

  const one = interestFit([{ tag: 'board games', weight: 0.9 }], event, t);
  assert.ok(Math.abs(one - t.fitInterestWeight * 0.9) < 1e-9);

  assert.equal(interestFit([{ tag: 'pottery', weight: 1 }], event, t), 0);

  // Missing weight falls back to the default
  const fallback = interestFit([{ tag: 'snacks' }], event, t);
  assert.ok(Math.abs(fallback - t.fitInterestWeight * t.interestDefaultWeight) < 1e-9);
});

test('an activityTags match scores at the higher shape tier', () => {
  const event = {
    title: 'Thursday thing',
    shape: { activityTags: ['board games'], structure: 'structured', doors: [] },
  };
  const score = interestFit([{ tag: 'board games', weight: 1 }], event, t);
  assert.ok(Math.abs(score - t.fitActivityTagWeight) < 1e-9);
});

test('shape tier and text tier never double-count one interest', () => {
  const event = {
    title: 'Board game night',
    shape: { activityTags: ['board games'], structure: 'structured', doors: [] },
  };
  const score = interestFit([{ tag: 'board games', weight: 1 }], event, t);
  assert.ok(Math.abs(score - t.fitActivityTagWeight) < 1e-9);
});

test('a shaped event still text-matches interests its tags miss', () => {
  const event = {
    title: 'Harbor cleanup, coffee after',
    shape: { activityTags: ['beach cleanup'], structure: 'structured', doors: ['useful'] },
  };
  const score = interestFit([{ tag: 'coffee', weight: 1 }], event, t);
  assert.ok(Math.abs(score - t.fitInterestWeight) < 1e-9);
});

test('description text counts toward matching', () => {
  const event = { title: 'Thursday meetup', description: 'we play scrabble and chat' };
  assert.ok(interestFit([{ tag: 'scrabble', weight: 1 }], event, t) > 0);
});

// ─── Door fit: structured on both sides ───

test('door fit multiplies the member door weight by fitDoorWeight per shared door', () => {
  const event = {
    title: 'x',
    shape: { activityTags: [], structure: 'unstructured', doors: ['connect', 'make-learn'] },
  };
  const doors = [
    { door: 'connect', weight: 0.8 },
    { door: 'useful', weight: 1 }, // not on the event — no contribution
  ];
  const score = doorFit(doors, event, t);
  assert.ok(Math.abs(score - t.fitDoorWeight * 0.8) < 1e-9);
});

test('door fit is zero without shape or without member doors', () => {
  assert.equal(doorFit([{ door: 'connect', weight: 1 }], { title: 'x' }, t), 0);
  assert.equal(doorFit([], {
    title: 'x', shape: { activityTags: [], structure: 'structured', doors: ['connect'] },
  }, t), 0);
});

// ─── Combined ───

test('eventFit sums interest and door fit, capped at fitCap', () => {
  const event = {
    title: 'Pottery wheel intro',
    shape: { activityTags: ['pottery'], structure: 'structured', doors: ['make-learn', 'connect'] },
  };
  const model = {
    interests: Array.from({ length: 10 }, () => ({ tag: 'pottery', weight: 1 })),
    doors: [{ door: 'make-learn', weight: 1 }, { door: 'connect', weight: 1 }],
  };
  assert.equal(eventFit(model, event, t), t.fitCap);

  const modest = eventFit(
    { interests: [{ tag: 'pottery', weight: 1 }], doors: [{ door: 'connect', weight: 1 }] },
    event, t,
  );
  assert.ok(Math.abs(modest - (t.fitActivityTagWeight + t.fitDoorWeight)) < 1e-9);
});

// ─── Envelope fit (D58, spec v5) ───

test('structure fit maps member position onto the shape enum: exact / adjacent / opposite', () => {
  const shaped = (structure) => ({
    title: 'x', shape: { activityTags: [], structure, doors: [] },
  });
  const env = (position) => ({ structure: { position } });
  assert.ok(Math.abs(
    structureFit(env('activity-anchored'), shaped('structured'), t) - t.fitStructureWeight,
  ) < 1e-9);
  assert.ok(Math.abs(
    structureFit(env('balanced'), shaped('structured'), t) - t.fitStructureWeight * 0.5,
  ) < 1e-9);
  assert.equal(structureFit(env('open-conversation'), shaped('structured'), t), 0);
  assert.equal(structureFit(env('activity-anchored'), { title: 'no shape' }, t), 0);
  assert.equal(structureFit({}, shaped('structured'), t), 0);
});

test('size banding: cap wins, else threshold vs current interest', () => {
  assert.equal(sizeBandOf({ maxAttendance: 4 }), 'intimate');
  assert.equal(sizeBandOf({ maxAttendance: 8 }), 'small');
  assert.equal(sizeBandOf({ maxAttendance: 20 }), 'large');
  assert.equal(sizeBandOf({ minimumAttendance: 3, confirmedCount: 1, interestCount: 1 }), 'intimate');
  assert.equal(sizeBandOf({ minimumAttendance: 3, confirmedCount: 6, interestCount: 4 }), 'large');
});

test('size fit compares member band to event band with adjacency', () => {
  const env = { groupSize: { position: 'intimate' } };
  assert.ok(Math.abs(sizeFit(env, { maxAttendance: 4 }, t) - t.fitSizeWeight) < 1e-9);
  assert.ok(Math.abs(sizeFit(env, { maxAttendance: 8 }, t) - t.fitSizeWeight * 0.5) < 1e-9);
  assert.equal(sizeFit(env, { maxAttendance: 30 }, t), 0);
  assert.equal(sizeFit({}, { maxAttendance: 4 }, t), 0); // no position → no component
});

// ─── Time-window fit (D62, spec v8): rhythm is preference, never a gate ───

test('a matching window adds fitTimeWindowWeight; a mismatch subtracts nothing', () => {
  // 2026-07-23T02:00Z = Wednesday 19:00 PDT — weekday-evening locally.
  const eveningEvent = { title: 'x', startTime: '2026-07-23T02:00:00.000Z' };
  const constraints = { timeWindows: ['weekday-evening'] };
  assert.ok(Math.abs(
    timeWindowFit(constraints, eveningEvent, t) - t.fitTimeWindowWeight,
  ) < 1e-9);

  const daytimeOnly = { timeWindows: ['weekday-daytime'] };
  assert.equal(timeWindowFit(daytimeOnly, eveningEvent, t), 0, 'mismatch = no component, no penalty');
  assert.equal(timeWindowFit({ timeWindows: ['weekday evenings'] }, eveningEvent, t), 0,
    'legacy free text never matches a slug');
  assert.equal(timeWindowFit({}, eveningEvent, t), 0);
  assert.equal(timeWindowFit(constraints, { title: 'idea, no time yet' }, t), 0);
});

// ─── Again-intent + novelty fit (D63, spec v9) ───

test('againFit: the member\'s own word — yes full, maybe half, no/none nothing', () => {
  const event = { title: 'x', eventTypeId: 'board-game-night' };
  assert.ok(Math.abs(
    againFit({ 'board-game-night': { lastAgain: 'yes' } }, event, t) - t.fitAgainWeight,
  ) < 1e-9);
  assert.ok(Math.abs(
    againFit({ 'board-game-night': { lastAgain: 'maybe' } }, event, t) - t.fitAgainWeight / 2,
  ) < 1e-9);
  assert.equal(againFit({ 'board-game-night': { lastAgain: 'no' } }, event, t), 0,
    'a no is never a penalty — and never a boost');
  assert.equal(againFit({}, event, t), 0);
  assert.equal(againFit({ 'board-game-night': { lastAgain: 'yes' } }, { title: 'untyped' }, t), 0);
});

test('noveltyFit: seeks-new pays on new kinds, prefers-ritual on kept-returning ones', () => {
  const seeksNew = { novelty: { position: 'seeks-new' } };
  const ritual = { novelty: { position: 'prefers-ritual' } };
  const potteryEvent = { title: 'x', eventTypeId: 'pottery-class' };
  const gamesEvent = { title: 'x', eventTypeId: 'board-game-night' };

  // Whole family new → full; new kind in a familiar family → half.
  assert.ok(Math.abs(
    noveltyFit(seeksNew, { 'board-game-night': { attended: 4 } }, potteryEvent, t)
      - t.fitNoveltyWeight,
  ) < 1e-9, 'making is a new family');
  assert.ok(Math.abs(
    noveltyFit(seeksNew, { 'trivia-night': { attended: 4 } }, gamesEvent, t)
      - t.fitNoveltyWeight / 2,
  ) < 1e-9, 'new kind, familiar family (games)');
  assert.equal(noveltyFit(seeksNew, { 'pottery-class': { attended: 1 } }, potteryEvent, t), 0,
    'familiar kind pays nothing to seeks-new');

  // Ritual pays only past the pivot.
  assert.ok(Math.abs(
    noveltyFit(ritual, { 'pottery-class': { attended: t.noveltyRitualPivot } }, potteryEvent, t)
      - t.fitNoveltyWeight,
  ) < 1e-9);
  assert.equal(noveltyFit(ritual, { 'pottery-class': { attended: 1 } }, potteryEvent, t), 0);

  // mix / no position / untyped → the component doesn't apply.
  assert.equal(noveltyFit({ novelty: { position: 'mix' } }, {}, potteryEvent, t), 0);
  assert.equal(noveltyFit({}, {}, potteryEvent, t), 0);
  assert.equal(noveltyFit(seeksNew, {}, { title: 'untyped' }, t), 0);
});

test('eventFit sums envelope components inside fitCap', () => {
  const event = {
    title: 'Pottery night',
    maxAttendance: 6,
    shape: { activityTags: ['pottery'], structure: 'structured', doors: ['make-learn'] },
  };
  const model = {
    interests: [{ tag: 'pottery', weight: 1 }],
    doors: [{ door: 'make-learn', weight: 1 }],
    envelope: { structure: { position: 'activity-anchored' }, groupSize: { position: 'small' } },
  };
  const expected = t.fitActivityTagWeight + t.fitDoorWeight
    + t.fitStructureWeight + t.fitSizeWeight;
  assert.ok(Math.abs(eventFit(model, event, t) - Math.min(t.fitCap, expected)) < 1e-9);
});
