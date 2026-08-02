# Operating at Unstaffed Scale — Design (decided: D67)

Radar R9, graduated. Registered as "founder concern #1: production
usage at a scale we can't staff"; worked as the operations strand of
the org track (R11 — the role/staffing half lives in the private
register per its boundary rule; this note carries the public
mechanics: the discipline, the loop dispositions, and the automation
work they name).

## 1. The discipline

Every trust-bearing loop in the system gets a deliberate disposition
**before** growth forces one:

- **Automate** — but only the *mechanics around* judgment, never the
  judgment itself. A verification decline is a communication; a
  safety review is due process (D35); a feedback answer is a
  relationship. Tooling routes, formats, reminds, and measures; it
  does not decide.
- **Staff** — when a loop needs a human and the human can't be the
  same one who runs everything else. Staffing is trigger-bound,
  never calendar-bound.
- **Redesign away** — the best disposition where it exists: change
  the design so the loop isn't needed at operator scale (community
  vouching for verification is the canonical example — R3).
- **Operator-for-now, with a named failure signal** — the honest
  pre-scale default, legitimate exactly as long as the signal that
  ends it is written down.

## 2. The loop map (public mechanics)

| Loop | Disposition | Named failure signal |
|---|---|---|
| Deploys | **automate** — the deploy Lambda (ops-repo-triggered), replacing manual CDK + inject-config | a second manual-deploy mistake |
| Incidents | operator-for-now + **runbooks written + cheap alerting** (DLQ depth is already served at `/admin/health`; alarms should not wait for a human to look) | the first incident that waited on one person's availability |
| Security/dependency upkeep | automate the watching, operator the acting | — |
| Register curation (localities, kinds, seed, tunables) | operator-for-now — the strawman posture IS the design | the named strawman triggers → store + tool |
| Model-quality oversight | operator-for-now; cheap aggregate reads (correction clustering, untyped rate) when post-workshop data exists (D64's deferred dashboards) | corrections clustering unread |
| Locality verification | operator-for-now; **redesign before staffing** — community vouching (R3) is the scale answer, not a verification clerk | queue latency sustained past a few days |
| Conduct/safety review | **never fully automated**; the one loop that is genuinely staffing-shaped — a second trained reviewer before multi-community scale (due process wants two humans) | the first case that can't be reviewed same-week; any case with a conflict |
| Feedback triage + answer-back | operator; automate routing/format only (D66's pipeline gets tooling, not judgment) | answer-back debt visible in the public log |
| Facilitation | operator now; a second facilitator is the first volunteer role (crib sheets exist so the role is handable) | two workshops wanted in one week |
| External-event stewarding | operator now → migrates to trust-graduated organizers (already named in `matching-spec.md`'s future work) | external-event volume |
| Notify sends | manual **by design** (a hand-written send at community scale) | the list outgrows a hand-written send |
| Books/filings/dues | deliberately tiny by the money design (no entitlement gating exists to build) | receipts growth activates the staffing phase |

**The honest summary**: one loop is staffing-shaped (safety review),
one wants a volunteer (facilitation), two want automation now
(deploys, incident alerting) — and everything else is either
designed-to-stay-small or carries a named trigger. The unstaffable
future is mostly a **designed-away** future, *if* the redesigns land
before their triggers fire. That conditional is the watch-item this
note exists to keep visible.

## 3. The automation backlog this creates

1. **Deploy Lambda** — ops-repo-triggered deploys (already
   anticipated in `CLAUDE.md`'s deploy section; now a named item).
2. **Incident runbooks + alerting** — short runbooks for the known
   failure classes (projector DLQ growth, stream lag, API 5xx
   spikes, Cognito issues), plus alarms that page rather than wait
   to be read. The health endpoint already computes the numbers;
   alerting is the missing half.
3. **Feedback-routing tooling** — light structure around the
   D66 pipeline (FB-row templating, answer-back tracking). Format,
   never judgment.

Each lands as its own backlog item; none blocks launch #1.

## 4. What stays out of this note

Role definitions, staffing sequence, compensation, and the
founder-role question live in the private org register (R11's O1
boundary: mechanics public, people private). The public commitments
that bind regardless: automation never launders judgment; safety
review is never solo-forever; and every operator-for-now loop keeps
its failure signal written here, where the community can see whether
we're honoring it.

## Watch signals

- A named failure signal firing without its next-step happening —
  the note's own kill criterion for "designed-away" optimism.
- Redesign dependencies slipping behind their triggers (vouching
  behind verification latency; organizer trust behind external
  volume; register tooling behind curation pain).
- Any pressure to automate a judgment loop "just temporarily."
