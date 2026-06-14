# User Model — Conceptual Design

## Overview

How IRL represents a person internally, what the onboarding interview must gather versus what is learned from lived signal, and how "compatibility" is treated. The model exists to answer one question well: **in what situations does this person come alive?** — and to get better at answering it the longer they use the app.

The design rejects trait scoring and compatibility prediction as goals. Social connection is not a problem with a verifiable solution; the system's job is to stack the odds (right situation, right context, low barriers) and then *listen* to what actually happened.

## What the evidence says

The model is shaped by a handful of well-supported findings about how real-world connection forms:

- **Repetition beats chemistry.** Friendship grows through repeated, low-stakes co-presence — many hours across multiple encounters. A repeatable event is worth more than a perfect one.
- **Side-by-side beats face-to-face.** Activity-anchored gatherings outperform open-ended mingling; the activity absorbs silence and lowers the cost of showing up, especially for the socially anxious.
- **Contribution is a mechanism, not just a motive.** Having a role ("I'm the one bringing the projector") removes the "why am I here" anxiety. The *useful* door isn't just a preference to detect — it's a lever the app can pull.
- **People mispredict what they'll enjoy.** Affective forecasting is poor, and the "liking gap" means people underestimate how much others enjoyed meeting them. Stated preferences are weak evidence; post-event reality is strong evidence.
- **Barriers are mostly situational, not dispositional.** Energy, timing, distance, and "I won't know anyone" sink attendance far more often than disinterest.

Two consequences anchor everything below: the **debrief loop, not onboarding, is the primary engine of understanding**; and the unit modeled is **person–situation fit**, not the person in isolation.

## Principles

- **Model situations, not selves.** No trait vectors, no typologies, no personality labels — stored, shown, or implied. The same person is different in different rooms; a trait score discards exactly the information that matters.
- **Stories, not ratings.** People are poor at abstract self-assessment and good at narratives. The interview asks for episodes; structure is extracted, never directly elicited as scores.
- **Observed beats inferred beats stated.** Every structured value carries provenance. When sources conflict, lived signal wins; stated values decay as observations accumulate.
- **Barriers, not deficits.** What's hard is modeled situationally ("evenings are tough", "big groups freeze me up"), never as character flaws. There is no negative-attribute store.
- **Backstage and legible.** The system's beliefs are never surfaced as scores or labels. The subject can see and correct what the app believes about them; nobody else sees it at all.
- **Everything provisional.** All derived values are revisable projections. The narrative is the durable source; structure is a lossy index over it.

## The three layers

### Layer 1 — Narrative (source of truth)

Prose, in the user's own words and Claude's faithful paraphrases: their self-description, the stories they told at onboarding, their goal, what they're navigating. Stored as text that Claude re-reads when reasoning about the user — not coerced into fields.

This is the layer that survives schema changes. When we improve the structured model, we re-derive Layer 2 from Layer 1 plus the event history; we never need to re-interview.

### Layer 2 — Structured dimensions (derived, lossy index)

Small, coarse, and each value annotated. The core of it is the **comfort envelope** — situational dimensions describing where this person functions well:

| Dimension | Range (coarse) | Why it matters |
|---|---|---|
| Group size | intimate (3–4) / small (5–8) / large | Strongest single situational factor |
| Structure | activity-anchored ↔ open conversation | Side-by-side effect; anxiety absorber |
| Familiarity | fine with strangers ↔ needs a known face | Gate on first events; fades with crew formation |
| Role | wants a job ↔ happy to just attend | The "useful" lever |
| Novelty | seeks new ↔ prefers ritual | Recurring-event fit |
| Energy | capacity per event + sustainable frequency | Prevents over-suggesting; respects rhythm |

The envelope has **two boundaries**: *comfort today* and *growth edge* (the direction they've said or shown they want to stretch). Recommendation targets the edge — comfortable enough to show up, stretching enough to matter.

Alongside the envelope:

- **Doors** — useful / make-learn / connect, possibly mixed, with relative weight.
- **Interests** — tagged and weighted, each linked to the story it came from.
- **Strengths-to-offer** — what they can contribute (skills, hosting, listening, organizing); doubles as role-matching input.
- **Constraints** — hard filters: time windows, distance/travel willingness, accessibility needs, hard boundaries. Constraints are the one place the model is confident and literal.
- **Barriers** — situational difficulties, used to *lower* friction (suggest a known face, a defined role, a closer venue), never to exclude.

**Every Layer 2 value carries:**

| Annotation | Values | Behavior |
|---|---|---|
| `provenance` | `stated` / `inferred` / `observed` | observed > inferred > stated on conflict |
| `confidence` | low / medium / high | Inferences start low; repeated observation raises |
| `asOf` | timestamp | `stated` values decay; `observed` values dominate with recency |
| `sourceRef` | event IDs / narrative refs | Auditability — every belief traceable to its evidence |

### Layer 3 — Relational & experiential (starts empty, grows only from usage)

- **People affinities** — "want to see again" from debriefs. A *mutual* want-to-see-again is the strongest signal the system ever gets, and the seed of crew detection.
- **Event-type outcomes** — what actually energized or drained them, per situation shape (feeds back into the envelope as `observed` values).
- **Growth trajectory** — envelope edges that have moved, evidence the stretch is working.

Layer 3 is never populated at onboarding. It is exclusively earned.

## Privacy & data controls

Re-derivability commits us to storing narrative transcripts indefinitely, which widens the PII surface. That breadth is acceptable only alongside an explicit commitment and concrete controls.

- **What is stored.** Layer 1 narrative (transcripts, paraphrases), Layer 2 derived index, Layer 3 relational signal. All are PII, all are crypto-shredded per `event-sourcing.md`.
- **Data minimization where it counts.** Layer 1 is the only verbose store, and it holds what the user chose to say. Layer 2 stays small and coarse by design. No field is derived from protected or sensitive characteristics, even when the narrative contains them.
- **Legibility.** The subject can see what IRL believes about them (Layer 2) and the stories it was drawn from (Layer 1), and can correct or delete any of it. Beliefs are never shown to anyone else.
- **Export and deletion.** Full export and account deletion (Group 1) operate on all three layers and the underlying events; deletion is a genuine erasure via shredding, not a soft flag.
- **The commitment, stated plainly.** We store this much because it lets the app understand and serve the user better over time — not to profile them for any other purpose. That promise is only as good as the controls above, so the controls ship with the model, not after it.

## Compatibility stance

Predicting interpersonal compatibility is explicitly **not a goal**. Similarity-matching is weak science for friendship — perceived similarity emerges *from* good interactions more than it predicts them. Instead, three tiers with very different confidence:

1. **Hard constraints (confident, cheap).** Schedule overlap, distance, blocks and selective visibility, adults-only. Pure filters.
2. **Soft priors (coarse, few, rank-only).** Conversational pace match; **complementary roles** (a natural host pairs better with a natural joiner than with another host — complementarity over similarity); shared-interest overlap as a tiebreaker. Priors rank candidates within the feasible set; they never gate.
3. **Revealed signal (dominates).** Debrief outcomes. One mutual want-to-see-again outweighs any amount of inference.

Rules:

- Compatibility is computed about **pairs-in-context** ("these two, at this event") — never as a standing person-to-person score.
- It is **never surfaced** to users as a number, rank, or label. Users see good suggestions; beliefs stay backstage.
- Negative signal is handled gently: "didn't click" soft-deprioritizes in ranking; it is distinct from blocks (Group 4) and never visible to either party.

### Difference is not incompatibility

A common request is to be "aware of incompatibility" — large age gaps, strong political views, cultural or ethnic difference. We treat this carefully and somewhat against the grain: **difference is something IRL bridges, not something it sorts by.** Breaking down conventional barriers to connection is a goal, not a risk to be managed away.

Concretely:

- **We never model or match on protected or sensitive characteristics.** No demographic similarity score, no "people like you" cohorting. Sorting by these would both betray the mission and build a discrimination engine.
- **The legitimate concern is harm and discomfort, not difference** — and we address it without prediction, through three mechanisms that need no stereotyping: user-stated boundaries (private; see below), the activity-anchored design (a shared task lowers values-friction far more than pre-sorting would), and revealed signal (if a situation felt unwelcoming, a debrief teaches us — for that person, not for a category).
- **Safety is the one place awareness is non-negotiable** — we never knowingly place someone in a situation they've flagged as unsafe or hostile for them. But we *learn* that from them; we never *infer* it from who they are.

This stance is value-laden and worth explicit sign-off, especially given outside feedback pulling the other way. The default is to bridge; separation happens only from a user's own stated boundary or from revealed harm.

## Boundaries and the anti-observation principle

Users can name people they do not want to interact with (e.g. ex-spouses). This is distinct from a block (Group 4) and, like every barrier, **it does not reduce either person's visibility of events** — both can still see and attend anything.

The hard constraint is asymmetric-information avoidance: **a do-not-interact relationship must never become a way to observe the other person.** If naming someone let me see when they RSVP, where they'll be, or that they're "hidden" from a given event, we would have built a stalking vector. So the rule is that such a relationship is information-symmetric — neither party gains any observational power over the other — and the feature is designed around what it must *prevent* (tracking), not what it enables (avoidance). Mechanism is Group 4 work; the principle is fixed now.

## Sources of signal

The model is fed by three conversational touchpoints, not one: **onboarding** (seeds priors), **event-selection** (browsing made lightly conversational — see `coaching-and-engagement.md`), and **debriefs** (the dominant source). Event-selection is new as a signal source: how someone reacts to options — what tempts them, what they bounce off, what they wish existed — is `inferred` signal about the envelope and doors, gathered without a single extra survey question.

## What onboarding gathers vs defers

The interview (see `onboarding-interview.md`) seeds priors that are cheap to state and expensive to observe — roughly 5–7 cards:

| Gather at onboarding | Defer to lived signal |
|---|---|
| Door(s) + goal in their own words | People affinities (debriefs only) |
| 1–2 interests/strengths, *with a story each* | True energy cost per event type |
| Coarse comfort envelope (one episode question) | Growth-edge calibration |
| Capacity & constraints (rhythm, distance, timing) | Crew formation |
| Optional barrier ("what makes it hard") | All pairwise signal |

How the interview elicits without trait questions:

| Instead of | Ask | Extracts |
|---|---|---|
| "Rate your social energy" | "Tell me about a recent time being around people felt easy" | Group size, structure, role, familiarity — from one story |
| "What are your strengths?" | "What do people tend to come to you for?" | Strengths-to-offer + useful-door signal, non-boastfully |
| "What are your weaknesses?" | "What makes it hard to do more of this?" | Situational barriers, non-stigmatizing |

## Event mapping

- `OnboardingCompleted` (distinct from `UserProfileCreated`) carries the transcript (Layer 1) and the initial Layer 2 extraction, all values `stated`/`inferred`, `provisional: true`.
- Debrief and attendance events carry their own facts; a projection updates Layer 2/3 from them (`observed` provenance). The projection-update design — including whether Claude is in that loop per-debrief or batched — is Group 3 work, its own note.
- Profile edits by the user emit events too; a user correction is `stated` but with a freshness that temporarily outranks stale observations.
- All of this is PII under the crypto-shredding scheme in `event-sourcing.md`.

## Model evolution

The six dimensions are a starting hypothesis, not a fixed ontology. Two governance loops keep the model honest, both human-in-the-loop and run on aggregates (never by exposing individuals):

- **Merge / correlation.** Periodic analysis checks whether two dimensions move together across users — or for sub-populations — strongly enough to collapse into one. For some users dimensions may correlate that don't for others; that itself is worth knowing.
- **Discovery.** Debriefs and event-selection surface causes of friction and elements of success as free narrative. Recurring themes the six dimensions don't capture become *candidate* new dimensions. A common, useful candidate is promoted — by review, not automatically.

This is an analytics/admin surface (Group 4 admin UI), and it must respect the privacy commitments above: it operates on de-identified aggregates and surfaces patterns, not people.

## What we deliberately do not build

- Personality typologies or trait scores (Big Five, MBTI, or homegrown equivalents) — not stored, not displayed, not used.
- A standing compatibility score between any two users.
- Matching or sorting by demographic similarity ("people like you" cohorting) — see *Difference is not incompatibility*.
- Any user-visible label about another person beyond first name, avatar, vibe, and shared context.
- Inference about protected or sensitive characteristics. If a user volunteers something sensitive in narrative, it stays in narrative; Layer 2 never derives fields from it.

## Decisions

- **Barriers never filter visibility.** Events where a barrier applies are clearly identified, and the user may always choose to attend anyway. Prioritization should usually leave no-barrier options plentiful, but that is not guaranteed.
- **Difference is bridged, not sorted by.** We never model or match on protected or sensitive characteristics. (See *Difference is not incompatibility*.)
- **Anti-observation principle.** Do-not-interact relationships preserve full mutual visibility and must never become a way to observe or track the other person.
- **Precedence accepted, mechanism deferred.** observed > inferred > stated, with a fresh user correction temporarily outranking stale observations. Conflicts are expected; resolution starts as per-contribution judgment calls and is otherwise TBD.

## Open questions

- Layer 2 storage shape: single projection document per user vs. per-dimension items (affects partial-update ergonomics and the Group 3 projection design).
- Decay function specifics: how fast `stated` confidence fades, what counts as "enough" observations to flip a dimension.
- Legibility UX: where the user sees/edits "what IRL believes about me" (profile screen extension; Group 1 `Profile view + edit` item).
- Cold start for ranking: with empty Layer 3, how heavily to lean on soft priors vs. near-random exposure with good situational fit (connects to Group 3 cold-start item).
- Whether barriers should ever influence *visibility* of events (probably not — lower friction, don't filter), needs a firm rule before recommendation work.