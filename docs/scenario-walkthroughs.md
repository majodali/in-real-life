# Scenario Walkthroughs — Matching & Success

`matching.md` says the algorithm "is judged by how it behaves on scenarios, not by its internal elegance" and calls the scenario set *the real specification*. This note runs those scenarios — plus the success-side cases `success-and-progress.md` implies — concretely through the design as written (D38–D41, H1–H3), the way `debrief.md` walks its own flows.

Each walkthrough: **setup** (concrete members and events) → **trace** (what the designed mechanisms do, step by step) → **verdict**. Verdicts:

- **holds** — the design produces the intended behaviour by construction.
- **holds — tuning open** — the shape is right; the outcome depends on parameter values we've already said need real data.
- **gap** — the walkthrough exposes something unspecified or inconsistent. Gaps are collected in the findings register at the end; the register has since been **triaged** — simple fixes applied to the notes, substantive gaps promoted to `open-risks.md` #19–22.

## Cast (reused across walkthroughs)

| Member | Situation |
|---|---|
| **Nadia** | brand-new; envelope small / activity-anchored / needs-a-known-face; empty Layer 3 |
| **Marcus** | charismatic regular; organises big socials; accrues many "see again" taps |
| **Ruth** | quiet regular; taps rarely; the taps *she receives* come from newcomers at their first events |
| **Priya** | established member (the pottery walkthrough in `debrief.md`); part of the Thursday crew |
| **The Thursday crew** | Priya + 3 others; standing mutual affinity; attend trivia weekly |
| **Dana & Rob** | ex-spouses; Dana has named Rob do-not-interact |
| **Sam** | taps "want to see again" on everyone at every event |

---

## 1 · New vs. known

**Setup.** Priya has months of history: mutual affinity with her crew, a dozen tapped people, favourite recurring events. Question: does her feed silo into people she already knows?

**Trace.** Fit stays the dominant base regardless of history (D38). Her affinity and crew nudges each boost familiar co-suggestion, but each is capped below fit, and the exploration floor guarantees a fixed share of her recommendations are exploratory — new event shapes, new people — no matter how strong her Layer 3 gets. Newcomer injection additionally places people like Nadia into her well-fitting rooms whether or not any nudge points there.

**Verdict: holds — tuning open.** The structure cannot fully silo (floor is guaranteed, nudges are capped), but *how healthy* the balance feels is entirely in the exploration fraction and nudge caps — conservative v1 defaults, evolved on outcomes. The breadth-vs-depth proxy in `success-and-progress.md` is the natural detection signal; it isn't yet named as such in the gaming/anti-pattern register (→ **F1**).

## 2 · Affinity influence — does one person's taps steer others?

**Setup.** Priya taps "see again: Ruth." What changes, and for whom?

**Trace.** Priya's own feed: co-suggestion with Ruth boosted (capped). Ruth's feed: nothing — a one-sided tap is backstage and must not be legible to Ruth (D21). Other members' feeds: Priya's outgoing taps influence them "only weakly and under a per-member cap that does not grow with popularity."

**Verdict: holds, with one underspecification.** The definitions table says outgoing affinity acts "mainly in *this member's own* feed" — but the non-own-feed pathway is never named. If Priya's one-sided tap influences *any* third party's feed (or Ruth's, even indirectly through group composition), that pathway needs to be explicit, because it's exactly where legibility and over-steer would creep in; if there is no such pathway short of mutuality, "mainly" should be deleted (→ **F2**).

## 3 · Charisma concentration

**Setup.** Marcus receives 40 taps in a season. Do his preferences and events start steering the community?

**Trace, by channel.**
- *Rating:* raw affinity-received is not a rating input (D40); Marcus's 40 taps do nothing for his contributor rating unless they also carry welcomer weight (his mostly don't — they come from generous tappers at big socials).
- *Routing power:* his own outgoing taps affect others only under the per-member cap, which does not grow with his popularity. Being liked never increases the weight of his choices.
- *Feedback loop:* liked → recommended more → liked more is damped by fit-first base + exploration floor.

**Verdict: holds** for standing and routing power — this is the scenario the influence-normalisation section was built for, and the mechanisms answer it directly. One residual worth watching: 40 tappers each legitimately boosting Marcus-events *in their own feeds* still concentrates aggregate demand on his events. No individual cap addresses that (it's 40 individually-sane choices), and it's arguably fine — but where his events have finite capacity, concentration interacts with composition and the newcomer floor in ways nothing yet specifies (→ **F3**).

## 4 · Tap-magnet vs. quiet welcomer

**Setup.** Marcus: 40 taps, mostly from frequent tappers at large events. Ruth: 6 taps — but from first-timers and rare tappers, at those people's first or second events.

**Trace.** Welcomer signal (H2): each tap weighted inversely to the tapper's overall tap rate, newcomer taps weighted highest. Marcus's 40 discount toward little; Ruth's 6 weigh heavily. Positive-participation facet follows Ruth; composition (H3) weaves Ruth into newcomers' early rooms; Nadia's first event gets a Ruth, not (by rating, anyway) a Marcus. The two members separate cleanly, which is precisely what D40 promised.

**Verdict: holds — tuning open**, with one mechanical gap: **generosity normalisation is unstable at small N.** A tapper's "overall tap rate" after one event is one data point; inverse weighting at N=1–2 swings wildly, and the newcomer multiplier *compounds* it — the highest-weight taps (newcomers') are exactly the ones with the least-estimable generosity. H2's parameters need a shrinkage prior / minimum-history floor before the weight ramps in (→ **F4**).

## 5 · Cold-start

**Setup.** Nadia finishes onboarding: small / activity-anchored / needs-a-known-face, zero Layer 3, neutral rating.

**Trace.** Fit works from onboarding alone (D38) — her feed leads with small activity-anchored events; her barrier lowers friction (suggest a known face — none yet, so a welcomer per H3). Injection puts her into *others'* feeds and rooms despite her empty history; benefit-of-the-doubt means no rating drag. Her first recommendation quality is exactly as good as the Layer-2 extraction, which is the point of fit-first.

**Verdict: holds — with a supply-side gap.** "Injection into well-fitting rooms" assumes well-fitting rooms *exist*. In a thin week — no small activity-anchored events on the calendar — the floor is unsatisfiable, and the design names no fallback: relax fit (risks the bad first experience the crux forbids), wait (the floor silently fails), or route the demand somewhere. The real corrective lever is event *creation* — surfacing unmet envelope demand to organisers / propose-your-own — which lives outside the ranker and is currently unlinked to it (→ **F5**).

## 6 · Crew vs. newcomer

**Setup.** The Thursday crew attends trivia weekly, mutual affinity dense and strengthening. Nadia's envelope fits trivia.

**Trace.** Crew boost is capped, so trivia doesn't become crew-only by ranking; the newcomer floor injects Nadia regardless of the crew's Layer-3 gravity; welcomer-informed composition (H3) can seat a Ruth alongside. The crew strengthens (continuity is a design goal, D33's repetition engine) without mechanically excluding.

**Verdict: holds — tuning open.** Ossification is a cap-value question, and the register lists the mitigation. But `matching.md` promises that each gaming-register entry "names its detection signal" — and the register table has no detection-signal column at all; nothing operationalises *noticing* ossification (e.g. newcomer share per recurring event trending down). That's an internal inconsistency in the note (→ **F1**).

## 7 · Avoidance

**Setup.** Dana names Rob do-not-interact.

**Trace.** Neither loses visibility of anything (D10, D11); co-placement is soft-de-weighted through the same noisy ranking, symmetrically; neither can observe the other through the feature (no "Rob is hidden" states, no differential legible enough to read attendance from). A determined observer can still learn things from the physical world; the design explicitly accepts that and refuses only to *build* the legible mechanism. In a small community the de-weight will sometimes lose to fit + a thin calendar, and they'll co-attend — accepted, soft-only means exactly that.

**Verdict: holds**, with two loose ends. (a) **Nudge-stack priority:** the injection floor is a *guarantee* and avoidance a *soft de-weight* — when Rob is the newcomer being injected into a well-fitting room Dana is in, which wins? Unspecified for all floor-vs-de-weight collisions (→ **F6**). (b) **Expectation-setting:** Dana may reasonably believe naming Rob keeps him away; soft-only means it doesn't, and nothing yet owns telling her so at capture time — a legibility (D8 "backstage but legible") wording task, not a mechanism change (→ **F7**).

## 8 · Gaming: tap-spam (from the register)

**Setup.** Sam taps everyone at every event.

**Trace, by channel.**
- *Rating:* generosity normalisation discounts each of Sam's taps toward zero — as a *tapper* he loses signal-weight, harmlessly.
- *Own feed:* his boosts point everywhere at once, i.e. nowhere; self-defeating.
- *Mutuality:* here it bites. Mutual = both tapped, and Sam has tapped everyone — so **every tap anyone gives Sam instantly becomes mutual.** Mutual affinity is "the strongest signal the system ever gets" (`user-model.md`), drives stronger co-suggestion, and **seeds crews**. Generosity normalisation is specified at the *rating* layer (the welcomer signal) — nothing says the mutual-affinity edge consumed by co-suggestion and crew detection is normalised the same way.

**Verdict: gap.** Sam cheaply manufactures the system's strongest edge type. The fix direction is consistent with the existing design (apply tapper-generosity weighting at the interpretation layer wherever affinity edges are *consumed*, not only in rating — capture ≠ use already permits this), but it is currently unspecified (→ **F8**).

---

## Success-side walkthroughs (`success-and-progress.md`)

## 9 · Graduation vs. genuine disengagement

**Setup.** The Thursday crew stops co-attending through IRL. Three of them now meet on their own — textbook graduation. The fourth, Priya, wasn't invited; she's stopped attending anything.

**Trace.** The design says to read reduced IRL-mediated activity among people who clearly connected as *probable graduation*, never as churn to win back. Applied at crew granularity, that reads all four members as a success story — including Priya, who is now exactly the least-served member the distributional stance exists for, invisible inside a "graduated" group.

**Verdict: gap.** The graduation read must be **per-member, not per-group**: the signal that separates the cases is already captured (were Priya's affinity edges mutual? does her *individual* trajectory show the markers, or did they stop mid-ladder?), plus the gentle self-report channel. The doc's open question ("without mis-reading genuine disengagement") is real; the concrete failure mode is the member a graduating group left behind (→ **F9**).

## 10 · Optimise the floor — who is the floor?

**Setup.** Aggregate newcomer second-event rate looks healthy. Someone asks: is it healthy *for the shy*?

**Trace.** "Optimise the floor, not the mean" needs least-served cohorts you can actually compute. Newcomer status is clean (little/no history — already a system fact). "The shy / the isolated" can only come from envelope + barrier data (small-group comfort, needs-a-known-face, nerves as no-show reason) — legitimate, situational, non-demographic. But a standing "shy cohort" used in evaluation is quiet categorisation of exactly the kind the creeping-categorization watch-item tracks: fine as a tool, dangerous as a verdict.

**Verdict: holds — with a definition owed.** The distributional objective needs named, computable cohort definitions (per-envelope-segment outcome reads, de-identified, aggregate-only per `user-model.md` → Model evolution), and the watch-item explicitly extended to cover evaluation cohorts (→ **F10**).

## 11 · Goodhart — an indicator becomes a target

**Setup.** H3 makes newcomer-second-event-rate the headline read on welcomer composition. Months pass; it quietly becomes *the* number — tuning pushes reminder copy, welcomer density, event suggestions, all toward it. The number rises; are newcomers better off, or are we force-producing return visits?

**Trace.** The designed defences: indicators-not-targets, human review of the evolution loop, triangulate with self-report, rotate indicators, watch for force-production. All of these are *procedural* — they live in the governance cadence (`decisions.md` → Governance) which is deliberately not yet designed.

**Verdict: holds on paper — dependency exposed.** Until governance exists, nothing operationally prevents indicator-fixation beyond intent. The walkthrough sharpens the requirement: governance design should include indicator-rotation cadence and a standing "how would this number be force-produced?" review — the register already gestures at both (→ **F11**).

## 12 · Declining measurement

**Setup.** IRL gently asks Nadia, post-debrief, "did you meet someone worth seeing again?" — she skips it. Later she's offered the optional wellbeing check-in and declines.

**Trace.** Measurement is consented, opt-in, easy to decline. But what does the system *record* about the decline? A skipped self-report is behaviourally informative (like a lapsed debrief — "mild, weak signal"), and the temptation is to read declines as disengagement or low wellbeing. That converts the consent mechanism itself into surveillance — the exact move `safety ≠ signal` (D22) forbids in its own domain.

**Verdict: gap (small, cheap to close).** State the rule symmetrically to D22: **declining measurement is never signal** — not into the user model, not into success reads, not into cohort stats beyond response-rate accounting (→ **F12**).

---

## Findings register — triaged

All twelve findings triaged (2026-07-07): the substantive ones promoted into `open-risks.md` (#19–22), the simple ones fixed directly in the notes, two absorbed as watch-item / open-question updates. Severity: how much the design's own promises depend on closing it.

| # | Finding | Type | Severity | Outcome |
|---|---|---|---|---|
| F8 | Tap-spam manufactures mutual edges: generosity normalisation exists only at the rating layer; co-suggestion and crew seeding consume raw mutuals | design gap | **high** | **promoted → open-risks #19; resolved** — D47/H4: edges consumed strength-weighted, co-attendance-confirmable |
| F9 | Graduation must be read per-member, not per-group — the member a graduating crew leaves behind is the least-served, masked by a group-level success read | design gap | **high** | **promoted → open-risks #20; resolved** — D48/H5: per-member read; left-behind joins the inclusion floor |
| F6 | Nudge-stack priority unspecified: guaranteed floors (newcomer injection, exploration) vs. soft de-weights (avoidance, didn't-click) — which wins on collision | underspecified | medium | **promoted → open-risks #21; resolved** — D49 graduated precedence (comfort tier) + D50 protective blocks hard above the floor; block mechanism opened as #23 |
| F5 | Injection floor is unsatisfiable when no well-fitting rooms exist; no fallback defined, and the real lever (event creation / organiser demand signal) is unlinked to the ranker | design gap | medium | **promoted → open-risks #22; resolved** — D51/H7: the supply loop as a standing function; fit-gap read links ranker to event creation |
| F4 | Welcomer signal unstable at small N: tapper generosity is inestimable exactly where the newcomer multiplier weights it highest | hypothesis refinement | medium | **fixed** — H2 gains named tunables: generosity shrinkage prior + minimum-history floor (`hypotheses.md`) |
| F1 | Gaming register promised detection signals but had no detection-signal column | internal inconsistency | medium | **fixed** — detection-signal column added to the register, plus a feed-siloing row (`matching.md`) |
| F11 | Goodhart defences are procedural and depend wholly on the undefined governance cadence | dependency (known) | medium | **fixed** — indicator rotation + force-production review named as required governance scope (`decisions.md` → Governance) |
| F12 | Declining self-report/measurement must be declared non-signal, symmetric to safety ≠ signal (D22) | policy gap | low | **fixed** — rule stated in `success-and-progress.md`; recorded as **D46** |
| F2 | One-sided affinity "mainly in this member's own feed" — the non-own-feed pathway unnamed | wording/spec | low | **fixed** — clarified to own-feed **only**; cross-member effects require mutuality (`matching.md`) |
| F3 | Aggregate demand concentration on a popular member's events via many individually-capped own-feed nudges | watch-item candidate | low | **watch-item added** (`decisions.md` → Watch-items) |
| F7 | Do-not-interact expectation-setting: soft-only means co-attendance still happens; capture-time wording owed | UX/copy | low | **fixed** — commitment stated in `matching.md` → Avoidance; the copy itself is Group-1 UX work |
| F10 | "Optimise the floor" needs computable least-served cohorts; envelope-derived cohorts brush the creeping-categorization watch-item | definition owed | low | **fixed** — open question expanded with cohort constraints (`success-and-progress.md`) |

---

# Second pass — 2026-07-10, after D46–D51

Re-run of all twelve scenarios against the design with the triage fixes and D46–D51 in place, plus **three new walkthroughs probing the machinery those decisions added** — new mechanisms deserve the same adversarial treatment that exposed the original gaps. Two new findings (F13, F14), both fixed during this pass.

## Original scenarios, re-traced

| # | Scenario | First pass | Second pass |
|---|---|---|---|
| 1 | New vs. known | holds — tuning open | **holds — tuning open**; feed-siloing now has a named detection signal in the gaming register |
| 2 | Affinity influence | holds, underspecified | **holds** — one-sided taps are own-feed only; cross-member effects require mutuality, now strength-weighted (D47) |
| 3 | Charisma concentration | holds, residual | **holds** — the aggregate-attention residual is a tracked watch-item |
| 4 | Tap-magnet vs. welcomer | holds — tuning open | **holds — tuning open**; small-N shrinkage prior + minimum-history floor are named H2 tunables |
| 5 | Cold-start | holds — supply gap | **holds** — a thin calendar now routes demand into the supply loop (D51) instead of silently failing; the floor is windowed; H7 carries the burden of proof |
| 6 | Crew vs. newcomer | holds — tuning open | **holds — tuning open**; ossification has a detection signal, and crew seeding now accumulates *weighted* strength (harder to game) |
| 7 | Avoidance | holds, two loose ends | **holds** — precedence graduated (D49); the tier line redrawn by need with the hard block tier above it (D50); capture-time honesty committed |
| 8 | Tap-spam | **gap** | **holds** — edge strength (D47): Sam's "mutuals" carry ≈ 0 weight; crew seeds require weighted accumulation; recovery only through real, guarded co-attendance |
| 9 | Graduation vs. disengagement | **gap** | **holds** — per-member read (D48); Priya classifies *probable left-behind* on her own signal and re-enters via the inclusion floor; H5 carries the burden of proof |
| 10 | Optimise the floor | holds — definition owed | **holds — definition owed**; cohort constraints recorded, computable definitions still future work |
| 11 | Goodhart | holds on paper | **holds on paper** — indicator rotation + force-production review are now named governance scope; the cadence itself remains the open dependency |
| 12 | Declining measurement | **gap** | **holds** — D46 |

## New walkthroughs (probing D47–D51)

### 13 · Protective block (D50)

**Setup.** Sana blocks a former partner — proof-free, instant, silent.

**Trace.** The pairing leaves the feasible set entirely: never co-suggested, co-injected, or co-composed; the floor is irrelevant because hard constraints bound it by construction. Presence-shielding: Sana never appears to him on any surface. The leak check that killed hard *avoidance* passes here: his event visibility is never conditionally altered, so his feed carries no negative-space signal about her plans — unconditional invisibility destroys the differential rather than encoding it.

**Verdict: holds at principle level.** The mechanism is the deliberately open item (#23): attendee counts vs. heads in the room, what Sana may see of him, contested blocks, capture-time routing.

### 14 · The follower (probing D47's confirmation rule)

**Setup.** Early on, Priya taps Sam once — a weak mutual forms (Sam taps everyone). Sam then attends everything Priya attends.

**Trace, as first drafted.** Co-attendance above the calendar's chance rate "confirms" the edge and raises its strength — but the *choice* here is unilateral. A follower could strengthen an edge the other party no longer wants, and the resulting co-suggestion boost would help him predict her events: the signal layer laundering pursuit into affinity.

**Finding F13 — fixed this pass.** Confirmation is now guarded: do-not-interact zeroes the pair's affinity nudge outright (a boost never fights a de-weight), and one-sided engagement — she never re-taps, never marks him met — caps confirmation gain. Persistent following is conduct/safety territory (D22, blocks), never preference signal. **Verdict: holds after fix.**

### 15 · Supply-loop privacy (probing D51)

**Setup.** A 40-member community. Demand surfacing tells organisers: "several members are looking for small, quiet, weekday-morning things."

**Trace.** In a community that size, a tight segment description plus local knowledge ("who's been saying they want quieter mornings?") can de-anonymise the "several members" — aggregate in form, identifying in fact. Invitation pressure and quality-glut were already covered by H7's kill criteria; this wasn't.

**Finding F14 — fixed this pass.** Demand surfacing now requires a **minimum-cohort threshold** (tunable) before any segment is shown to organisers; below it, sensing stays internal and surfaces nothing. **Verdict: holds after fix.**

## Second-pass findings

| # | Finding | Outcome |
|---|---|---|
| F13 | D47's co-attendance confirmation exploitable by a one-sided follower; do-not-interact vs. affinity-boost conflict unspecified | **fixed** — confirmation guard: do-not-interact zeroes the pair nudge; one-sided engagement caps gain (`matching.md`, D47, H4) |
| F14 | D51's aggregate demand surfacing can de-anonymise members in a small community | **fixed** — minimum-cohort threshold before surfacing (`organizer-engagement.md`, D51, H7) |

---

# Third pass — 2026-07-10, after D52 (the protective-block mechanism)

### 16 · Probing the block mechanism (`protective-blocks.md`)

**Setup.** Sana blocks Marco. Separately, Vera — acting in bad faith — blocks Tom purely to keep tabs on him.

**Leak check: rendered-world consistency.** Marco's IRL shows no Sana anywhere — lists, people steps, search — with counts adjusted to match, so there is no per-event hole to read; her absence is indistinguishable from her having left IRL. His own feed is unconditionally unaltered, so no negative-space differential encodes her plans. *Residual:* at an event of three, an adjusted count plus heads in the room does the math — accepted and disclosed at capture, not pretended away.

**Leak check: the false victim.** Vera gains nothing she didn't have: awareness mode is exactly ordinary member browsing (attendee lists were always visible), there are no proactive flags or aggregated views in v1, and the active-placement filter only *removes* co-suggestions — it reveals nothing an open attendee list wouldn't. Block ≠ accusation means Tom's rating and standing are untouched, so the block can't be used to harm him either. The weaponization surface is bounded to ≈ zero by construction; naming-rate outliers go to human review that starts from care.

**Leak check: inferring the block exists.** Marco might notice Sana "vanished." Software's ceiling is indistinguishable-from-leaving; a shared crew's real-world chatter can still leak — accepted and stated in the note's limits section.

**Edge: the blocked organiser.** Sana RSVPs to an event Marco organises: her flow tells her privately, and confirming puts her on that one event's roster — informed choice, scoped to the event, because an organiser can't run an event with a ghost attendee and physical presence reveals everything anyway.

**Verdict: holds.** No new findings; two residuals (tiny-event arithmetic, social leakage) accepted and disclosed rather than papered over. The open questions are deliberately parked for advocate validation before build.

## What this note is and isn't

These walkthroughs test the design *as written* against its own scenario specification. After three passes, **all scenarios read `holds`** and the open-risks register is fully closed; what remains is the tuning/validation burden carried by hypotheses H1–H7 and the advocate validation of `protective-blocks.md` before it's built. The scenario set remains living — new mechanisms get walked through adversarially when they land (passes 13–16 exist because D47–D52 did), and everything gets re-run when caps, floors, and the welcomer parameters take real values.
