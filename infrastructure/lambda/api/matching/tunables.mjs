// Ranking spec v1 — named tunables (docs/matching-spec.md is the source of
// truth and mirrors every default verbatim; change there first).
//
// Every value is configuration, not a constant, and tunable to zero
// (matching.md → "The ranking spec is explicit, versioned, and
// hypothesis-tuned"). The spec version is stamped into the exploration
// hash so a spec bump reshuffles deterministic noise rather than freezing
// it across versions.

export const RANKING_SPEC_VERSION = 1;

export const RANKING_TUNABLES = {
  // Fit — interests-only in v1 (envelope/doors await structured event shape)
  fitInterestWeight: 0.4,
  fitCap: 1.0,
  interestDefaultWeight: 0.5,

  // Affinity — outgoing-only, generosity-discounted (D47 H2-lite)
  affinityPerPersonNudge: 0.12,
  affinityNudgeCap: 0.24, // invariant: < fitCap (open-risks #6, structural)
  affinityGenerosityPivot: 12,
  affinityEdgeLimit: 20,

  // Exploration — deterministic noise + guaranteed exploratory share
  explorationNoise: 0.2,
  explorationShare: 0.25,
};
