// Affinity edge strength v2 (D47/D60, docs/matching-spec.md → Affinity;
// decay per docs/evidence-decay.md).
//
// Every consumer of an affinity edge consumes STRENGTH, never a boolean.
// A directed tap carries its tapper's generosity weight; a mutual's
// amplification is gated by the weaker side (combiner = min); repeated
// reciprocal met-marks confirm the edge (min of the two sides' counts —
// one-sided engagement caps confirmation gain by construction, F13).
//
// Decay is EVIDENCE-BASED (spec v6): the axis is the member's own lived
// (debriefed) events since the anchor — never clock time — and every
// component decays toward a FLOOR, not zero. The floor is the
// incompleteness prior: IRL sees a slice of a member's social world
// (off-platform contact, under-reporting, normalization), so silence is
// never conclusive. Zero activity → zero decay: a member away for a
// season returns to an intact social graph. Recovery on fresh evidence
// is instant and total (anchors reset to the current counter).
//
// Pure functions only — IO (reverse-edge reads, stats reads) lives in
// recommend.mjs. All activity counters come from the caller (the
// projector-maintained stats#affinity items).

// H2-lite generosity self-discount: full weight while total positive taps
// stay at or under the pivot, then pivot/total — a member who taps
// everyone weighs toward zero as a signal source.
export function generosityWeight(totalPositiveTaps, pivot) {
  if (pivot <= 0) return 0;
  if (totalPositiveTaps <= pivot) return 1;
  return pivot / totalPositiveTaps;
}

// Lived events since an anchor snapshot. A missing counter or snapshot
// means NO decay evidence (delta 0) — the same restraint as v5's
// missing-timestamp convention: never age what we can't ground.
export function activityDelta(activityNow, activityAtAnchor) {
  if (typeof activityNow !== 'number' || typeof activityAtAnchor !== 'number') return 0;
  return Math.max(0, activityNow - activityAtAnchor);
}

// Floored exponential: full strength at delta 0, halving toward the
// floor every halfLifeEvents lived events. floor 0 = pure decay,
// floor 1 (or half-life 0) = no decay — both ends stay reachable.
export function flooredDecay(deltaEvents, halfLifeEvents, floor = 0) {
  if (!halfLifeEvents || halfLifeEvents <= 0) return 1;
  const f = Math.min(1, Math.max(0, floor));
  return f + (1 - f) * 2 ** (-Math.max(0, deltaEvents) / halfLifeEvents);
}

// Strength of one directed edge for the tapper's own feed.
//
//   one-sided:  perPersonNudge × w_me × tapDecay
//               (the tapper's own tap always boosts their own feed at its
//                own weight — D47's untouched one-sided component)
//   mutual:     mutualBonus × min(w_me, w_them) × tapDecay
//               (two claims are only as credible as the less selective
//                tapper — a spammer's "mutuals" carry ≈ 0)
//   confirmed:  confirmedBonus × min(1, reciprocalMet / confirmationPivot)
//                 × confirmedDecay
//               (reciprocalMet = min of the two sides' met counts: both
//                members must keep marking each other met, so co-presence
//                alone — a follower — never strengthens the edge. Applies
//                only once mutual, deliberately NOT weight-gated:
//                observed beats inferred — behaviour confirms what taps
//                can't. v1 uses raw reciprocal counts; the
//                above-calendar-chance-rate baseline is H4 tuning work)
//
// Decay anchors are activity snapshots the projector stamps on the edge:
//   tapDecay:       my lived events since MY last tap of them.
//   confirmedDecay: min of the two sides' lived events since their own
//                   last met-mark of the pair — divergence only counts
//                   when BOTH members are out living without each other
//                   (a friend gone quiet generates no divergence).
export function edgeStrength({
  myEdge, reverseEdge, myWeight, theirWeight, myActivity, theirActivity, tunables,
}) {
  // Avoidance zeroes the PAIR outright, either direction (D47/D49: a
  // boost must never fight a de-weight). Non-legible by construction —
  // the other member's feed just quietly stops being pulled toward the
  // pair; nothing observable changes for anyone.
  if (myEdge?.avoid || reverseEdge?.avoid) return 0;

  const tapDecay = flooredDecay(
    activityDelta(myActivity, myEdge?.activityAtLastTap),
    tunables.affinityTapHalfLifeEvents,
    tunables.affinityTapDecayFloor,
  );
  let strength = tunables.affinityPerPersonNudge * myWeight * tapDecay;

  const mutual = (reverseEdge?.seeAgain ?? 0) > 0;
  if (!mutual) return strength;

  strength += tunables.affinityMutualBonus * Math.min(myWeight, theirWeight) * tapDecay;

  const reciprocalMet = Math.min(myEdge?.met ?? 0, reverseEdge?.met ?? 0);
  if (reciprocalMet > 0 && tunables.affinityConfirmationPivot > 0) {
    const scale = Math.min(1, reciprocalMet / tunables.affinityConfirmationPivot);
    const divergence = Math.min(
      activityDelta(myActivity, myEdge?.activityAtLastMet),
      activityDelta(theirActivity, reverseEdge?.activityAtLastMet),
    );
    strength += tunables.affinityConfirmedBonus
      * scale
      * flooredDecay(
        divergence,
        tunables.affinityConfirmedHalfLifeEvents,
        tunables.affinityConfirmedDecayFloor,
      );
  }
  return strength;
}

// Crew nudge (D57/D60): a crew GATHERING — at least two fellow members
// present on the candidate — adds a bonus decayed by MY lived events
// since the crew was last affirmed (each member sees the crew fade at
// the pace of their own lived experience; the crew row on my partition
// carries MY activity snapshot). Summed across crews, capped by the
// caller at crewNudgeCap. A lone crew-mate is just an affinity edge;
// the crew signal is specifically the cluster forming again.
export function crewNudge({ crews, userId, presentPeople, myActivity, tunables }) {
  if (!crews?.length || tunables.crewBonus <= 0) return 0;
  const present = new Set(presentPeople);
  let sum = 0;
  for (const crew of crews) {
    const fellows = (crew.members ?? []).filter((m) => m !== userId && present.has(m));
    if (fellows.length >= 2) {
      sum += tunables.crewBonus * flooredDecay(
        activityDelta(myActivity, crew.activityAtAffirmation),
        tunables.crewHalfLifeEvents,
        tunables.crewDecayFloor,
      );
    }
  }
  return Math.min(tunables.crewNudgeCap, sum);
}
