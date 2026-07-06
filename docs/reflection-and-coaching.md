# Reflection & Coaching — Design

## Overview

The debrief is *information* (`debrief.md`). This note designs the two deeper, optional activities it can open a door to:

- **Reflection** — a calm, user-led space to think about how something felt, what they're hoping for, or what's getting in the way. IRL mostly listens and asks; the user does the thinking.
- **Coaching** — a *conditional* next step, reached only when a user stays fixed on a negative or a stuck frame rather than a learning. Here IRL may offer a single perspective that might help them see it differently.

Both exist to help the user engage with a more open mindset and understand themselves better — never to extract data, never to fill session time. The signal they produce is a **byproduct**; the interaction is for the user. They are entered only from the debrief (in v1), always opt-in, and exitable at any point.

The hardest tone work in the whole product lives here — especially the steering-dissonance case (`debrief.md` → *When a user steers somewhere we won't go*). This note is the design; the exact prompts are a later artifact.

## Principles

- **User-led and opt-in.** The user drives; IRL holds space and asks light questions. Nothing here is required, and it can end at any moment with no cost.
- **Warm, not familiar (D17).** Warmth is in the manner — calm, plain, unhurried. IRL does not interpret feelings, empathise theatrically, or manufacture rapport. A plain acknowledgment of a *fact* ("that's fair to raise") is fine; performing empathy about someone's inner state is not. "We," not "I" (D23).
- **Listen more than talk.** Reflection is mostly the user thinking aloud. IRL's job is to help them *articulate*, not to diagnose them. When it names a pattern, it names one the user has themselves voiced — grounded in their words, offered tentatively, easy to correct.
- **Grounded and honest — no unprovable claims, no promises.** We say only what we can stand behind. We do not assert empirical claims we can't yet back (see *Grounding*, below).
- **Coaching is earned, not default.** Only offered when a user is stuck on the negative rather than the learning; ≤1 perspective; a general observation, never "you should"; yields immediately if unwelcome.
- **Not an engagement machine.** Short, exitable, rare. These serve the user's growth, not our metrics (the honesty principle, `coaching-and-engagement.md`). If someone doesn't want to go deeper, that's the right outcome.
- **Safety still routes out.** If reflection surfaces a conduct/safety issue, it goes to the reporting/support path (Group 4) — it is not reflection material.

## When the door opens (entry)

Reflection is reached **from the debrief**, two ways:

- **The user pulls** — taps "say more," or keeps writing.
- **A gentle, declinable offer** — when the user is clearly *dwelling*: a charged free-text answer, an attempt to steer somewhere we won't go, a strongly negative outcome they elaborate on. The offer is light ("want to say a bit more about that?") and easy to wave off.

Detecting "dwelling" is rule-assisted plus model judgment, and must **under-trigger by default** — most debriefs simply end. We would rather miss an opening than pester someone who just wanted to log a tap.

Reflection reachable from *outside* the debrief (a profile check-in, say) is deferred; v1 is debrief-initiated only.

## Reflection mode

A calm space where feelings, motivations, and what's-getting-in-the-way are natural to talk about. IRL's moves are deliberately small:

- **Open, gentle questions** — "What were you hoping it'd be like?" / "What's the part that's not landing?"
- **Light follow-ups** that stay with the user's own thread.
- **Naming a pattern the user has voiced** — "Sounds like the activity matters more to you than the crowd, from what you've said" — grounded in *their* words, tentative, correctable. Never a pattern IRL inferred and imposed.
- **Leaving room to stop.**

What reflection deliberately does **not** do: interpret or validate feelings, give advice (that's coaching), make claims, or entertain a demographic steer. On that last point, the handling from `debrief.md` applies here in full — a plain acknowledgment, an honest and grounded rationale, no compromise, no demographic offer, treated as a chance for reflection rather than correction.

Reflection ends when the user is done — a plain, warm close, no over-promise. It hands to coaching **only** if the user is stuck (below).

## Reflection → coaching (the conditional)

Coaching is offered **only** when, in reflection, a user stays fixed on the negative rather than moving toward a learning or a next step — signals like repeating the same complaint, a self-defeating frame ("I'm just bad at this"), or fixation on a filter we won't apply. Even then it's a gentle offer, not a switch thrown on them.

The distinction is clean: **reflection helps the user articulate; coaching (sparingly) offers a reframe** that might help them move. Most reflections never become coaching, and that's fine.

## Coaching mode

Home of the five evidence-based perspectives — repetition over chemistry, side-by-side over face-to-face, contribution as a way in, we-mispredict-what-we'll-enjoy, barriers are situational (the table in `coaching-and-engagement.md` → *Perspectives worth sharing*). Delivery:

- **One perspective, as a general observation** — "A lot of people find the second time easier than the first" — offered tentatively, not aimed at the person as a diagnosis, easy to ignore.
- **Never instruction.** No "you should." A way of seeing, not a directive.
- **Yields immediately.** If the user isn't receptive, we stop. We never repeat a perspective a user has already been offered (frequency-capped per user), and never push.
- **Holds the line without forcing a reframe.** For the demographic-fixation case, coaching's gentlest tool is a perspective (e.g. shared activity tends to make difference matter less than expected). But if the user doesn't want to move, we hold our position (no demographic sorting) and let it be — we do not keep pressing a reframe on someone.

## Grounding

Until we have real usage data, perspectives are offered as **general, modestly-framed ways of seeing** — not as empirical claims about IRL's own results. The five theses are research-grounded, but we present them humbly ("a lot of people find…", "often…"), not as data-backed promises. The day we can honestly say *"in our experience on IRL…"* is a future capability that needs real outcomes behind it (shared open question with `debrief.md`). Saying it before then would be exactly the unprovable claim we've committed to avoid. This explicitly includes **first-person-plural data claims** — "the most common thing we hear", "most of our members…" — which are forbidden in hand-authored copy *and* in the prompt guardrails until grounded (open-risks #13).

## Skills development

Reflection and coaching are only worth having if IRL can back them with real help building the skills that make showing up and connecting easier. This is a **first-class capability family**, not an afterthought — the substance behind coaching. Likely areas:

- **Starting and entering conversations** — plausibly the #1 challenge users raise. Most people find it a genuine *challenge* (surmountable with practice), not an intractable difficulty. Pre-event preparation and a few practised ways-in help people arrive more confident.
- **Empathy, listening, reading a room.**
- **Conflict resolution** — handling friction gracefully.
- **Event organisation & facilitation** — for members who want to host or help (the useful door at community scale; `coaching-and-engagement.md` → Members as facilitators).

Design stance:

- **Conversation is a destination, not an entry point.** It's the substance of friendship, so it's never the wrong goal — but open mingling is the hardest on-ramp for many. Structured / activity events are *scaffolding* that lowers the entry barrier; conversation is a skill to grow *into*, not around. The one unhealthy pattern is permanent avoidance — parallel activity forever, never talking, never deepening.
- **Coaching connects to practice, not just perspective.** Where the five perspectives *reframe*, skills work builds *capability* — the difference between "the second time is easier" and actually being readier for it.

A capability family to design in its own right (its own note when we get there); captured here because it's what makes reflection and coaching honest.

## Signal & event-sourcing

Reflection/coaching is rich narrative, and produces the same kind of `observed` evidence as a Tier-2 debrief.

- A **`ReflectionRecorded`** event (linked to the triggering debrief/event) carries the reflection transcript, the `observed` L2/L3 deltas extracted from it, and a light record of any coaching perspective offered (which one, whether it landed). Keeping it a distinct event preserves the debrief-is-information separation.
- **Coaching frequency-cap store** — a per-user record of perspectives already offered, so we never repeat one. Small, but load-bearing for the "never nag" promise.
- All of it is PII under the crypto-shredding scheme (`event-sourcing.md`), and — like everything — the interaction serves the user; the signal is a byproduct.

## Cost & mechanism

- Reflection is a genuine (short) conversation — a handful of turns, Opus 4.8, non-streaming, one call per turn; extraction of deltas at the close (as with debrief Tier 2). It's **cheap because it's rare** — only a minority of debriefs open this door.
- Turns are conversational text in the we-voice, not cards. Structured output is used only for the closing extraction, not the conversation itself.

## Reframe library (working copy)

Provisional response copy for the hardest moments, in the we-voice (warm-not-familiar, grounded, no unprovable claims, every "don't" paired with a "do"). To be validated against real reactions. **This library is the single source of truth for this copy** — other notes reference it rather than duplicating it, so a refinement here doesn't leave stale variants elsewhere.

**Age steer (reflection guidance).** *User wants people their own age.*
> "IRL doesn't match by age. Aside from wanting more people your own age, what would've made the evening easier?"

Sets the demographic aside without denying the feeling or asserting a cause; invites an addressable reflection *if* they volunteer it. The constructive "here's how this happens on IRL" (themed events, propose-your-own) is available if they want a path — see `user-model.md` → *Demographic affinity lives on the event*.

**"I'm bad at this" (reflection → conversation-skills coaching).**
> (reflection) "What part was hardest — walking in, or once you were there?"
> (coaching) "Joining a conversation is a genuine challenge for most people — you're far from alone — and it gets easier with a bit of practice. Want to talk through a couple of ways in before your next one?"

"Challenge" (surmountable), not "hard" (intractable); opens the growth path (skills), not just easier events.

**Lukewarm-but-fixable (reflection stays reflection).**
> "That's useful — sounds like the ones with something actually happening suit you more. We'll keep that in mind."

She diagnosed it herself; nothing to coach. Reflects her own insight back as structure; minimal close.

**Gender-comfort steer (constructive, event-level).**
> "Understood. IRL doesn't match people by gender — but plenty of events here are organised for a particular crowd, women's groups included, so those can show up in your feed, and you could start one. What would make an evening feel easier — the group itself, or things like size and knowing a face or two?"

Respects the preference, offers a real path, doesn't imply bias, still opens reflection.

**Fixation that won't move (the exit).**
> "Fair enough — we won't sort by age, but we'll keep finding the things you actually enjoy."

Holds the line once, points to what we do, stops. No pushing, no guilt.

## Decisions

- **Reflection and coaching are distinct, optional, user-led modes**, reached in v1 only from the debrief; the debrief opens the door but never performs them.
- **Reflection: IRL listens and asks**, grounds any pattern it names in the user's own words, and does not interpret feelings, give advice, or make claims.
- **Coaching is conditional** — only when a user is stuck on the negative; ≤1 perspective; offered, not instructed; yields immediately; frequency-capped; holds the no-demographic line without forcing a reframe.
- **Perspectives are framed modestly**, never as empirical IRL-data claims, until we have real outcomes to ground them.
- **`ReflectionRecorded`** event carries transcript + `observed` deltas + coaching-offered record; a per-user frequency-cap store prevents repeats.

## Open questions

- Reliable, low-false-positive detection of "dwelling" / "stuck on the negative" — rule + model judgment, needs tuning against real reactions.
- The exact wording of the steering reframe (shared work-to-do with `debrief.md`) — the single most delicate piece of copy in the product.
- Whether reflection is ever reachable outside the debrief (profile check-in, proactive) — deferred.
- `ReflectionRecorded` vs. extending `DebriefRecorded`; and the frequency-cap store shape (ties to the projection-store open question).
- When perspectives can be honestly grounded in IRL's own data ("in our experience…").
- The reflection/coaching prompt artifact (voice, the reframe library, the transition logic), once this design is agreed.
