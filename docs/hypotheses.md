# Hypothesis Register & Tuning Methodology

We embed analyses, heuristics, and scoring adjustments throughout IRL — in ranking, composition, the user model, trust. Each one is a **hypothesis, not a truth**: a best current guess about what serves members, awaiting evidence. This note is the methodology for keeping them honest, and the register that tracks them.

It pairs with `decisions.md` (what we've decided) and `open-risks.md` (what might be wrong): this register holds **what we believe and how we'd find out**.

## The methodology

Every embedded analysis is documented with five parts:

1. **The hypothesis, stated plainly.** What we believe is true about members and outcomes, falsifiably phrased.
2. **The adjustment it motivates.** The specific algorithm/scoring change — expressed as **named, tunable parameters** (weights, caps, windows), never hard-coded constants. Tunable includes tunable **to zero**.
3. **Evidence and counter-evidence.** Which observed outcomes (per `success-and-progress.md` — indicators, never targets) would support or undermine it, and where that signal accrues. Every hypothesis has **kill criteria** — what result would make us reverse it.
4. **The two-way door.** How the change stays reversible:
   - **Capture ≠ use.** Raw signals are always captured and retained even when the algorithm ignores or transforms them. Changing *use* is reversible; ceasing *capture* is a one-way door that forecloses future refinements. (This is why we never simply deleted affinity-received.)
   - Adjustments live at the **interpretation layer** (projector / ranker parameters), so replay + re-tuning can always produce a different reading of the same history.
5. **The anti-pattern it targets or risks.** What failure mode motivated it, what new failure mode it could introduce, and how we'd detect each (links to the gaming register in `matching.md` and watch-items in `decisions.md`).

Review is human-in-the-loop on the governance cadence (`decisions.md` → Governance, still to be defined) — hypotheses are promoted (validated), tuned, or retired on **long-term outcome evidence**, not first-take reactions.

## Honest constraints on evidence

- **Small-N reality.** A single community is dozens-to-hundreds of members; evidence accrues slowly and noisily. Most hypotheses will sit at "insufficient evidence" for a long time — that's the honest state, and we don't over-conclude from thin data.
- **Ethics of evaluation.** We are measuring people's social lives. We prefer **observational evidence and staged rollouts** over covert experiments; anything resembling an experiment on members' connection or loneliness gets the same consent-and-care bar as all success measurement (`success-and-progress.md` → Privacy & ethics).
- **Goodhart discipline.** Evidence signals are indicators for human review, never optimization targets.

## Register

| # | Hypothesis | Adjustment | Evidence for / against | Status |
|---|---|---|---|---|
| H1 | **Raw affinity-received measures magnetism, not welcome** — unadjusted tap counts correlate with charisma/status more than with others' good outcomes, producing rich-get-richer routing | Motivated retiring raw tap-counts as a rating input (see H2) | For: tap distribution concentrating on a few members without corresponding outcome lift in their rooms. Against: raw counts turning out to predict others' outcomes as well as the transformed signal | active |
| H2 | **A generosity-normalized, newcomer-weighted tap signal identifies "welcomers"** — members whose presence makes hard rooms easier, especially for the hard-to-reach | The **welcomer signal**: each tap weighted inversely to the tapper's overall tap rate; taps from newcomers / rare tappers at early events weighted highest. Feeds *positive participation* only, composition-only (never facilitator/organiser/enforcement gates). Parameters: tapper-generosity exponent, newcomer multiplier, decay — all tunable, incl. to zero (which restores plain reliability+absence-of-concerns) | For: rooms composed with high-welcomer presence showing higher newcomer return rates. Against: no outcome difference vs. welcomer-blind composition → retire the weight | active |
| H3 | **Weaving welcomers into newcomers' early events raises the newcomer second-event rate** (the key D39 outcome this whole mechanism serves) | The composition nudge that consumes H2's signal (capped per `matching.md`) | For/against: newcomer second-event rate with vs. without welcomer presence, observationally, over time. Kill criterion: no lift after adequate accumulation → drop the nudge, keep the data | active |

**Notes on H1–H3 (the categorization concern, resolved):** the newcomer-weighting **categorizes the tapped (as welcoming), not the tapper** — tapper-side weighting is a statistical adjustment over dozens/hundreds of data points, and any implicit read of an individual tapper washes out with volume. The purpose of the whole analysis is precisely to *reduce* the rich-get-richer anti-pattern, not to engineer people; and affinity is one of the weakest ranking inputs anyway (capped well below fit), so the mechanism's blast radius is inherently small. We may tweak the transformation, but the direction is right. Raw affinity-received remains captured, untransformed, in the log — the transformation is interpretation-layer only.

## Adding to this register

Any new scoring/sorting/analysis change of consequence gets an entry *before or with* the change — hypothesis, tunables, evidence plan, kill criteria, anti-patterns. If we can't state what evidence would change our mind, the change isn't ready.
