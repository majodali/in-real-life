# Organizer Engagement — Design

Organisers are a first-class participant. IRL engages them across an event's life — from light help framing a listing to firm responsibility gates for sensitive events — and gives them their own debrief. This layer sits **on top of the event lifecycle that already exists** (`propose → planned → in-progress/over/cancelled`, organiser-gated edits, `minimumAttendance`, time/date polls, change-suggestions, attendee debriefs — `infrastructure/lambda/api/events/`).

It is also **load-bearing for the demographic reframe**: "demographic affinity lives on the event" (`user-model.md`) only works if organisers can create well-framed themed events and if the orientation/exclusion gate is handled here.

## Who is the organizer? (event sources)

The event `source` field decides how much of this applies:

| `source` | Who runs it | Organizer engagement |
|---|---|---|
| `community` | a member proposes and runs it | **Full** — framing, structure, responsibility gates, organiser debrief. The main case. |
| `external` | a third-party event happening in the world that IRL surfaces | **Minimal** — there's no IRL member to coach. Shifts from *organiser engagement* to *source/operator vetting* (the register of event types / operators / venues, Group 3) + attendee prep. |
| `platform` | IRL itself runs it (seed / official / workshop) | IRL is the organiser; engagement is internal. |

The rest of this note is about **`community`** events unless noted. A separate axis — *is the current user the organiser?* — governs which UI they see, but doesn't change the engagement model.

## The organizer journey

Mapped onto the real lifecycle:

| Stage | Lifecycle | IRL's engagement |
|---|---|---|
| **Propose** | `EventProposed` (`POST /events`) | Framing help (title / description / intent); structure prompting; orientation/exclusion + legal gates |
| **Firm up** | `proposed → planned` (schedule / auto-plan on `minimumAttendance`); time/date **polls**; **change-suggestions** | Realistic-expectations framing (a quiet turnout isn't failure); suggestion **mediation** (`coaching-and-engagement.md`) |
| **Run** | `in-progress` (time-derived) | Mostly hands-off; facilitation support for unstructured events |
| **After** | `over` | **Organiser debrief** (new; distinct from attendee debrief) |
| **Manage** (throughout) | `EventEdited`, `EventCancelled`, notify attendees | Light help; cancellation handled with care for attendees |

## IRL's role: invited vs. required

Two modes, and keeping them distinct matters:

- **Invited (collaborative) — the common case.** Framing feedback, structure suggestions, expectation-setting. Offered in the we-voice like a helpful co-host; the organiser can take or leave it. This is most of the engagement.
- **Required (gating) — rare but firm.** Exclusion policy, legal considerations, conduct/safety responsibility. These are not optional, but they're delivered with care and always pair the "you can't / you must" with a "here's how" (the framing principle, `coaching-and-engagement.md`).

**Trust-graduated.** A first-time organiser gets the most support and a light touch of scrutiny; an organiser with a track record (contributor rating, Group 4) gets a lighter, faster path. Engagement scales *down* as trust is earned — we don't hover over someone who's run ten good events.

## Framing help (the light, common case)

A clear title, description, and intent make an event discoverable and set attendee expectations — and mismatched expectations are exactly what shows up as a poor attendee debrief. So helping an organiser frame well is high-leverage and low-friction:

- Gentle feedback on whether the title/description conveys what the event actually is and who it's for.
- Surfacing an implied audience so it's stated plainly ("sounds like this is aimed at folks new to hiking — want to say so?").
- All collaborative, all skippable. Never bureaucratic.

## Structure & the unstructured-event special case

Unstructured "just come and chat" events are rare and hard for most attendees — conversation is the hardest on-ramp (`reflection-and-coaching.md` → Skills development). When an event has little structure, IRL either:

- prompts the organiser to add an on-ramp or purpose (an opening activity, a prompt, a role for early arrivals), or
- flags that attendees will be **prepared** for the fact that mingling is the task (skills-development, attendee side).

We never surface a structureless event as if it were low-effort — that sets attendees up to fail. Organisers who want to run these well are candidates for **facilitation** skills support (the useful door at community scale).

## Responsibility gates (required)

- **IRL never enforces or verifies demographic membership.** It has no user demographic data and won't collect any (D28), so it structurally *cannot* enforce who attends — for oriented events or any others. Any real-world gatekeeping ("women-only") is the organiser's, done in person; IRL builds **no attendee-verification flow** — that would reintroduce the entire risk surface (demographic data, self-designation disputes, gaming, trans-exclusion) and make IRL the arbiter of who "counts." IRL's only levers are two, neither of them enforcement:
  - **Listing language / content policy** — welcoming, oriented framing ("women's hike") is fine; unlawful or hostile exclusionary advertising is not.
  - **Attendee protection** — if the organiser will turn people away in person, the listing must say so plainly, so nobody travels to be rejected at the door (the real harm exclusion causes).
  - **Genuinely closed groups run as invite-only / private events** — access by explicit invitation, controlled by the organiser, needing zero demographic data. That's the clean primitive for a closed group, not a demographic check.
- **Conduct & safety.** Organisers carry some responsibility for what happens at their events. The conduct/safety path (`debrief.md`; Group 4) feeds back to organisers and their contributor rating — a pattern of concerns at one organiser's events is a signal.
- **Legal.** The heavy end — regulated activities, exclusionary events — where legal considerations are made explicit. Per-community, and likely needs real counsel before launch in any community.

## Organizer debrief

Distinct from the attendee debrief (`debrief.md`), from the running-it side. Same principles — tiered, low-friction, we-voice, information-first with an optional reflection door. Captures:

- Did it happen; attendance vs. expectation.
- Did the format / structure work.
- Anything to change next time.
- Any conduct/safety issues from the organiser's vantage.

Feeds:

- The **register of event types / operators / venues** (Group 3).
- The organiser's **contributor rating** (Group 4).
- **Aggregated attendee signal back to the organiser** — when several attendees report the same structural miss ("nothing to do", "too big"), that becomes constructive feedback for the organiser, not just user-model updates. A genuinely useful loop, handled gently (it's feedback, not a report card). Richer, reflection-sourced feedback joins this channel too — but **only with the member's explicit, in-the-moment consent**, attributed or anonymous at their choice (`reflection-and-coaching.md` → Routing & consent).
- A **facilitation-coaching** doorway for organisers who want to get better at running things.

Emitting it: an `OrganizerDebriefRecorded` event, parallel to `DebriefRecorded`, on the event/interaction aggregate.

## Voice

- **Invited engagement:** warm-not-familiar, "we", collaborative — a helpful co-host, never a bureaucrat.
- **Required gates:** still warm and caring, but firm; always pair the boundary with a path ("we can't host it as men-excluded, but here's how to run it as a women's group that's welcoming…").
- Trust-graduated, as above.

## Decisions

- **Organizer engagement applies fully to `community` events**; `external` shifts to source/operator vetting; `platform` is internal.
- **Two modes — invited (collaborative, most of it) and required (gating, rare)** — kept distinct; required gates always pair boundary with a path.
- **Trust-graduated:** support and scrutiny scale down as an organiser earns a track record.
- **Organiser debrief is its own flow/event** (`OrganizerDebriefRecorded`), and aggregates attendee signal back as constructive feedback.

## Open questions

- **Event policy** — the organiser flow is the primary enforcement surface for what kinds of events belong on IRL (no dating-primary, no business/sales, grey areas TBD). Designed in `event-policy.md`; the demographic listing-language piece lives there too.
- **Invite-only / continuity events** — deferred for v1. When revisited, the framing is **crew/group continuity** (privacy-preserving follow-ups for people who met openly on IRL — the repetition engine), not general private events; see the discussion under crew detection (Group 3). Guardrail: continuity deepens connections that formed openly, never a way to start a hidden group from scratch.
- How much framing help is proactive vs. only-on-request, without feeling like a gate on posting an event.
- The contributor-rating model that trust-graduation keys off (Group 4) — not yet designed.
- Organiser debrief triggering/timing and how attendee-signal aggregation is thresholded before it's surfaced as feedback.
- External-event vetting (operator/venue register, safety ratings) — its own Group 3/4 design.
- Whether framing help and gates use the same prompt/coaching machinery as the attendee side, or a distinct organiser prompt.
