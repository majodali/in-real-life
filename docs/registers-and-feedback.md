# Registers & Feedback Intake — Design (proposed)

Radar R1, graduated on its own trigger: "before the first advisor
round" — and the launch playbook (D65) just scheduled that round.
Advisor feedback, workshop capture passes, and the D52 advocate
validation all land *on decisions*; you can't revise a decision you
never recorded, and you can't honor "show what changed" without a
place the change is visible.

Scope: two halves that only work together. **The registers** — closing
the coverage gaps (UX, visual, technical) without a scope-calcifying
retrospective project. **The intake process** — how feedback is
solicited, captured, triaged against registers, landed, answered, and
how a decision reopens without relitigating everything. Everything
here is markdown and discipline; the build items are zero.

## 0. Posture

- **Feedback lands on decisions or it evaporates.** The unit of intake
  is not "a comment" but "a comment *about a recorded call*" — and
  when the call it's about was never recorded, recording it is the
  first triage step, not a blocker.
- **Record on contact, never by project.** The existing register
  (D1–D65) grew decision-by-decision as decisions were made. The new
  registers grow the same way: an entry is written the first time a
  decision is *made, revised, or touched by feedback*. A retrospective
  mining pass over every screen and commit is explicitly out of scope
  — it would produce a graveyard, not a register. Each new register is
  seeded with a handful of entries to set the shape and bar.
- **Feedback is evidence, never a vote.** The D21 signal-hygiene rule
  applies to design feedback exactly as it applies to wishes and taps:
  three people saying the same thing is one pattern observed three
  times, weighed on its merits — not a queue position, not a majority.
- **Answering is part of the process, not a courtesy.** Advisors and
  advocates deserve to see what their input changed (or why it
  didn't) — and a decline follows D30: it names the reasoning and,
  where honest, the condition that would change the call. Never a
  bare no.

## 1. The register landscape

Already working, unchanged: `decisions.md` (D — conceptual/product),
`hypotheses.md` (H — testable embedded analyses), `open-risks.md`
(known gaps), `radar.md` (R — undesigned workstreams), `backlog.md`
(progress), `scenario-walkthroughs.md` (F — findings), and the
curation-in-code registers (localities, event types, tunables).

Two coverage gaps get registers; one deliberately doesn't:

- **`ux-register.md` (U-register)** — UX, copy, and visual-design
  decisions in one register. Splitting visual from UX pre-launch is
  premature: the volume is low and the feedback that will arrive
  ("this screen confused me", "this word felt wrong", "why brown?")
  doesn't respect the boundary either. Split later if volume forces
  it; ids are forever either way.
- **`tech-register.md` (T-register)** — technical decisions as
  lightweight ADR-style rows. Much of the technical reasoning already
  lives well in notes (`event-sourcing.md`, `workshop-mode.md`,
  `projection-store.md`); T-rows *index* those rather than duplicate
  them, and capture the calls that today live only in code comments
  and commit messages.
- **No process/ops register yet.** Launch-operations calls live in
  `launch-playbook.md` (which is its own register-of-record, §8's
  retro corrects it in place). A separate ops register waits for R9.

Numbering: U1…, T1…, FB1… (F is taken by scenario findings, H by
hypotheses). Ids are never reused; entries are revised in place with
a dated revision note, same as D-rows.

## 2. The intake pipeline

Six stages. At pre-launch scale every one of them is markdown and a
human; the store-and-tool trigger is the same as every register's
(real issues or volume — not anticipation).

**Solicit.** Feedback is requested *against something specific*, per
channel: an advisor round receives a **round pack** (§3); a workshop
session runs its scripted capture pass (`workshop-crib-sheets.md`);
members have the feedback form (their standing door) and the ⋯
content-alternatives menu (the R2 proto-mechanism — choosing an
alternative is itself feedback). "Any thoughts?" is not solicitation.

**Capture.** Every substantive item enters `feedback-log.md` as an
FB-row: source + channel + date, what was said (verbatim where it can
be), and — filled at triage — what it touches and what happened.
Substantive means: touches a decision, names a confusion, proposes a
change, or reports an experience the design didn't predict. Praise
and noise are acknowledged, not logged.

**Triage.** Each FB-row resolves against the registers, three cases:

1. *Touches a recorded decision* → cite it (D/H/U/T/register row).
   Decide: stands (answer with the recorded reasoning) or revise
   (→ Land).
2. *Touches an unrecorded decision* → **record the decision first**
   (record-on-contact: a new U/T/D row stating the call as it exists
   today), then triage as case 1. The feedback's first gift is
   showing us where the register was silent.
3. *No decision touched* — a new idea, a new risk, a new question →
   route to the right register: backlog (buildable + agreed), radar
   (real but undesigned), open-risks (a gap in something designed),
   hypotheses (a testable claim). Nothing gets a fourth pile.

**Land.** An accepted change is a register edit with a trail: the
decision row gains a dated revision note naming the FB-row that
prompted it; the note that holds the reasoning is updated the same
way every decided note has been (status lines, review-round notes).
Register edits that are curation (bands, kinds, copy alternatives)
land directly in their in-code registers — same trail, in the commit.

**Answer.** The FB-row's disposition goes back to its source:
*changed* (here's what moved), *stands* (here's the recorded
reasoning — and where honest, what evidence would move it), or
*routed* (it's now backlog/radar item X — here's what that means).
For advisor rounds this is a per-round summary returned to the whole
group; for workshop attendees, a short note to the room; for form
submissions, individually only where a reply channel exists (R4
constrains member-directed replies until its design lands).

**Reopen.** A settled decision reopens when someone engages its
*recorded reasoning* and names what's new — evidence, perspective, or
consequence the original call didn't weigh. "I disagree" reopens
nothing; "the reasoning assumed X and here's X failing" always earns
a real look. Observed beats stated applies to design too: usage
evidence outranks opinion, including ours. Pre-launch, the founder is
the decider on every reopen — stated plainly rather than dressed up;
the fuller governance question (who decides at what scale, the
community's role) **remains deliberately deferred** per the
`decisions.md` header. This note is intake, not governance.

## 3. The advisor round pack — the first concrete consumer

What an advisor actually receives (assembled from registers, no new
tooling):

1. **The excerpts under review** — for round one: the locality band
   table (D62's draft, awaiting exactly this correction), the
   event-type register (D63 likewise), the event-policy summary, and
   for the safety-focused advisors, the protective-blocks design
   (D50/D52) for the scheduled advocate validation.
2. **The questions we're actually asking** — specific, per excerpt
   ("is Bremerton banded fairly from here?", "which of these nine
   kinds would this community actually recur on?", "does the
   blocker-view design hold for the situations you've seen?").
3. **The intake promise** — one paragraph: where their input goes
   (FB-rows), how it's triaged (against recorded decisions), and that
   they will receive the round summary showing what changed and what
   stood, with reasons either way.

The pack for round one is assembled when the round is scheduled
(launch playbook phase 3) — it's an operating artifact like the crib
sheets, not part of this note.

## 4. What this is not

- **Not the member-signal paths.** Debriefs, model corrections, and
  wishes are members telling us about *themselves and their
  experiences* — they flow into the user model under their own rules
  (D7, D21, D51). R1 is feedback about *the product and its design*.
  The two must never mix: a debrief is not product feedback, and
  product feedback never edits a member's model.
- **Not support.** "This confused me" in a feedback form is intake;
  "help, I'm stuck" is support (R4). Where one arrives dressed as the
  other, route it and say so.
- **Not governance.** Intake decides *how feedback lands*; who
  ultimately decides contested calls at scale stays deferred, named,
  and honest (§2 Reopen).

## 5. Slice plan

Docs-only; ships with this note:

1. `ux-register.md` — format + seed rows (record-on-contact rule
   stated at the top).
2. `tech-register.md` — format + seed rows, indexing existing notes
   rather than duplicating them.
3. `feedback-log.md` — format + the first FB-rows (retro-recorded
   from the founder review rounds this process grew out of, marked as
   such — the log should never pretend to a cleaner history than it
   has).
4. Registers: radar R1 graduated; README reading order; decision row
   on sign-off.

## Open questions

- Does the feedback form gain a "this is about the app, not about me"
  routing hint, or is that distinction made entirely at triage?
  Default: triage-side only for now — one more form field is friction
  the member pays for our filing convenience.
- When workshop volume arrives, does the capture pass write FB-rows
  live or batch-transcribe same-day? Default: same-day batch by the
  note-taker; live logging competes with facilitating.
