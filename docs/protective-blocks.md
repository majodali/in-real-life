# Protective Blocks — Mechanism Design (v1)

The safety tier's mechanism, resolving open-risks #23. The principles were fixed in D50 (hard, instant, proof-free, silent, presence-shielding, above everything including the floor); this note designs how they hold on every surface. Shaped by repeated advocate feedback: stalking and domestic-abuse victims need real protection — legal instruments alone are not enough, and a victim's activity and whereabouts must never be disclosed to their abuser.

**This design is planned for advocate validation before build** — the open questions at the end are the agenda for that conversation.

## The rendered-world rule (the core mechanism)

> **For the blocked person, IRL renders a world in which the blocker does not exist.**

Not "hidden from this event" — *absent everywhere, always, consistently*: no name on any attendee list, no entry in any people step, no kudos target, no search result, and **counts adjusted to match** ("4 going," not "5 going with one name missing"). Consistency is what makes the shielding leak-proof on IRL's surfaces: a per-event hole is a signal; a person who is simply never there is indistinguishable from a person who left IRL. The blocked person is never notified and has nothing to appeal — the protective effect costs them almost nothing and reveals nothing.

The complementary half of the rule: **the blocked person's own experience is never conditionally altered.** Their feed, rankings, and event visibility are exactly what they would be in a world where the blocker had left — no event suppression keyed to the blocker's plans, so no negative-space differential exists to probe (the leak check that killed hard *avoidance* passes here because the invisibility is unconditional).

## Surface census

| Surface | Blocked person sees | Blocker sees |
|---|---|---|
| Attendee lists / "who's going" | No blocker; count adjusted | Ordinary view (or peace mode — below) |
| Debrief people step | Blocker never listed among attendees met | Ordinary; blocked person listable (her debrief is private) |
| Kudos targets (v-next) | Blocker absent | Blocked person absent as a target — no gesture channel across a block, either direction |
| Search / any name surface | Absent | Ordinary |
| Feed / suggestions | Unconditionally unaltered | Never actively placed with the blocked (below) |
| Crew surfaces | Any cluster containing both is never surfaced as a unit | Same |

## The blocker-side view: ordinary power only

The hard tension: a victim needs *awareness* (never unknowingly walk into a room with him), but blocker-side visibility is observational power a false "victim" could abuse. The v1 resolution:

> **A block grants the blocker no observational power beyond what any ordinary member already has.**

Attendee lists are already visible to members browsing an event; the blocker keeps exactly that — no more. **No proactive flags, no notifications, no aggregated "where is he" view in v1.** Awareness comes from the same browsing any member can do; the marginal power a false victim gains from blocking is therefore zero. (The active-placement filter does condition the blocker's *suggestions* on the blocked's confirmations — but it reveals nothing that opening the attendee list wouldn't already show, and removes rather than adds exposure.)

Within that bound, the blocker chooses at capture time how their **own** view renders the blocked:

- **Awareness mode (default).** The blocked appears in the blocker's view as to any member — she sees his name on a list before she confirms. Default because surprise is the danger; awareness beats peace when the stakes are physical.
- **Peace mode.** The blocked is erased from her view too — some victims need him gone from their screen more than they need advance notice. Chosen with its trade-off stated plainly: "you won't see when he's attending something."

Switchable at any time, privately.

## Active placement vs. browse

The block is a **hard constraint** (`matching.md` definitions table): the pair is infeasible for every *active* mechanism — co-suggestion, injection, group composition, crew surfacing. The floor is unaffected as a guarantee because hard constraints bound the feasible set the floor operates in.

**Browse and attendance rights stay intact (D10)** — both can see and attend any event. IRL controls what it shows and what it arranges; it cannot control where anyone goes, and the capture flow says so honestly (below).

## The blocked-organiser case

If the blocker RSVPs to an event *organised by* the person she blocked, presence-shielding cannot meaningfully hold — an organiser cannot run an event with a ghost on the roster, and physical presence reveals everything anyway. V1 rule: **informed choice.** Her RSVP flow states privately, "this event is organised by someone you've blocked"; if she confirms anyway, she appears on *that event's* roster to *that organiser* — scoped to the event, chosen with eyes open. Everywhere else the shielding holds.

## Block ≠ accusation (what makes proof-free defensible)

A block, by itself, has **no consequence for the blocked person beyond the rendered-world rule**: it does not feed their contributor rating, does not flag their conduct, does not count against them in any review. Proof-free protection is defensible precisely because it is non-punitive — otherwise blocking becomes a weapon and the proof-free property collapses under its own abuse potential.

Reporting is a **separate, optional act**: the capture flow offers it ("if something happened, you can tell us — or just talk to someone"), and only a report enters the trust/safety path (human-reviewed, due process, D35). A pattern of *reports* is a signal about the blocked; a pattern of *blocks* is, at most, an anomaly for the misuse watch.

## Signal layer

- The pair's affinity edges, co-suggestion nudges, and any crew-membership effects are **zeroed at the interpretation layer** the moment the block lands (capture ≠ use — raw history stays in the log, which also preserves evidence should a report follow).
- Consistent with D47's confirmation guard: no co-attendance, chance or engineered, ever rebuilds the pair's signal while a block stands.

## Capture & routing

Entry points, all low-friction:

- **The naming fork** (`user-model.md` → Boundaries): one flow, routed by need in plain words — *"Rather not cross paths?"* → do-not-interact (comfort, D49) · *"Need to not be seen by them, or feel unsafe?"* → block. No justification field, no proof, no disclosure required; an optional "want to tell us anything?" routes to the report/support path, never gates the block.
- **The debrief conduct door** (`debrief.md` → Safety surface) offers the block alongside reporting and care.
- **A standing safety/support page** — findable without having to remember where.

Capture-time honesty (the same commitment as D49's, held tighter): what the block does (IRL's surfaces and arrangements) and what it cannot do (the physical world, word of mouth). Support resources are offered here — gently, optionally.

## Lifecycle, data, environments

- Events: `UserBlockRecorded` / `UserBlockLifted` — among the most sensitive PII IRL holds; crypto-shredded, access-gated to need-to-know even within admin (Group 4).
- **No decay, no expiry, no review-to-retain.** Only the blocker lifts it. Safety signal never decays (D22's spirit: safety is not preference).
- **Blocks cross environments — the safety exception to D42.** Layer 3 and ratings stay env-local, but a protection must travel with the person; if the blocked party doesn't exist in the target environment, the block lies dormant and applies if they ever appear.
- Workshop/test: fully exercisable via the standard seams (D37); robot scenarios must include block coverage before build ships.

## Misuse watch

- **Naming-rate outliers** (one member blocking many) surface to human review — of *consequences and support*, never of the protective effect. The likeliest explanation for an outlier is a person in real trouble; review starts from care, not suspicion.
- The **false-victim** case is bounded by design: ordinary-power rule (no new observational capability), block ≠ accusation (no reputational harm), rendered-world cost to the blocked ≈ zero. What remains is monitored, not pre-emptively restricted.

## Accepted limits (stated, not solved)

- **The physical world.** He can go where he likes; she may be seen. IRL shields its surfaces, not the town.
- **Social leakage.** Mutual acquaintances talk; a shared crew noticing her "disappearance" may infer. Indistinguishable-from-leaving is the ceiling of what software can promise.
- **Tiny-event arithmetic.** At an event of three, an adjusted count plus heads in the room does the math. Disclosed at capture, not pretended away.

## Not a hypothesis

Block hardness and the rendered-world rule carry **no kill criteria** (D50). This mechanism evolves only through advocate-informed review and the governance process — evidence here is testimony and incident review, never A/B outcomes on people's safety.

## Open questions (the advocate agenda)

- **Awareness vs. peace as the default** — awareness-default is our read of "surprise is the danger"; validate with advocates.
- **Proactive flags/notifications** ("someone you've blocked has confirmed for an event you're going to") — real safety value vs. building a tracking convenience; excluded from v1, revisit with advocate guidance.
- **Tiny-event handling** — is disclosure enough, or does sub-threshold shielding need a different behaviour?
- **Support-resource integration** — which resources, per community; how presented without presuming.
- **Emergency escalation** — when a block interaction suggests imminent danger, what does IRL do beyond the app?
- **Legal review per community** before launch — duty-of-care exposure and evidence-preservation obligations (the log retains raw history; retention/handover policy needs counsel).
