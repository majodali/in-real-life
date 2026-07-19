// Ranking spec v1 — named tunables (docs/matching-spec.md is the source of
// truth and mirrors every default verbatim; change there first).
//
// Every value is configuration, not a constant, and tunable to zero
// (matching.md → "The ranking spec is explicit, versioned, and
// hypothesis-tuned"). The spec version is stamped into the exploration
// hash so a spec bump reshuffles deterministic noise rather than freezing
// it across versions.

export const RANKING_SPEC_VERSION = 7;

export const RANKING_TUNABLES = {
  // Fit — interest tags vs event shape (D56) with text fallback, plus
  // door fit; envelope fit still waits on a comparable member-side form
  fitActivityTagWeight: 0.5,
  fitInterestWeight: 0.4,
  fitDoorWeight: 0.15,
  fitCap: 1.0,
  interestDefaultWeight: 0.5,
  // Envelope fit (D58, spec v5): structured positions vs event shape/size.
  // knownFace is a FIT component, not a nudge — for a needs-known-face
  // member a familiar face is what makes the room feasible at all.
  fitStructureWeight: 0.25,
  fitSizeWeight: 0.2,
  fitKnownFaceWeight: 0.2,

  // Affinity — strength-weighted (D47/H4): one-sided tap at own weight,
  // mutual amplification gated by the weaker side, reciprocal-met
  // confirmation on a longer half-life.
  //
  // Decay is EVIDENCE-BASED (spec v6, docs/evidence-decay.md): half-lives
  // count the member's own debriefed events — never clock time — and
  // each component decays toward a FLOOR, not zero (the incompleteness
  // prior: silence is never conclusive; below-floor is reserved for
  // grounded counter-evidence — D49 avoidance, D50 blocks). Calibrated
  // so a weekly-cadence member sees ≈ the old day-based rates.
  affinityPerPersonNudge: 0.12,
  affinityMutualBonus: 0.12,
  affinityConfirmedBonus: 0.08,
  affinityConfirmationPivot: 3,
  affinityTapHalfLifeEvents: 12, // was 90 days ≈ 12 weekly events
  affinityConfirmedHalfLifeEvents: 36, // was 270 days
  affinityTapDecayFloor: 0, // a fresh one-sided tap may honestly fade out
  affinityConfirmedDecayFloor: 0.5, // established pairs never halve-below on silence
  affinityNudgeCap: 0.24, // invariant: < fitCap (open-risks #6, structural)
  affinityGenerosityPivot: 12,
  affinityEdgeLimit: 20,
  // Met-without-tap is CAPTURED, NOT USED (edge sources already carry
  // it): normalization is indistinguishable from cooling, so no
  // consumption path is built — promoting this signal is a spec bump
  // with hypothesis-register evidence, not a tuning tweak.
  metWithoutTapMultiplier: 1.0,

  // Crews (D47): triads whose three pairs are all mutual-strong —
  // reciprocal-met is the co-attendance proxy, never tap counts.
  // Consumption: a crew GATHERING (≥2 fellow members present) nudges,
  // capped separately; affinityNudgeCap + crewNudgeCap is the total
  // soft-nudge ceiling and must stay below fitCap (must-not-ossify is
  // structural, not aspirational).
  crewMutualMetPivot: 2,
  crewBonus: 0.1,
  crewNudgeCap: 0.12,
  crewHalfLifeEvents: 24, // was 180 days; own-activity axis, floored
  crewDecayFloor: 0.5, // crews never halve-below on silence alone

  // Avoidance (D49/D61, spec v7) — comfort-tier only, SOFT de-weight
  // only: never a hard filter, never visible, information-symmetric.
  // A named pair's positive strength is zeroed structurally
  // (edgeStrength); these penalties additionally de-prioritize events
  // where an avoided person is present — in the NAMER's feed only, and
  // graduated by tier. Today's only consumption surface is passive feed
  // suggestion — D49's softest tier; injection/composition surfaces
  // apply their stronger tiers when they exist. The safety tier is
  // blocks (D50): hard, and not this mechanism.
  avoidancePenalty: 0.12, // per do-not-interact person present
  didntClickPenalty: 0.04, // per didn't-click person present
  avoidanceDeweightCap: 0.24, // max total de-weight per event

  // Exploration — deterministic noise + guaranteed exploratory share
  explorationNoise: 0.2,
  explorationShare: 0.25,
};
