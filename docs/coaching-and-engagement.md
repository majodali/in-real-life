# Coaching, Touchpoints & Active Engagement — Design

## Overview

IRL is an active, supportive participant in a user's social life, not a passive matcher that just ranks a feed. Three conversational touchpoints — onboarding, event-selection, and debriefs — each do double duty: they gather understanding (see `user-model.md`) *and* offer gentle guidance. On top of that, IRL helps users take initiative: proposing events that fit them, and resolving change-suggestions on events others have proposed.

The whole surface is governed by one tonal rule: **circumspect, never didactic.** The app shares perspective and lowers friction; it does not lecture, nag, or moralize. Coaching is a quiet hand on the back, not a coach with a whistle.

## Principles

- **Perspective, not instruction.** Offer a way of seeing ("people often click on the second meeting, not the first"), not a directive ("you should go to more events").
- **Earned by context.** A nudge appears only when the moment makes it relevant — hesitating over an event, a lukewarm debrief — never as a standalone tip-of-the-day.
- **One idea at a time.** At most a single perspective per interaction. Silence is the default.
- **Respects autonomy.** Every nudge is trivially ignorable. The user's choice always stands; coaching never gates an action.
- **Aimed at the growth edge.** Guidance nudges toward the edge of the comfort envelope (`user-model.md`) — a small stretch, never a shove.
- **Honest, not manipulative.** We share these perspectives because the evidence supports them and they help the user, not to drive engagement metrics.

## Perspectives worth sharing

The evidence behind the user model (see `user-model.md` → *What the evidence says*) is also worth gently sharing, because it helps users engage with a more open mindset — most people arrive with the opposite priors.

| Perspective | Why it helps the user | Where it surfaces naturally |
|---|---|---|
| Repetition over chemistry | Lowers the stakes of any single event; encourages return | Debrief ("worth another go?"), event-selection (recurring events) |
| Side-by-side over face-to-face | Makes "I'm not good at mingling" a non-issue | Onboarding (reframes anxiety), event-selection (activity-anchored options) |
| Contribution as a way in | Gives a role, removes "why am I here" | Onboarding (the useful door), proposing events |
| We mispredict what we'll enjoy | Loosens the grip of "that's not for me" | Event-selection (gentle stretch), debrief (surprise vs. expectation) |
| Barriers are situational | Reframes "I'm bad at this" as "that setup was hard" | Debrief (what actually got in the way), onboarding |

These are offered as observations, occasionally, when they fit — not delivered as a curriculum.

## The three touchpoints

Each is a two-way surface: signal flows in, guidance flows out.

- **Onboarding.** Signal: seeds the model (`onboarding-interview.md`). Guidance: reframes social anxiety up front (side-by-side, contribution), and sets an open-minded tone for everything after.
- **Event-selection.** Today this is passive browsing. Made *slightly* conversational, it becomes both a rich signal source — what tempts you, what you bounce off, what you wish existed (`inferred` signal on envelope and doors) — and a coaching moment, where a small stretch toward the growth edge can be offered when the user hesitates. The bar for friction here is high: most browsing should stay silent.
- **Debriefs.** The dominant signal source (`user-model.md`), and the most natural coaching moment — reflecting on what actually happened is where "repetition over chemistry" and "barriers are situational" land best.

## Active engagement

Beyond choosing among existing events, IRL helps users shape the social opportunities themselves — carefully, because the cost of friction and noise here falls on *other* users too.

### Coaching a user to propose an event

A blank "propose an event" form is high-friction and tends to produce events that don't work. IRL can lower that barrier and improve the odds:

- Start from what fits the proposer (their interests, doors, envelope) rather than a blank page.
- Nudge toward shapes the evidence favors — activity-anchored, a workable size, a real role for attendees, repeatable rather than one-off.
- Keep expectations realistic (minimum-attendance framing from Group 2) so a quiet turnout doesn't feel like failure.

The aim is an event the proposer will enjoy *and* that others are likely to join — not maximizing the number of events.

### Mediating change-suggestions

When a proposed event draws "suggest a change" responses (Group 2's currently-stubbed flow), both sides need support:

- **For the proposer:** synthesize suggestions into a clear, low-load decision rather than a pile of individual asks. Protect them from feeling besieged by their own good deed.
- **For suggesters:** help frame a change as a constructive option, and set the expectation that the proposer may decline.
- **Toward a workable outcome:** favor convergence on one good event over fragmenting into several near-duplicates, while leaving room to spin off a genuinely distinct alternative.

### Guardrails

- **Don't overwhelm proposers.** Organizing already carries load; coaching must reduce it, not add to it.
- **Don't create noise for attendees.** Suggestions and nudges to others must be sparse and clearly optional.
- **Don't fragment the pool.** Many near-identical events split attendance and undermine the repetition that makes connection work.
- **The human decides.** IRL drafts, suggests, and synthesizes; proposers and attendees choose.

## Relationship to other notes

- `user-model.md` — what each touchpoint feeds, and the growth edge coaching aims at.
- `onboarding-interview.md` — the first touchpoint in depth.
- Group 2 backlog (event lifecycle, propose-event, suggest-change) — the surfaces active engagement plugs into.

## Open questions

- How conversational event-selection can become before it adds friction — the right default is probably "silent unless the user lingers or asks."
- Whether coaching is the same Claude call that produces a screen's content, or a separate lightweight pass — affects latency and cost (cf. `onboarding-interview.md` request design).
- Frequency caps on nudges across the whole app, so perspectives stay rare enough to feel earned.
- Measuring whether coaching helps without optimizing for engagement-for-its-own-sake (the honesty principle).
- Change-suggestion mediation mechanics — how much IRL drafts vs. relays verbatim — needs design alongside the Group 2 suggest-change modal.
