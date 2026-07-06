# Contributor Rating — Design

A private, backstage read on how **reliable and positive a contributor** a member is, built from observed behaviour and used to compose groups well, graduate organiser trust, enforce policy, and surface safety patterns. It is **never a visible score, never a leaderboard, and never the thing that decides a person's fate.**

It's become a shared dependency: organiser trust-graduation (`organizer-engagement.md`), policy enforcement (`event-policy.md`), group composition and crews (Group 3), and the debrief's people/safety signals (`debrief.md`) all lean on it. Mostly it's a **projection over signals we already capture**, plus a set of careful rules about how it's used.

## Principles

- **Backstage, not a score.** No number, rank, badge, or leaderboard shown to anyone. Gamifying trust would poison exactly the intrinsic, low-status spirit IRL is for.
- **Informs, never dominates.** It nudges composition and graduates trust; it is *never* the sole reason someone is included, excluded, or restricted (the watch-item: categorisation must not dominate outcomes).
- **Benefit of the doubt / cold start.** Newcomers default to trusted-enough; **absence of history never penalises.** Protecting the shy and the new is the whole point — they must not be gated behind a track record they haven't had a chance to build.
- **Observed and decaying.** Built from behaviour, recent weighted, old decays, every value carrying a `sourceRef` — same provenance discipline as the user model (`user-model.md`).
- **Positive ≠ popular.** "Positive contribution" must not collapse into "well-liked," or it would compound the liking-gap and push out the shy. Weight *reliability* and *absence of concerns* over *affinity received*.
- **Safety is special.** Conduct signals are higher-stakes, human-reviewed, and handled with due process — not just a lower "rating."
- **No secret punishment.** The rating is invisible, but a *consequential action* taken partly because of it (a policy warning, a restriction) is always communicated with a reason and a path to respond. Invisible signal, visible consequences.
- **Private PII.** A backstage evaluation of a person; crypto-shredded, under the same privacy commitments as everything else.

## Facets (multi-dimensional, not one number)

Kept distinct because different consumers need different things — mashing them into a single "trust score" would be both reductive and gameable:

| Facet | What it reads | Fed by | Used by |
|---|---|---|---|
| **Reliability** | Confirms-then-shows vs. no-shows / late cancels | attendance (`interaction` events) | composition; organiser expectations |
| **Positive participation** | A good person to have in the room — contributes, kind, others at ease | reliability + absence of concerns + the **welcomer signal** (generosity-normalized, newcomer-weighted taps — H1–H3) | composition, crews |
| **Organising quality** | Did their events go well | organiser debrief + aggregated attendee structural feedback + policy compliance | organiser trust-graduation |
| **Trust / safety flag** | Conduct concerns, policy violations | debrief conduct path; policy feedback | safety escalation; enforcement |

## Inputs (mostly already captured)

- **Attendance / no-show** → reliability (`interaction`).
- **Debrief conduct concerns** → trust/safety flag (`debrief.md` → conduct affordance).
- **Policy feedback** (not-as-described / high-pressure) → organising quality + trust (`debrief.md` → Policy feedback; `event-policy.md`).
- **Organiser debrief + aggregated attendee feedback** → organising quality (`organizer-engagement.md`).
- **Welcomer signal** → positive participation. Not raw affinity-received (raw tap-counts measure magnetism, not welcome — hypotheses H1–H3, `hypotheses.md`): each tap is **generosity-normalized** (weighted inversely to the tapper's overall tap rate) and **newcomer-weighted** (taps from first/second-timers and rare tappers count most). Composition-only — never feeds facilitator, organiser, or enforcement gates. Raw affinity-received stays captured in the log (**capture ≠ use**); the transformation is interpretation-layer and tunable, including to zero.

- **Kudos** (structured encouragement gestures, D45) — **captured, not used** in rating v1 (capture ≠ use); a sent gesture is socially performative in a way the quiet affinity tap isn't. Any future use goes through the hypothesis register.

Newcomers start at neutral defaults on every facet.

## Uses

- **Group composition** (Group 3) — weave reliable, positive contributors into groups, especially to *support* newcomers and cold-start, and to balance a room. Never a sole gate.
- **Organiser trust-graduation** (`organizer-engagement.md`) — proven organisers get a lighter-touch, faster path.
- **Policy enforcement** (`event-policy.md`) — repeated violations escalate (warn → restrict → remove; Group 4 admin).
- **Facilitator / privilege gating** (`coaching-and-engagement.md` → Members as facilitators) — higher-trust roles are earned.
- **Safety escalation** — patterns of conduct concerns route to admin (Group 4), with human review.

## Mechanism / event-sourcing

A per-user projection built by a projector from the events above — recomputed on new signal, decayed over time, `sourceRef`s for auditability. Backstage, PII, crypto-shredded. It's another projection in the `irl-user-model` store (`projection-store.md`) — `rating#core` items, access-gated. Consequential and safety actions are **human-in-the-loop** (Group 4 admin), never fully automated.

## What we deliberately don't build

- A visible score, rank, badge, or leaderboard.
- A single "trust number."
- Any penalty for *lack* of history (newcomers are trusted-enough by default).
- Secret consequential punishment (restrictions always carry a reason + recourse).
- A positive facet that is really a popularity contest.

## Decisions

- Contributor rating is **backstage and multi-faceted** (reliability / positive participation / organising quality / trust-safety flag), built from observed signal, decaying, with newcomer benefit-of-the-doubt.
- It **informs but never dominates** outcomes, and is **never a visible score or leaderboard**.
- **Safety facet is human-reviewed with due process**; consequential actions always carry a reason + recourse.
- **Positive participation is not popularity** — reliability and absence-of-concerns outweigh affinity-received.
- **Legibility:** a member can see all of their own **history** (events attended, hosted, reliability), but **not the evaluation scores**. Scores are stored **with the most pertinent supporting data** — to give rationale for consequential actions and so we can continually review and improve the approach.

## Open questions

- Facet weightings and decay curves — tune against real data (no empirical grounding yet).
- The "informs, never dominates" mechanism is now specified in `matching.md` (nudges capped below fit + the exploration floor); what remains open here is the *tuning* — the actual cap values, against real data.
- Double-counting between the positive facet and mutual-affinity/crews is much reduced by the welcomer transformation (it discounts exactly the broad-popularity component crews already carry), but verify against real data.
- Escalation ladder + due process specifics (Group 4 admin).
