# Success & Progress — Design

What IRL is *for*, made concrete enough to evaluate and evolve against. This is the keystone the recommender (`matching.md`), the evolving user model, and the whole "evolve on long-term results" premise all depend on — and it was, until now, undefined.

## The stance (and it's almost the opposite of a normal app)

**Success is members building real-world connection and belonging.** It is explicitly **not** engagement, retention, time-in-app, or events attended. IRL is a not-for-profit whose voice says *"we're not the friend — we help you find one"*; measuring our success by how much people use us would betray that at the root.

Three consequences that follow, and that make this stance load-bearing:

- **The graduation paradox.** For many members, success looks like *needing IRL less* — they've built a real social circle and can sustain it themselves. We are the rare product whose best outcome, for many members, includes our own obsolescence. **Retention is therefore not a goal, and reduced need is not churn.** (Caveat: some members *want* ongoing participation — organisers, facilitators, people who love the events themselves — so success is "the member has the social life *they* want," not a universal exit.)
- **We reject the standard metrics as targets.** DAU/MAU, session frequency, notification opens, streaks, number of events attended — none of these are success. Attendance is a *means*; a member who attends twenty events and makes no friends is a failure, one who attends three and finds their people is a triumph.
- **Success is distributional, not average.** A system that delights the already-social while failing the shy and the new is a failure *even if aggregate numbers look great.* The mission is served only if the people who most need connection are actually reached (this is the same objective as cold-start inclusion, `matching.md` #8).

## What success is, at three levels

**Member success** — the member has the social life *they* want. Not one template: a close crew they see independently; a handful of good acquaintances; ongoing rich participation; simply more confidence and less loneliness. The longitudinal markers (indicators, not a mandatory ladder):

> first good experience → returning → repeated co-attendance with *specific* people → mutual want-to-see-again → a crew → connections that persist, even independently of IRL → self-reported belonging / less lonely / a bit braver.

**Community success** — a healthy local web: crews forming *and welcoming newcomers*, new members reliably reaching a *second* good experience, harm rare and well-handled, events sustained by willing organisers. Measured by whether the isolated and new are included, not by totals.

**Mission success** — a real reduction in isolation and increase in belonging in the community IRL serves. The north star; the hardest to measure; the only thing that ultimately matters.

## How we'd know (measurement — carefully)

Much of the real outcome is **off-platform and in people's inner lives**, so we triangulate, gently:

- **Behavioural proxies** (already-captured `observed` signal): RSVP→attend→return; repeated co-attendance with the *same* people; mutual want-to-see-again; crew formation; **newcomer second-event rate**; breadth (meeting new people) vs. depth (deepening with some).
- **Gentle, consented self-report** — occasionally, in the debrief/reflection register (low-friction, user-led, opt-in, never clinical or pressured): "did you meet someone worth seeing again?", and rarely, "how's your social life feeling lately?" Validated loneliness instruments (e.g. UCLA-3) are powerful *and* sensitive — a careful, opt-in future option, never the default, never surveillance.
- **Reading the invisible majority.** When a former crew stops co-attending *through IRL*, the likeliest story is **success** — they became friends and now meet on their own — not churn. We must read reduced IRL-mediated activity among people who clearly connected as *probable graduation*, and never as a retention problem to "win back."

## Progress

"Progress" = a member moving along **their own** trajectory toward the social life they want — per-member, not a universal scale. It's the longitudinal read of the markers above, anchored to the **growth edge** (`user-model.md`): for those who want to stretch, doing slightly braver things over time, by their own signals. Progress is something the app quietly notices and gets out of the way of — never a score shown back, never a pressure.

## How the algorithm evolves on this

The recommender and models evolve **primarily on long-term outcomes** (did members reach durable connection?), using short-term proxies *cautiously*:

- **Indicators, not targets (Goodhart).** Whatever we optimise, we risk corrupting. So success signals inform *human review* of the model-evolution loop (`user-model.md` → Model evolution; `decisions.md` governance), not an automated maximiser. We triangulate behaviour + self-report, rotate indicators, and watch for any signal being gamed or force-produced (e.g. manufacturing crews to hit a number).
- **Optimise the floor, not the mean.** The objective is improving outcomes for the least-served (newcomers, the shy), consistent with the inclusion floor in `matching.md`.
- **Long horizon.** We change the system based on where members end up over months, not on first-take reactions — which is exactly why success had to be defined before the algorithm could be meaningfully tuned.

## Privacy & ethics of measuring success

Success data is among the most sensitive we hold (loneliness, friendship, wellbeing). Same commitments as everything else, held tighter: **consented, legible to the subject, backstage, crypto-shredded, never sold, never used to pressure or manipulate, opt-out at any time.** Measurement must feel like the app *caring*, not *monitoring* — gentle, occasional, and easy to decline. If in doubt, ask less.

## Decisions

- **Success = real-world connection & belonging** for members; **not** engagement, retention, time-in-app, or attendance counts. The standard app metrics are explicitly rejected as targets.
- **Retention is not a goal; reduced need can be success** (the graduation paradox) — with the caveat that success is "the social life the member wants," not a forced exit.
- **Success is distributional** — judged by whether the least-served (new, shy, isolated) are reached, not by averages.
- **Measured as indicators, never targets** (Goodhart); the system evolves on **long-term outcomes**, triangulating gentle self-report with behavioural proxies.
- **Measurement is consented, gentle, opt-in, and backstage** — caring, never surveillance.

## Open questions

- The exact proxy set and how "durable connection" is operationally read from `observed` signal.
- Whether/how far to use validated wellbeing instruments — real power vs. clinical/surveillance feel.
- Operationalising "reduced IRL activity among a connected group = graduation, not churn" without mis-reading genuine disengagement.
- Cadence and wording of self-report so it feels like care, not monitoring.
- How the distributional ("optimise the floor") objective is concretely expressed in the evolution loop.
- The definition of community- and mission-level success rigorous enough to actually track (the north-star metric problem).
