// Ranking spec v1 — named tunables (docs/matching-spec.md is the source of
// truth and mirrors every default verbatim; change there first).
//
// Every value is configuration, not a constant, and tunable to zero
// (matching.md → "The ranking spec is explicit, versioned, and
// hypothesis-tuned"). The spec version is stamped into the exploration
// hash so a spec bump reshuffles deterministic noise rather than freezing
// it across versions.

export const RANKING_SPEC_VERSION = 3;

export const RANKING_TUNABLES = {
  // Fit — interest tags vs event shape (D56) with text fallback, plus
  // door fit; envelope fit still waits on a comparable member-side form
  fitActivityTagWeight: 0.5,
  fitInterestWeight: 0.4,
  fitDoorWeight: 0.15,
  fitCap: 1.0,
  interestDefaultWeight: 0.5,

  // Affinity — strength-weighted (D47/H4): one-sided tap at own weight,
  // mutual amplification gated by the weaker side, reciprocal-met
  // confirmation on a longer half-life
  affinityPerPersonNudge: 0.12,
  affinityMutualBonus: 0.12,
  affinityConfirmedBonus: 0.08,
  affinityConfirmationPivot: 3,
  affinityTapHalfLifeDays: 90,
  affinityConfirmedHalfLifeDays: 270,
  affinityNudgeCap: 0.24, // invariant: < fitCap (open-risks #6, structural)
  affinityGenerosityPivot: 12,
  affinityEdgeLimit: 20,

  // Exploration — deterministic noise + guaranteed exploratory share
  explorationNoise: 0.2,
  explorationShare: 0.25,
};
