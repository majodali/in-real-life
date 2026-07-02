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

## Voice & identity

IRL's AI surfaces — onboarding, event-selection nudges, debriefs — share one voice, and that voice has **warmth but no identity**. It is not a named character, has no persona or avatar, and is not something to relate to. This is deliberate: the mission is to move people toward friendships with *people*, so the app must never become a competing attachment — a risk that falls hardest on exactly the lonely or vulnerable members we most want to serve, and that sits badly with a not-for-profit that has forsworn engagement-for-its-own-sake.

The voice is **self-effacing and outward-pointing**: warm, kind, and plainly honest that it is the app helping, not a friend. Its character, such as it is, is *the one who makes an introduction and then steps back*. When natural, it can say so directly ("we're not the friend here — that's what we're hoping to help you find"), which de-anthropomorphizes and, for a not-for-profit, builds trust.

**Warm, not familiar.** Warmth lives in the *manner* — kind, plain, unhurried — not in commentary about the person. The voice does not validate, reassure, interpret feelings, or praise what someone shares ("that's brave," "you clearly light up"). That kind of false rapport makes the app a stand-in for the connection it's meant to point toward, and risks implying a personalized solution it doesn't deliver. Acknowledge briefly, then carry on. This applies to every AI-voiced surface, and is intuition to be validated against real user reactions.

**"We," not "I."** IRL speaks as the community and organisation — "we'll look for…," never "I'll…." There is no individual behind the voice, and the plural keeps it that way; it should still read warm and human, not corporate. This is the natural expression of the no-individual-persona stance, and applies across every surface.

This is a global rule for every AI-voiced surface, and — like all decisions — revisable: if real usage shows members are too guarded without a "someone" to talk to and disclosure suffers, a light identity is an easy, reversible thing to add. Removing a beloved persona later is not, so "no name" is also the safer first bet.

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
- **Debriefs.** The dominant signal source (`user-model.md`), but kept as *information* — crisp capture, not counsel (`debrief.md`). Reflection and coaching are **separate, opt-in modes** the debrief can open a door to but never performs inline: reflection is where "repetition over chemistry" and "barriers are situational" can land, and coaching follows only if a user stays fixed on the negative rather than the learning.

## Answering the difference concern

We don't act on difference (see `user-model.md` → *Difference is not incompatibility*), but members will sometimes raise it, and we answer honestly and warmly rather than deflect. Two real cases from Bainbridge (median age >50):

- **Younger members wanting age-peers.** We don't sort by age, and on a thin, older island we can't promise a room of twenty-somethings. The honest, hopeful answer: we help you find things you'll genuinely enjoy; the pool grows as the community does; and shared activity tends to make an age mix matter far less than people expect (intergenerational connection is often a quiet gift).
- **Women wary after bad experiences with men or dating apps.** This is mostly a safety concern, and safety is handled deliberately elsewhere (Group 4: reporting, blocks, contributor trust, no messaging, show-up-only). The answer leads with how events are kept safe, not with filtering men out.

The throughline: never promise demographic matching, never imply anyone is incompatible, meet the worry with candor plus the genuine ways IRL helps.

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

### Members as facilitators

Some members don't just want to attend — they want to *help*: facilitate events, support others' skill-building, do outreach in the community. This is the **useful door at community scale**, and IRL should leave a path for it rather than treating everyone as a passive attendee.

- Onboarding and debriefs can detect a strong contribution signal (`user-model.md` → strengths-to-offer) and, over time, surface facilitation as an option.
- A facilitator role carries more trust than attending, so it connects to contributor rating and safety vetting (Group 4) — earned and supported, not self-assigned and forgotten.
- The guardrails below apply doubly: facilitation should reduce load and noise for others, not generate it.

The full volunteer/facilitator system is its own design (likely spanning Groups 2–4); captured here so onboarding and the model leave room for it.

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
