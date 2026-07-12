# External Events & Finding Each Other — Design

External events are gatherings IRL didn't create — the library talk, the
farmers-market opening, the community-hall concert — listed on IRL so
members can commit to meeting each other there. This note records the
stewardship model (D53) and the arrival/recognition design area (D54).

## What an external event is on IRL

The event happens whether or not anyone on IRL taps anything. So the
meaning of every affordance shifts:

- **Confirmation is a commitment to other members, not to the event.**
  "I'll be there" means *you won't walk in alone* — the mutual-commitment
  reading is the whole value. This is IRL's thesis in miniature, and the
  direct medicine for the most common onboarding barrier ("walking into
  rooms of strangers"). Confirmers are mutually committed **attendees**,
  not co-organizers: the commitment is social, never administrative, and
  grants no edit power.
- **Lifecycle**: born `planned`. A real event needs no proposal phase, so
  the full time/place trio is required at listing time (an external event
  you can't yet pin down is really a community *idea* — use that instead).
  `minimumAttendance` / auto-plan / threshold don't apply — the event
  happens regardless of IRL's count. Cancelling means "it's off, or this
  listing was wrong."
- **Capacity** (`maxAttendance`) is informational only — the venue's
  limits aren't IRL's to enforce.
- **Cost disclosure (D34)** applies unchanged: ticket price + what it
  covers.
- **Debrief**: attendee debrief unchanged (who did you meet, how was it).
  There is no organizer-debrief — nothing was organized. A
  not-as-described flag points at the *listing* and its steward, and
  stewardship quality becomes contributor-rating input later (Group 4).

## Stewardship (D53)

The member who lists an external event is its **steward** — shown as
"Listed by", never "Organized by". The distinction is deliberate: people
will happily share a flyer they saw; they hesitate if sharing makes them
the event's owner. A steward's responsibilities are light and stated at
listing time: keep it current if you learn of changes; cancel it if it's
off.

Mechanically the steward holds the existing organizer gates (edit,
cancel) — no new machinery, one accountable human.

**Why not open editing** (any member — or any committed member — updates
the listing): rewriting an event other members have committed to is a
griefing surface (shift the time an hour; "cancel" a real event), and
making it safe demands confirmation workflow, edit provenance, and
dispute handling — messaging-adjacent machinery solving a problem we
don't have yet.

**The correction channel already exists: suggestions.** A member who
notices the venue moved the talk files a suggestion ("7pm now, per their
website"); others vote; the steward adopts and the edit applies through
the standard flow. Unadopted suggestions on an external event double as
the **stale-steward signal** — surfaced to admin/ops when Group 4
tooling lands. If steward absence proves to be a real problem, the next
step is **claim stewardship** (transfer to a willing member, still one
accountable human) — never open editing.

The deferred co-organizers design should treat organizer and steward as
two points on one responsibility spectrum, not two systems.

## Finding each other (D54) — all events, not just external

At an external event the room is full of strangers who *aren't* on IRL,
so recognition is hardest there — but the problem exists everywhere.
Three solution families, in increasing order of machinery and risk:

1. **Recognition text (live now).** An optional meeting-spot /
   how-to-recognize-us hint on every event: "back tables, look for the
   blue scarf." Zero tech, organizer-authored, covers most cases.
2. **On-arrival limited interaction (tracked, undesigned).** A single
   templated message, available only at event time — "I'm here, by the
   door." If ever built, it is a deliberate, *narrow* exception to the
   no-messaging principle, and the messaging-wedge watch-item applies in
   full: fixed vocabulary or single-shot, reply-free, event-scoped.
3. **Ambient device signals (tracked, constrained).** Two very different
   sub-options:
   - a **shared visual symbol** all attendees' phones display — mutual,
     opt-in by the act of showing your screen, no location data. The
     promising one.
   - **Bluetooth/GPS direction or distance to other attendees** — the
     dangerous one. A proximity read is a location-disclosure surface: it
     collides with the rendered-world rule (a blocked person's device
     must never register the blocker's presence, bearing, or distance —
     D50/D52), sharpens the co-presence limit the block design accepts as
     its stated boundary, and normalizes tracking in an app whose promise
     is privacy. Any such feature needs block-awareness at the protocol
     level, per-event opt-in, and advocate review **before design
     starts** — and may simply not be worth it next to options 1–2.

## Open questions

- Steward hand-off UX for "claim stewardship" (only if absence bites).
- Whether external listings need a source link field (venue's own page)
  — probably yes, cheap; decide with the event-type register (Group 3).
- How stewardship quality feeds contributor rating (Group 4).
- Whether the shared-symbol option graduates from tracked to designed —
  revisit after real workshops show how often recognition actually fails.
