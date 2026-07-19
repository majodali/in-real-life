// Affinity edge strength v1 (D47, docs/matching-spec.md → Affinity).
//
// Every consumer of an affinity edge consumes STRENGTH, never a boolean.
// A directed tap carries its tapper's generosity weight; a mutual's
// amplification is gated by the weaker side (combiner = min); repeated
// reciprocal met-marks confirm the edge (min of the two sides' counts —
// one-sided engagement caps confirmation gain by construction, F13);
// tap-derived strength decays on a shorter half-life than confirmed
// strength. All parameters are named tunables, tunable to zero — a huge
// generosity pivot restores raw mutuals.
//
// Pure functions only — IO (reverse-edge reads, stats reads) lives in
// recommend.mjs. All recency comes from the caller's simulated now.

// H2-lite generosity self-discount: full weight while total positive taps
// stay at or under the pivot, then pivot/total — a member who taps
// everyone weighs toward zero as a signal source.
export function generosityWeight(totalPositiveTaps, pivot) {
  if (pivot <= 0) return 0;
  if (totalPositiveTaps <= pivot) return 1;
  return pivot / totalPositiveTaps;
}

// Exponential half-life decay anchored to simulated time (replay-safe).
// No timestamp or no half-life → no decay (factor 1).
export function decayFactor(nowIso, asOfIso, halfLifeDays) {
  if (!asOfIso || !halfLifeDays || halfLifeDays <= 0) return 1;
  const days = Math.max(0, (Date.parse(nowIso) - Date.parse(asOfIso)) / 86_400_000);
  return 2 ** (-days / halfLifeDays);
}

export function latestTapAt(edge) {
  let latest;
  for (const s of edge?.sources ?? []) {
    if (s?.seeAgain && s.asOf && (!latest || s.asOf > latest)) latest = s.asOf;
  }
  return latest;
}

export function latestMetAt(edge) {
  let latest;
  for (const s of edge?.sources ?? []) {
    if (s?.asOf && (!latest || s.asOf > latest)) latest = s.asOf;
  }
  return latest;
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
export function edgeStrength({ myEdge, reverseEdge, myWeight, theirWeight, nowIso, tunables }) {
  const tapDecay = decayFactor(nowIso, latestTapAt(myEdge), tunables.affinityTapHalfLifeDays);
  let strength = tunables.affinityPerPersonNudge * myWeight * tapDecay;

  const mutual = (reverseEdge?.seeAgain ?? 0) > 0;
  if (!mutual) return strength;

  strength += tunables.affinityMutualBonus * Math.min(myWeight, theirWeight) * tapDecay;

  const reciprocalMet = Math.min(myEdge?.met ?? 0, reverseEdge?.met ?? 0);
  if (reciprocalMet > 0 && tunables.affinityConfirmationPivot > 0) {
    const scale = Math.min(1, reciprocalMet / tunables.affinityConfirmationPivot);
    const mine = latestMetAt(myEdge);
    const theirs = latestMetAt(reverseEdge);
    // Freshness needs BOTH sides recent — take the older of the two.
    const metAt = mine && theirs ? (mine < theirs ? mine : theirs) : (mine ?? theirs);
    strength += tunables.affinityConfirmedBonus
      * scale
      * decayFactor(nowIso, metAt, tunables.affinityConfirmedHalfLifeDays);
  }
  return strength;
}

// Crew nudge (D47, spec v4): a crew GATHERING — at least two fellow
// members present on the candidate — adds a bonus decayed by how long
// since the crew was last affirmed. Summed across crews, capped by the
// caller at crewNudgeCap. A lone crew-mate is just an affinity edge;
// the crew signal is specifically the cluster forming again.
export function crewNudge({ crews, userId, presentPeople, nowIso, tunables }) {
  if (!crews?.length || tunables.crewBonus <= 0) return 0;
  const present = new Set(presentPeople);
  let sum = 0;
  for (const crew of crews) {
    const fellows = (crew.members ?? []).filter((m) => m !== userId && present.has(m));
    if (fellows.length >= 2) {
      sum += tunables.crewBonus
        * decayFactor(nowIso, crew.lastAffirmedAt, tunables.crewHalfLifeDays);
    }
  }
  return Math.min(tunables.crewNudgeCap, sum);
}
