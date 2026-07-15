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
| **Hard constraints** | schedule overlap, distance / travel willingness, **protective blocks (D50 — victim-initiated, immediate, override everything including the floor)**, adults-only, capacity | **Filter** — removes infeasible events/people entirely | The *only* hard gate |
| **Fit** | match between the member's comfort envelope + doors + interests and the event's shape (size, structure, activity, role) | The **base** ranking signal and the majority of the score; **works from onboarding with zero history** | Dominant by design |
| **Affinity — outgoing** | who this member tapped "want to see again" | Boosts co-suggestion with those people (their events, shared events) — in *this member's own* feed **only**; a one-sided tap never alters the tapped person's or any third party's ranking (cross-member effects require mutuality) | Capped; normalised per-member (see below) |
| **Affinity — mutual** | both tapped each other | Stronger co-suggestion; seeds crews — consumed **strength-weighted**, never boolean (see *Affinity edge strength*) | Capped; strength-weighted (D47) |
| **Contributor rating** | backstage facets (reliability / positive participation / organising / trust-safety) | Gentle: weave reliable, positive contributors into groups; graduate organiser trust. **Not a feed gate.** Safety facet routes to admin, never to ranking | Capped; never dominates |
| **Crews** | 3–4 people repeatedly together with mutual affinity | Gentle boost to co-suggesting the cluster; supports continuity | Capped; **must not ossify** (newcomer injection) |
| **Avoidance (do-not-interact)** | a person the member named to avoid | **Soft de-weight** of co-placement; never hard-remove; information-symmetric | Soft only; graduated by surface (D49) |
| **Didn't-click (negative affinity)** | conservatively inferred non-selection over time | Soft de-weight of co-suggestion; never shown | Soft only |
| **Newcomer / re-inclusion status** | little/no history — or a previously-active member gone quiet without evidence of connection (*probable left-behind*, D48) | Triggers **injection into well-fitting rooms** + exploration; benefit-of-the-doubt on rating | Guaranteed floor |
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

The floor's cohort is **newcomers and the re-entering**: a member classified *probable left-behind* after a group wind-down (D48, `success-and-progress.md` → *Reading graduation*) re-enters through the same injection — ordinary good matching, never win-back messaging, and never a surfaced inference.

## The supply side — matching allocates, it cannot create (#22, D51)

When no well-fitting room exists for a member, every ranker-side move is wrong: relaxing fit manufactures the bad first experience the floor exists to prevent, and deferring silently is floor failure. So the ranker holds the line — **never relax fit to fill the floor** — and the corrective lever lives outside it: the **supply loop** (`organizer-engagement.md`), a standing function at every scale, not a thin-calendar fallback. The link between the two is the **fit-gap read**: a continuous, aggregate measure of which envelope segments have scarce well-fitting rooms. Floor-debt (D49) is its acute per-member case; both route demand into the supply loop — surfaced de-identified to proven organisers, and as bounded start-something invitations (D14/D30) to the affected members themselves. Tracked as hypothesis **H7**.

## Influence normalisation — the charisma / wealth problem

A real, undesirable consequence of the strawman: more attractive, charismatic (and, unfairly, wealthier) members naturally accrue more "likes." We must ensure that does **not** convert into greater power over how *others* are recommended.

- **Being liked a lot never increases the weight of your own choices.** A member's outgoing affinity influences *their own* recommendations meaningfully, but *others'* recommendations only weakly and under a **per-member cap that does not grow with popularity.**
- **Incoming popularity never boosts contributor rating — resolved (open-risks #9).** Raw affinity-received is no longer a rating input; what feeds positive participation is the **welcomer signal** — generosity-normalized, newcomer-weighted taps that measure *welcome*, not magnetism (`hypotheses.md` H1–H3). A charismatic tap-magnet and a quiet welcomer now separate cleanly; raw counts stay captured but unused (capture ≠ use).
- The result: a charismatic connector shapes their *own* social life, not the network's. The people who accrue likes for reasons orthogonal to community-building don't get to steer how everyone else socialises.

This is the deep version of "positive ≠ popularity": popularity must confer neither *standing* (rating) nor *routing power* (influence over others' feeds).

## Affinity edge strength — mutuals are weighted, never boolean (#19, D47)

The scenario walkthroughs exposed the gap (open-risks #19): if mutual = a boolean "both tapped," then tapping everyone converts every tap *received* into the strongest signal the system has — manufactured mutuals, cheap crew seeds. The fix lives at the **interpretation layer**; capture stays raw and positive-only in the debrief (capture ≠ use).

- **Every consumer of an affinity edge consumes strength, not a boolean.** Each directed tap carries its tapper's **generosity weight** — the same shared transform as the welcomer signal (H2), including the small-N shrinkage prior — so a tap from someone who taps everyone weighs ≈ 0, and a tap from a selective tapper weighs high.
- **A mutual edge's initial strength is its weaker side** (combiner = min, tunable) — i.e. the *less selective* tapper's weight: a mutual is two claims, and the pair-level signal ("these two connected") is only as credible as the least credible tap. The one-sided component survives untouched — the selective tapper's own tap still boosts *their own* feed at its own weight; only the mutuality *amplification* is gated by the weaker side. A spammer's "mutuals" therefore carry ≈ 0 strength into co-suggestion and crew seeding; a genuine selective pair's carry full strength.
- **Behaviour confirms what taps can't.** Repeated *chosen* co-attendance after the mutual raises edge strength regardless of the initial weights — observed beats inferred (D7). "Chosen" means co-attendance **above the rate the local calendar would produce by chance** — on a thin calendar everyone lands at the same potluck, so confirmation is repetition beyond that baseline. This protects the genuinely enthusiastic frequent tapper: their real connections recover strength through actual shared showing-up. A spammer can't fake it without repeatedly attending with that person — which is just real repetition; any predatory version of it is a conduct/safety matter (D22), never a preference-signal problem.
- **Tap-derived strength decays faster than confirmed strength.** A tap is a moment's inference about a future desire; acted-on co-presence is that desire observed. So the two components carry different half-lives (both tunable): unconfirmed tap strength fades on the shorter one, co-attendance-confirmed strength on the longer — and continued co-attendance keeps refreshing it. D7's provenance-decay ordering, applied in time.
- **Confirmation is guarded** (walkthroughs F13): co-attendance is a symmetric fact but the *choice* behind it can be unilateral — a follower could strengthen an edge the other party no longer wants, and the co-suggestion boost would help them predict her events. So confirmation never overrides contrary signal: naming **do-not-interact zeroes the pair's affinity nudge outright** (a boost must never fight a de-weight), and **one-sided engagement caps confirmation gain** — if one member never re-taps and never marks the other as met, co-presence alone doesn't keep strengthening the edge. Persistent following is conduct/safety territory (D22, blocks), never something the signal layer launders into affinity.
- **Crew detection accumulates weighted strength over co-attendances**, not tap counts or boolean mutuals.
- All parameters (generosity transform, combiner, confirmation gain, crew thresholds) are named tunables per the versioned spec, **tunable to zero** — which restores raw mutuals. Tracked as hypothesis **H4** with kill criteria.

## Avoidance as soft-de-weight only — #17

`do-not-interact` and `didn't-click` **only ever soft-de-weight** co-placement through the same noisy ranking; they never hard-remove and are information-symmetric. We accept that a determined observer can infer *something* from the real world (as with all affinity) — what we refuse to build is a hard, legible avoidance mechanism that turns into either a stalking vector or a visible snub.

Soft-only has a member-facing consequence we owe honesty about **at capture time**: naming someone reduces co-placement, it does not — and cannot — prevent co-attendance. The wording that sets that expectation is Group-1 UX work; the commitment that it exists is made here.

### Precedence when avoidance meets the floor (#21, D49)

**Scope: the comfort tier only.** Everything in this section is about `do-not-interact` — "I'd rather not share a table with him." It does **not** apply to **blocks** (D50; mechanism in `protective-blocks.md`, D52): a protective block is a **hard constraint** (see the definitions table — the only hard gate), and hard constraints sit *above* the floor by construction: the floor injects within the feasible set, so a blocked pairing is never a candidate at all. Someone whose need is safety — stalking, abuse, fear — belongs in the block tier, immediately and without proof; the comfort tier's softness is defensible *only because* that hard tier exists and is frictionless to reach.

The walkthroughs exposed the collision (open-risks #21): the inclusion floor is a *guarantee*, comfort-tier avoidance a *de-weight* — which wins when the newcomer being injected is someone another attendee named? The resolution is **graduated, never a hard override**: avoidance weight scales with how actively IRL is engineering the co-presence.

| Surface | What IRL is doing | Avoidance weight |
|---|---|---|
| **Feed suggestion** | listing an event both could see and attend anyway (D10) | Soft de-weight; on a thin calendar the floor wins |
| **Injection into open rooms** | choosing *which* well-fitting room | Steers room choice whenever alternatives exist (so collisions are naturally rare); the floor wins when only one room does |
| **Intimate composition** (weaving a 3–4 person group) | actively engineering close contact | Maximum de-weight — in practice the pair is never composed together — but stated as the strongest de-weight, **never an advertised guarantee**, so no clean negative-space signal exists to probe |

Two supporting rules:

- **The floor is windowed.** Injection guarantees chances *over a period*, not per event — deferring one week to route around a collision is soft cost, not floor failure.
- **Sustained collision accrues floor-debt.** If the avoided person is omnipresent (say, an organiser at half the events), the named member's deferred injections accumulate visibly and route to human review; the honest fix is usually more rooms — the thin-calendar lever (open-risks #22).

Why not the simpler "avoidance always wins": a hard override would re-open #17's negative-space leak (a guarantee makes your own feed a reliable detector of the other's plans), convert a comfort feature into a free block (hard separation is the block tier's job — Group 4, where reporting and due process live), and charge the cost to the *named* person's inclusion — someone who did nothing and never knows. Tracked as hypothesis **H6**.

## The ranking spec is explicit, versioned, and hypothesis-tuned

**v1 is implemented: `matching-spec.md` is the live spec (D55)** — including
the register of what v1 deliberately omits and where each omission lands.

How recommendations are ranked is never implicit or emergent-from-code:

- **Every input, transformation, weight, and cap is a named tunable** with a documented default — configuration, not constants. Tunable includes tunable to zero.
- **The spec is versioned**; a change to any input or weight flows through the hypothesis register (`hypotheses.md` — hypothesis, evidence plan, kill criteria) and, when consequential, the decision register.
- **Raw signals are always captured even when unused** (capture ≠ use) — so future refinements are never foreclosed by an earlier simplification.
- **Continuous tuning aims at reducing anti-pattern impact** — the gaming register below is not a one-time checklist but the standing agenda: each entry names its detection signal, and tuning priorities follow the anti-patterns we actually observe.

## Success & progress (what we optimise and evolve toward)

Now designed in full in **`success-and-progress.md`** — the keystone this note depends on. In brief: success is **real-world connection and belonging, not engagement or attendance**; it's **distributional** (the least-served reached, not the average); it's measured as **indicators, not targets** (Goodhart); and the algorithm **evolves on long-term outcomes**, optimising the *floor*. Reduced need can itself be success (the graduation paradox), so retention is never an objective.

## Test scenarios (to evaluate against)

The algorithm is judged by how it behaves on scenarios, not by its internal elegance:

- **New vs. known** — frequency of recommending new people vs. familiar ones; is the balance healthy or does it silo?
- **Affinity influence** — does one person's taps visibly over-steer others?
- **Charisma concentration** — do a few popular members dominate routing? (should not — see normalisation)
- **Tap-magnet vs. quiet welcomer** — a charismatic member who accrues broad taps vs. a quiet one whose taps come from newcomers and rare tappers: does the welcomer signal separate them, and does composition follow the welcomer?
- **Cold-start** — does a brand-new member get good, well-fitting first recommendations *and* real exposure?
- **Crew vs. newcomer** — do crews strengthen without ossifying / crowding out new people?
- **Avoidance** — does a do-not-interact relationship stay symmetric and non-legible?
- **Gaming attempts** — see the register below.

We'll expand these together; they're the real specification. First full pass: `scenario-walkthroughs.md` — each scenario traced through the design as written, with verdicts and a findings register.

## Negative-outcome / gaming register

Systematically tracked (this is *the* challenge). Each pairs a risk with its **detection signal** (how we'd notice it happening — aggregate, de-identified reads per `user-model.md` → Model evolution) and its mitigation:

| Scenario | Risk | Detection signal | Mitigation |
|---|---|---|---|
| Charisma/wealth influence concentration | Popular members steer the network | Any single member's share of nudge-influence over others' feeds (must stay ≤ cap); taps-received concentrating on a few members without outcome lift in their rooms (H1) | Per-member influence cap that doesn't grow with popularity; rating uses the **welcomer signal**, never raw tap-counts (H1–H3) |
| Tap-spam ("see again" on everyone) | Bias one's own event overlap; inflate reciprocity; **manufacture mutual edges** (open-risks #19) | Tapper tap-rate outliers (taps ≈ people met, sustained) | Generosity normalization self-discounts a spammer's taps toward zero; caps; **edge strength** (D47/H4) — a spammer's "mutuals" carry ≈ 0 weight into co-suggestion and crew seeding, recoverable only through real repeated co-attendance |
| Popularity feedback loop | Liked → recommended more → liked more | Correlation between a member's taps-received and their feed-impression share trending upward | Fit-first base; exploration floor; popularity doesn't boost rating or routing |
| Feed siloing (new vs. known) | Established members' feeds narrow to already-familiar people | Breadth-vs-depth read (`success-and-progress.md`) trending depth-only for established members | Nudges capped below fit; exploration floor |
| Crew ossification | Established crews crowd out newcomers | Newcomer share of a recurring event's attendance trending down; injection placements not converting to repeat attendance | Newcomer injection floor; crew boost capped |
| Avoidance as covert exclusion | Naming people to shape a room | Do-not-interact naming-rate outliers (one member naming many) | Soft de-weight only; symmetric; never hard-remove; graduated precedence keeps the named person's floor intact (D49) |
| Rating gaming | Behave to inflate standing | Facet climbs decoupled from the raw signals beneath them (surfaced to human review) | Rating is backstage, multi-faceted, decaying; consequential actions human-reviewed |
| Demographic proxy via event-type | Book-club-etc. as a demographic filter | Not directly detectable — IRL holds no user demographics, by design; reactive only (debrief/reflection narratives, listing-language review) | Watch-item (`decisions.md`); event-level affinity + reactive detection |

## Decisions & open questions

- **Recommender shape:** fit-first base + bounded soft nudges + preserved exploration/injection floor; nothing gates except hard constraints and explicit earned thresholds.
- **Influence normalisation:** popularity confers neither standing nor routing power over others.
- Numerical scoring is a **strawman**; caps, the exploration fraction, and nudge weights need real data — v1 picks conservative defaults and **evolves on long-term results**.
- **Tier-2 "known circle" (noted, deferred).** A looser construct than a crew: a group who all know each other without tight mutual affinity — the neighbours on a street, an apartment block. Within such a circle anonymity isn't needed or valued, so disclosure rules (demand surfacing, co-suggestion legibility) could key to *circles* instead of one global setting — potentially a better frame for anonymity dynamics across small-N regimes (`organizer-engagement.md` → Small-N regimes). Deliberately not designed now: membership definition is the hard part (inferring it is creepy — the categorization watch-item; self-declaring it is a new consent surface), a named group construct invites the messaging-wedge pressure (D45 watch-item), and any circle-level anonymity carve-out must stay per-member and revocable — **a protective block (D50) overrides any circle absolutely and silently** (someone's abuser can live on their street).
- **Success / "progress" is undefined** and needs its own design before the algorithm can be meaningfully evaluated or evolved.
- The full scenario set and the gaming register are living — to be expanded together.
