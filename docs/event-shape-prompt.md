# Event Shape Extraction — Prompt & Schema (v1)

The extraction call that gives every event a **machine-readable shape** for
matching (D56). Runs once at propose time (all sources — community,
external, platform): one call, task `event-shape`, deterministic stub in
workshop/test (D37). The result rides in `EventProposed.data.shape`
(frozen at command time, like every extraction) and projects onto the
event row. Event shape is public listing data — **not PII, not encrypted**.

The organizer can correct it: shape fields are editable via the normal
event edit, which stamps `source: "organizer"` (extracted shape carries
`source: "extracted"`). An organizer's correction is never overwritten by
re-extraction — in v1 nothing re-extracts at all; title/description edits
leave shape alone (noted as an open refinement).

Extraction failure is never propose failure: an event without shape simply
ranks through the text-fallback fit path (`matching-spec.md`).

Change process: this file is the source of truth;
`infrastructure/lambda/api/events/event-shape.mjs` mirrors it verbatim.
Change here first.

## Why these three fields

`matching.md` defines fit as envelope + doors + interests vs. the event's
shape. v1 extracts only what the *member* side can already consume:

- `activityTags` — matched against `interest#` tags (the strongest fit
  signal we have).
- `doors` — matched against the member's onboarding door weights
  (`useful` / `make-learn` / `connect` — structured on both sides).
- `structure` — **captured, not used** (capture ≠ use): the member-side
  envelope is still free text, so there's nothing to compare against yet.
  It's extracted now so the log carries it from day one; when the envelope
  gets comparable form, the fit upgrade needs no backfill.

Size is deliberately not extracted: attendance fields already carry it
deterministically.

## System prompt

```
You classify a community meetup event listing into a small, fixed shape
vocabulary for matching. You receive the listing's title and description.

Extract ONLY what the listing itself supports - the shape feeds event
recommendations, so a wrong tag misroutes real people. When the listing
is thin, prefer fewer tags: an empty tags array is a valid answer. Never
invent details, and never editorialize about the activity.

- activityTags: up to 5 short lowercase noun phrases naming what
  attendees actually DO ("board games", "trail walk", "pottery"). Not
  vibes, not adjectives, not the venue name.
- structure: how much the activity itself organizes the time.
  "structured" = a format runs the session (a class, a game, a work
  party); "semi-structured" = an anchor activity with loose space around
  it (a walk, a craft table); "unstructured" = the point is open
  conversation or hanging out.
- doors: which of the three doors the event most plausibly opens -
  "useful" (contribute, help), "make-learn" (make or learn something),
  "connect" (be with people). Most events open one or two; list only the
  credible ones.

Follow the JSON schema exactly.
```

## User message

```
TITLE: <title>
DESCRIPTION: <description, or "(none)">
```

## Schema

```jsonc
{
  "activityTags": ["string"],          // ≤5, lowercase noun phrases
  "structure": "structured | semi-structured | unstructured",
  "doors": ["useful | make-learn | connect"]   // ≤3, the credible ones
}
```

Server-side normalization (both extracted and organizer-edited shape):
tags lowercased, non-alphanumerics collapsed to single spaces, deduped,
capped at 5 × 40 chars; structure and doors strictly enum-checked. An
extracted shape failing validation counts as extraction failure (no
shape), never a propose error.
