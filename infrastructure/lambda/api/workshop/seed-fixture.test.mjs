// The seed catalog's structural guarantees (D64 slice 2): the fixture
// is a strawman whose CONTENTS are cheap to change, but its structure
// carries invariants the seeder and the workshop design rely on —
// unique ids, rosters that only reference cataloged personas, canned
// debriefs only on past events and only by confirmed attendees, valid
// vocabulary everywhere (envelope positions, time windows, reaches,
// slots), and typed templates that actually classify.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_PERSONAS, SEED_EVENTS, personaById, seedEventById,
  buildExtraction, buildTranscript, eventTimes, personaEmail,
  DEFAULT_LOCALITY_BINDINGS, SEED_SLOTS, SEED_PASSWORD,
} from './seed-fixture.mjs';
import { isValidPosition, isValidEdge } from '../lib/envelope.mjs';
import { isValidTimeWindow } from '../lib/time-windows.mjs';
import { isValidReach, isValidLocalityId } from '../lib/localities.mjs';
import { classifyEventType } from '../lib/event-types.mjs';

test('catalog size and identity: 50 unique personas, 50 unique events', () => {
  assert.equal(SEED_PERSONAS.length, 50);
  assert.equal(SEED_EVENTS.length, 50);
  assert.equal(new Set(SEED_PERSONAS.map((p) => p.id)).size, 50);
  assert.equal(new Set(SEED_PERSONAS.map((p) => p.email)).size, 50);
  assert.equal(new Set(SEED_EVENTS.map((e) => e.id)).size, 50);
  assert.ok(SEED_PASSWORD.length >= 12);
  for (const p of SEED_PERSONAS) {
    assert.equal(p.email, personaEmail(p.id));
    assert.match(p.email, /^seed-/);
    assert.ok(SEED_SLOTS.includes(p.slot), p.id);
  }
});

test('slots cover A, B, and C with a home majority; default bindings are register localities', () => {
  const bySlot = { A: 0, B: 0, C: 0 };
  for (const p of SEED_PERSONAS) bySlot[p.slot]++;
  assert.ok(bySlot.A > bySlot.B && bySlot.B > bySlot.C && bySlot.C >= 3, JSON.stringify(bySlot));
  for (const slot of SEED_SLOTS) {
    assert.ok(isValidLocalityId(DEFAULT_LOCALITY_BINDINGS[slot]), slot);
  }
});

test('every extraction speaks the model vocabulary', () => {
  for (const p of SEED_PERSONAS) {
    const x = buildExtraction(p);
    assert.equal(x.provisional, true);
    assert.ok(x.narrative.selfDescription.includes(p.name));
    assert.ok(x.narrative.stories.length >= 1, p.id);
    assert.ok(x.doors.length >= 1);
    for (const d of x.doors) {
      assert.ok(['useful', 'make-learn', 'connect'].includes(d.door), p.id);
      assert.ok(d.weight > 0 && d.weight <= 1);
    }
    assert.ok(x.interests.length >= 1, p.id);
    for (const [dim, spec] of Object.entries(x.envelope)) {
      if (dim === 'energy') continue;
      assert.ok(isValidPosition(dim, spec.position), `${p.id} ${dim} ${spec.position}`);
      if (spec.growthEdge !== undefined) {
        assert.ok(isValidEdge(dim, spec.growthEdge), `${p.id} ${dim} edge`);
      }
    }
    for (const w of x.constraints.timeWindows) assert.ok(isValidTimeWindow(w), p.id);
    assert.ok(isValidReach(x.constraints.travelReach), p.id);
    const transcript = buildTranscript(p);
    assert.ok(transcript.length >= 2);
    assert.ok(transcript.every((t) => typeof t.role === 'string' && typeof t.text === 'string'));
  }
});

test('same-archetype personas still differ (deterministic weight shifts)', () => {
  const [a, b] = [SEED_PERSONAS[0], SEED_PERSONAS[8]]; // same archetype, different index
  assert.equal(a.archetype, b.archetype);
  assert.notDeepEqual(
    buildExtraction(a).doors.map((d) => d.weight),
    buildExtraction(b).doors.map((d) => d.weight),
  );
});

test('rosters only reference cataloged personas; organizer is confirmed on real events', () => {
  for (const e of SEED_EVENTS) {
    assert.ok(personaById.has(e.organizer), e.id);
    for (const pid of [...e.confirmed, ...e.interested]) {
      assert.ok(personaById.has(pid), `${e.id} → ${pid}`);
    }
    // No persona both interested and confirmed on the same event.
    const overlap = e.confirmed.filter((pid) => e.interested.includes(pid));
    assert.deepEqual(overlap, [], e.id);
    if (e.status !== 'idea') {
      assert.ok(e.confirmed.includes(e.organizer), e.id);
      assert.ok(e.confirmed.length >= 3, e.id);
    } else {
      // An idea has no time yet — nothing to confirm attendance TO.
      assert.deepEqual(e.confirmed, []);
    }
    if (e.maxAttendance !== undefined) {
      assert.ok(e.confirmed.length <= e.maxAttendance, e.id);
    }
    assert.ok(SEED_SLOTS.includes(e.slot), e.id);
  }
});

test('debriefs: past events only, confirmed attendees only, taps land on fellow attendees', () => {
  const past = SEED_EVENTS.filter((e) => e.offsetDays < 0);
  assert.equal(past.length, 10);
  assert.ok(past.every((e) => e.status === 'planned'));
  for (const e of SEED_EVENTS) {
    if (e.offsetDays >= 0) {
      assert.equal(e.debriefs, undefined, e.id);
      continue;
    }
    assert.ok(e.debriefs.length >= 3, e.id);
    const noShows = new Set(e.debriefs.filter((d) => !d.attended).map((d) => d.personaId));
    for (const d of e.debriefs) {
      assert.ok(e.confirmed.includes(d.personaId), `${e.id} ${d.personaId}`);
      if (!d.attended) {
        assert.equal(d.again, undefined);
        continue;
      }
      assert.ok(['yes', 'maybe', 'no'].includes(d.again), e.id);
      for (const tap of d.people ?? []) {
        assert.notEqual(tap.personaId, d.personaId, e.id);
        assert.ok(e.confirmed.includes(tap.personaId), e.id);
        assert.ok(!noShows.has(tap.personaId), `${e.id}: tapped a no-show`);
      }
    }
  }
  // Some again-variety exists: yes, maybe, and no all appear somewhere.
  const agains = new Set(past.flatMap((e) => e.debriefs.map((d) => d.again)).filter(Boolean));
  assert.deepEqual([...agains].sort(), ['maybe', 'no', 'yes']);
});

test('typed templates classify; untyped templates stay untyped (first-class)', () => {
  const typed = new Map();
  for (const e of SEED_EVENTS) {
    typed.set(e.templateKey, classifyEventType({ shape: e.shape, title: e.title }));
  }
  assert.equal(typed.get('board-games'), 'board-game-night');
  assert.equal(typed.get('trivia'), 'trivia-night');
  assert.equal(typed.get('pottery'), 'pottery-class');
  assert.equal(typed.get('wood-shop'), 'wood-shop-night');
  assert.equal(typed.get('group-walk'), 'group-walk');
  assert.equal(typed.get('running'), 'running-club');
  assert.equal(typed.get('potluck'), 'potluck-dinner');
  assert.equal(typed.get('book-club'), 'book-club');
  assert.equal(typed.get('shore-cleanup'), 'shore-cleanup');
  assert.equal(typed.get('photography'), null);
  assert.equal(typed.get('garden'), null);
  assert.equal(typed.get('listening'), null);
});

test('event times derive from the simulated clock; ideas carry none', () => {
  const now = Date.parse('2026-07-01T12:00:00Z');
  for (const e of SEED_EVENTS) {
    const { startTime, endTime } = eventTimes(e, now);
    if (e.status === 'idea') {
      assert.equal(startTime, undefined);
      continue;
    }
    assert.ok(startTime && endTime, e.id);
    assert.ok(Date.parse(endTime) > Date.parse(startTime), e.id);
    if (e.offsetDays < 0) assert.ok(Date.parse(endTime) < now, `${e.id} should be over`);
    if (e.offsetDays > 0) assert.ok(Date.parse(startTime) > now, `${e.id} should be upcoming`);
  }
  assert.ok(seedEventById.get('seed-e01').offsetDays < 0);
});
