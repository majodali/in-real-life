# Matching & Recommendation — Design

The recommender is where everything meets: **fit**, **affinity**, **contributor rating**, **crews**, **hard constraints**, **avoidance**, and **newcomer status** all combine into what a member actually sees. It's the Group-3 gap that four open-risks (#6 bounded influence, #7 affinity observability, #8 cold-start inclusion, #17 avoidance leakage) all constrain — this note is their shared home.

## Philosophy

> **Fit-first base ranking + bounded soft nudges + a preserved exploration floor. Every backstage signal *nudges*; nothing *gates*.**

- **Soft and noisy — because it's a better experience.** Mechanical, obvious recommendations are the worst possible UX; soft, varied, *occasionally challenging* is what feels alive. Softness is for delight, not disguise.
- **We don't pretend our influence is invisible.** In-person life is saturated with cues we'll never track, and consciously tapping "want to see again" itself changes how someone behaves toward that person next time. Two people discovering they both tapped is a *good* outcome, not a leak. Our job is narrow and honest: **remove the problematic influences *we* introduce, and get out of the way of everything else.** *(This refines D21 — no "who liked you" **surface**; it was never a claim that real-world effects are unobservable.)*
- **Numerical scoring/ranking is a strawman.** It's a reasonable starting shape, but the real work is defining *outcomes* and evolving the algorithm against **long-term results and progress** (below), not first-take intuitions.

## Definitions & influence map

The single place each term is defined *and* its effect on ranking/outcomes made explicit.

| Term | Definition | How it influences ranking / outcomes | Bound |
|---|---|---|---|
| **Hard constraints** | schedule overlap, distance / travel willingness, blocks, adults-only, capacity | **Filter** — removes infeasible events/people entirely | The *only* hard gate |
| **Fit** | match between the member's comfort envelope + doors + interests and the event's shape (size, structure, activity, role) | The **base** ranking signal and the majority of the score; **works from onboarding with zero history** | Dominant by design |
| **Affinity — outgoing** | who this member tapped "want to see again" | Boosts co-suggestion with those people (their events, shared events) — mainly in *this member's own* feed | Capped; normalised per-member (see below) |
| **Affinity — mutual** | both tapped each other | Stronger co-suggestion; seeds crews | Capped |
| **Contributor rating** | backstage facets (reliability / positive participation / organising / trust-safety) | Gentle: weave reliable, positive contributors into groups; graduate organiser trust. **Not a feed gate.** Safety facet routes to admin, never to ranking | Capped; never dominates |
| **Crews** | 3–4 people repeatedly together with mutual affinity | Gentle boost to co-suggesting the cluster; supports continuity | Capped; **must not ossify** (newcomer injection) |
| **Avoidance (do-not-interact)** | a person the member named to avoid | **Soft de-weight** of co-placement; never hard-remove; information-symmetric | Soft only |
| **Didn't-click (negative affinity)** | conservatively inferred non-selection over time | Soft de-weight of co-suggestion; never shown | Soft only |
| **Newcomer status** | little/no history | Triggers **injection into well-fitting rooms** + exploration; benefit-of-the-doubt on rating | Guaranteed floor |
| **Exploration** | deliberate variation / novelty | A guaranteed share of recommendations are exploratory | Fixed floor |

## Strawman ranking (provisional)

```
score(member, event) = fit(member, event)                      // base, dominant
                       + Σ capped_nudges(affinity, crew, rating)
                       − capped_deweights(avoidance, didn't-click)
then blend the ranked list with an exploration + newcomer-injection sample.
```

The invariant that makes **#6 ("informs, never dominates") structural rather than a slogan:** fit + hard constraints + the exploration floor are, by construction, the majority of every outcome; **all soft nudges together are capped below that.** No binary outcome (a group's composition, a suggestion) is ever driven *solely* by a backstage signal. Earned thresholds that *are* meant to gate (facilitator role, organiser trust-graduation) are explicit, separate thresholds — not the feed ranker leaking into a yes/no.

## Exploration & inclusion floor (fit-aware) — #8

A guaranteed share of recommendations are exploratory, and **newcomers are injected** into others' feeds and groups regardless of their empty Layer 3. This is what actually delivers inclusion — and, incidentally, the noise that keeps placement effects from reading as clean signal.

**The crux (and the easy thing to get wrong):** injection means *into well-fitting rooms for that newcomer* — never scattering an anxious new member into a poorly-matched event, which is the exact bad first experience we most want to avoid. Inclusion is "a floor of exposure in rooms that suit you," not "random exposure." Fit gates *quality*; the floor guarantees *quantity of chances*.

## Influence normalisation — the charisma / wealth problem

A real, undesirable consequence of the strawman: more attractive, charismatic (and, unfairly, wealthier) members naturally accrue more "likes." We must ensure that does **not** convert into greater power over how *others* are recommended.

- **Being liked a lot never increases the weight of your own choices.** A member's outgoing affinity influences *their own* recommendations meaningfully, but *others'* recommendations only weakly and under a **per-member cap that does not grow with popularity.**
- **Incoming popularity never boosts contributor rating** (already D35 / open-risks #9) — reinforced here.
- The result: a charismatic connector shapes their *own* social life, not the network's. The people who accrue likes for reasons orthogonal to community-building don't get to steer how everyone else socialises.

This is the deep version of "positive ≠ popularity": popularity must confer neither *standing* (rating) nor *routing power* (influence over others' feeds).

## Avoidance as soft-de-weight only — #17

`do-not-interact` and `didn't-click` **only ever soft-de-weight** co-placement through the same noisy ranking; they never hard-remove and are information-symmetric. We accept that a determined observer can infer *something* from the real world (as with all affinity) — what we refuse to build is a hard, legible avoidance mechanism that turns into either a stalking vector or a visible snub.

## Success & progress (what we optimise and evolve toward)

Now designed in full in **`success-and-progress.md`** — the keystone this note depends on. In brief: success is **real-world connection and belonging, not engagement or attendance**; it's **distributional** (the least-served reached, not the average); it's measured as **indicators, not targets** (Goodhart); and the algorithm **evolves on long-term outcomes**, optimising the *floor*. Reduced need can itself be success (the graduation paradox), so retention is never an objective.

## Test scenarios (to evaluate against)

The algorithm is judged by how it behaves on scenarios, not by its internal elegance:

- **New vs. known** — frequency of recommending new people vs. familiar ones; is the balance healthy or does it silo?
- **Affinity influence** — does one person's taps visibly over-steer others?
- **Charisma concentration** — do a few popular members dominate routing? (should not — see normalisation)
- **Cold-start** — does a brand-new member get good, well-fitting first recommendations *and* real exposure?
- **Crew vs. newcomer** — do crews strengthen without ossifying / crowding out new people?
- **Avoidance** — does a do-not-interact relationship stay symmetric and non-legible?
- **Gaming attempts** — see the register below.

We'll expand these together; they're the real specification.

## Negative-outcome / gaming register

Systematically tracked (this is *the* challenge). Each pairs a risk with its mitigation:

| Scenario | Risk | Mitigation |
|---|---|---|
| Charisma/wealth influence concentration | Popular members steer the network | Per-member influence cap that doesn't grow with popularity |
| Tap-spam ("see again" on everyone) | Bias one's own event overlap; inflate reciprocity | Diminishing returns on outgoing affinity; caps; it mostly only affects *your own* feed anyway |
| Popularity feedback loop | Liked → recommended more → liked more | Fit-first base; exploration floor; popularity doesn't boost rating or routing |
| Crew ossification | Established crews crowd out newcomers | Newcomer injection floor; crew boost capped |
| Avoidance as covert exclusion | Naming people to shape a room | Soft de-weight only; symmetric; never hard-remove |
| Rating gaming | Behave to inflate standing | Rating is backstage, multi-faceted, decaying; consequential actions human-reviewed |
| Demographic proxy via event-type | Book-club-etc. as a demographic filter | Watch-item (`decisions.md`); event-level affinity + reactive detection |

## Decisions & open questions

- **Recommender shape:** fit-first base + bounded soft nudges + preserved exploration/injection floor; nothing gates except hard constraints and explicit earned thresholds.
- **Influence normalisation:** popularity confers neither standing nor routing power over others.
- Numerical scoring is a **strawman**; caps, the exploration fraction, and nudge weights need real data — v1 picks conservative defaults and **evolves on long-term results**.
- **Success / "progress" is undefined** and needs its own design before the algorithm can be meaningfully evaluated or evolved.
- The full scenario set and the gaming register are living — to be expanded together.
