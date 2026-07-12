# Radar — Tracked Workstreams

Topics we are committed to addressing that are **not yet designed** and not
yet scheduled. Different in kind from the other registers: `decisions.md`
records what we've decided, `open-risks.md` records gaps in things we've
designed — the radar records things we can see coming and refuse to be
surprised by.

Each entry says what it is, why it matters, and what's likely to activate
it. When an entry activates, it graduates into a design note (and its
decisions into the register) the same way everything else has; the entry
then records where it went. Radar entries are deliberately *not* sliced
into backlog items yet — premature decomposition of an undesigned area is
how scope calcifies.

| # | Workstream | Likely trigger |
|---|---|---|
| R1 | Decision registers & feedback intake process | before the first advisor round |
| R2 | A/B testing UX | first UX dispute real usage can settle |
| R3 | Age & locality verification | before public launch |
| R4 | Staff ↔ member communication & support | first real members |
| R5 | Community launch playbook | second locality |
| R6 | Broad community feedback | first community big enough to poll |
| R7 | Pricing & sponsorship | Group 5 (billing) design start |

## R1 — Decision registers & feedback intake process

Organize **all** decisions — functional, UX, visual design, technical —
into registers, and formalize the process for taking feedback from
advisors and user groups.

Today `decisions.md` (D1–D52) covers conceptual/product design well, but
UX decisions live in screens, technical decisions live in code comments
and commit messages, and visual-design decisions live nowhere. That's
fine while one head holds it all; it breaks the moment advisors and user
groups start giving structured feedback, because feedback lands *on
decisions* — and you can't revise a decision you never recorded.

The process half matters as much as the registers: how feedback is
solicited, captured, triaged against the registers, answered (advocates
and advisors deserve to see what their input changed), and how a decision
gets reopened without relitigating everything. The protective-blocks
advocate validation round (D52's open questions) is the first concrete
consumer — this should be in place before that conversation starts.

## R2 — A/B testing UX

How IRL tests UX variants. Two constraints make this non-standard:

- Success is real-world connection, not engagement (`success-and-progress.md`)
  — so variants must be judged on IRL's own indicators (show-up rate,
  debrief warmth, return-to-second-event), never click-through. An A/B
  harness imported unexamined from consumer tech optimizes the wrong thing.
- Small communities mean small N. Per-locality experiments will often lack
  power; we may be testing sequentially (before/after), qualitatively
  (debrief + workshop feedback), or not at all.

The existing content-alternative system (⋯ menu, `alternatives.js`) is a
proto-mechanism: it already lets users *see and choose* alternative copy
rather than being silently bucketed — a more honest posture worth
considering as the default. Also ties to R6 (community feedback as the
qualitative arm).

## R3 — Age & locality verification

How we actually verify the two things the agreement asserts: adulthood
(adults-only until Group 6) and locality (real community membership).

Today both are assertions: age is a checkbox claim, locality is manual
admin approval (the automated path — postcard, third-party — is an open
Group 1 backlog item). Verification strength trades directly against two
things we care about: privacy (ID verification collects exactly the PII
we've built crypto-shredding to minimize) and friction at the front door
(the warm-welcome onboarding stance). Options span self-attestation +
report-driven enforcement, document checks at activation, third-party
verification services, and community vouching. Needs a deliberate
decision on how much verification is *enough* for launch, recorded with
its reasoning — this is also a legal-exposure question (minors at
real-world meetups) that deserves counsel input, not just design
judgment.

## R4 — Staff ↔ member communication & support

How IRL staff communicate with members, and how members seek and receive
support. Group 4's backlog has the *surfaces* (admin/support UI, support
requests, assistant chat, staff chat); the radar item is the
*communication design* around them:

- Channels: in-app only? email? what reaches a member who's stopped
  opening the app (graduated? lapsed? blocked someone and left?)
- Voice: the one-voice rule (D15/D17/D23 — warm-not-familiar, "we") was
  designed for the AI spine; does support staff speak in the same "we",
  and where's the line between AI-assisted support and a human who says
  so honestly?
- The no-messaging principle is member↔member. Staff↔member messaging
  exists by necessity (safety review, locality verification, incident
  follow-up) — its boundaries need stating so it never becomes a
  general-messaging back door.
- Support-seeking as signal: a member repeatedly asking for help is
  telling us something the model should hear (with the same
  safety-is-never-signal guardrail as D46).

## R5 — Community launch playbook

The repeatable process for launching IRL in a new community or region.
Sub-questions, roughly in launch order:

- **Interest registration** — the notify list (`POST /notify`) already
  captures pre-launch interest by postal code; what threshold or shape of
  interest triggers a launch decision?
- **Initial adopters** — launching with a small founding cohort: do they
  get a formal role in informing launch and/or promotion? (Ties to the
  small-N anonymity regimes and the deferred tier-2 "known circle"
  construct — early adopters are exactly the cohort that opted into
  visibility.)
- **Local advisors** — recruiting them, what we ask of them, how their
  feedback enters the registers (R1).
- **Workshops** — running real workshop-mode sessions with local groups
  pre-launch; workshop mode (simulated time, seeded activity) is built
  for exactly this, but the *facilitation* process isn't written.
- **Languages** — when and how to support languages beyond English:
  interview prompts, extraction schemas, and the one-voice rule all have
  language embedded in them; a translation pass is not a localization
  strategy. Likely far out, but the decision of *when it's warranted*
  (community demand signal?) belongs in the playbook.

## R6 — Broad community feedback

Mechanisms for seeking and receiving feedback from a whole community —
on functionality, policy, and challenges — as distinct from the
individual signal paths we've designed (debriefs, app feedback, policy
feedback on events). Something like: periodic community pulses, open
policy comment windows, town-hall workshops, an advisory panel per
locality (R5). Design questions: how to hear the quiet members and not
just the vocal ones (the debrief design's information-first lesson
applies), how feedback visibly lands (R1's "show what changed"
obligation), and how policy feedback from one community does or doesn't
generalize to others.

## R7 — Pricing & sponsorship

Group 5's backlog covers billing *mechanics* (tiers, Stripe,
entitlements); the radar item is the pricing *model* and the sponsorship
question that precedes mechanics:

- What's priced at all, given the not-for-profit stance and the
  graduation posture (D48) — a subscription that profits from retention
  sits awkwardly next to "success includes needing us less."
- Sponsorship: local businesses, civic bodies, or grants underwriting a
  community's costs (venues already host events; sponsoring access is
  adjacent). The hard constraint to state up front: sponsorship must
  never become an influence channel into matching, the feed, or policy —
  the same firewall contributor-rating has (informs, never dominates;
  here: funds, never steers).
- Equity across members: ability to pay must not gate belonging
  (scholarships/waivers, community-funded seats), or the inclusion floor
  (H2) is hollow at the paywall.
