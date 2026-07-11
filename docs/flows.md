# IRL — Process & Flow Diagrams

The visual companion to the design notes. Each diagram cites the note that owns it; the notes remain the source of truth — if a diagram and a note disagree, the note wins and the diagram is a bug.

**Legend:** solid = designed (a note covers it) · **dashed = TBD or deferred** (recognised, not yet designed) · red-tinted = required gate / safety path · green cylinder = data store.

---

## 1. The big picture — member journey and the signal loop

The spine of the whole product: understanding is *seeded* at onboarding and *grown* from lived signal; everything the member does feeds the model that shapes what they see next. (`README.md`, `user-model.md`, `success-and-progress.md`)

```mermaid
flowchart TB
    classDef tbd stroke-dasharray: 6 4
    classDef store fill:#eef3ee,stroke:#5a7d5a

    SU["Sign-up + agreement"] --> PB["Profile basics<br/>(name, avatar, vibe)"]
    PB --> INT["AI onboarding interview<br/>(adaptive cards, multi-door)"]
    INT --> LV["Locality verification"]
    LV --> ACT["Activated member"]
    ACT --> FEED["Feed<br/>(matching + exploration)"]
    FEED --> RSVP["Interest / RSVP / confirm"]
    RSVP --> EVT(["Event happens — in real life"])
    EVT --> DBF["Debrief (fast taps)"]
    DBF -. "standing door: say more" .-> REFL["Reflection"]
    REFL -. "only if stuck" .-> COACH["Coaching"]
    EVT -.-> KUDOS["Kudos — v-next"]:::tbd

    INT -- "OnboardingCompleted" --> LOG[("Event log")]:::store
    RSVP -- "interaction events" --> LOG
    DBF -- "DebriefRecorded" --> LOG
    REFL -- "ReflectionRecorded" --> LOG
    LOG -- "Streams projector" --> MODEL[("User model +<br/>contributor rating")]:::store
    MODEL --> FEED
```

---

## 2. Member lifecycle — three registration paths

All paths converge on the same events; only path metadata differs. The interview is required by default in production but **structurally decoupled from activation** (D42) — activation prerequisites are agreement + basics + locality. (`event-sourcing.md` → Registration & user lifecycle)

```mermaid
flowchart TB
    classDef tbd stroke-dasharray: 6 4

    subgraph SELF["Self-registration"]
      C1["Cognito sign-up + email verify"] --> R1["UserRegistered — path: self"]
    end
    subgraph INV["Admin invite"]
      A1["UserInvited (admin)"] --> R2["UserRegistered — path: admin"]
    end
    subgraph IMP["Cross-env import (no history)"]
      I1["ImportUser command"] --> R3["UserRegistered — path: imported"]
      R3 --> IB["UserProfileCreated — basics"]
      IB --> IP["ProfileImported<br/>(L1 narrative + L2 snapshot;<br/>L3 + rating never cross envs)"]
      IP --> ILV["LocalityVerified (carried)"]
      ILV --> IA["UserActivated"]
    end

    R1 --> B["UserProfileCreated — basics"]
    R2 --> B
    B --> LR["LocalityVerificationRequested"]
    LR --> LVD["LocalityVerified (admin)"]
    LVD --> ACT["UserActivated<br/>(prereqs: agreement + basics + locality)"]
    B --> O["AI interview → OnboardingCompleted<br/>(required by default in production;<br/>decoupled from activation — D42)"]
    O --> SEED["Seeds user model (async projector)"]
    ACT -.-> DEL["Account deletion / export →<br/>UserKeyShredded — mechanism TBD (Group 1)"]:::tbd
```

---

## 3. Event lifecycle

Stored states are command-driven; **in-progress and over are time-derived** from the simulated clock, never stored (`lifecycle-state.mjs`). Change surfaces (edits, suggestions, polls, interest) are open only while proposed/planned. (`event-sourcing.md`, Group 2 code on `main`)

```mermaid
stateDiagram-v2
    [*] --> proposed : EventProposed
    proposed --> planned : EventScheduled (organizer)<br/>or auto-plan at minimumAttendance
    proposed --> cancelled : EventCancelled
    planned --> cancelled : EventCancelled (until start)
    planned --> in_progress : startTime reached — derived
    in_progress --> over : endTime reached — derived
    over --> [*]

    note right of proposed
        Change-open: edits, time/date polls,
        suggestions, interest/confirmations
    end note
    note right of over
        over unlocks attendee debriefs
        and the organizer debrief
    end note
```

**TBD around the event lifecycle** (recognised, not yet designed): **time/place-less proposals — "Anyone into scrabble?" as an idea stage before `proposed`; now first-class in design as the supply loop's bar-free entry point (D51, diagram 9), graduation mechanics still Group 2** (Group 2) · **overlapping same-time RSVPs/confirmations — surface gently, interest-overlap is fine, double-confirm is a reliability problem; scenario-based (accident / indecision / co-located / spam)** (Group 2) · recurring events (Group 7) · richer cancellation flow — what happens to RSVPs and how attendees are notified (Group 2) · interest-before-commitment surfacing (Group 2) · richer event data — images, descriptions, co-organisers (Group 2) · in-progress interaction between confirm and debrief (Group 2) · the real time/place picker behind "suggest change" (Group 2).

---

## 4. Attendee experience — debrief with its three doors

Fast path is taps only (zero LLM calls); depth is one call, and only after a poor experience. Safety and policy are separate calm doors, never mixed into preference signal. (`debrief.md`)

```mermaid
flowchart TB
    classDef tbd stroke-dasharray: 6 4
    classDef door fill:#fdf1f0,stroke:#b05959

    CONF["Confirmed"] -.-> LMC["Last-minute<br/>can't-make-it"]
    CONF --> OVER(["Event over"])
    LMC --> OVER
    OVER --> P["Gentle prompt<br/>(one reminder max)"]
    P -->|ignored| LAPSE["Lapse — weak signal"]
    P --> T0{"Did you go?"}
    T0 -->|no| WHY["What got in the way?<br/>(optional chips)"] --> CL1["Minimal close"]
    T0 -->|yes| T1A["Worth another go?<br/>yes / maybe / not for me"]
    T1A --> T1B["Who did you meet?<br/>→ see again? (positive-only)"]
    T1B --> SAFE["Concerns with anyone's conduct?<br/>→ safety path; preference signal<br/>for this event quarantined"]:::door
    T1B --> T1C["Texture chips<br/>(adaptive opt-in sequence)"]
    T1C --> POL["Not as described /<br/>high pressure? → policy feedback"]:::door
    T1C --> Q{"Poor experience?"}
    Q -->|no| CL2["Minimal close +<br/>standing door: say more"]
    Q -->|yes| T2["One LLM follow-up<br/>to aim better"] --> CL2
    CL2 -. "say more" .-> REFL["Reflection (diagram 5)"]
    CL2 --> REC["DebriefRecorded<br/>+ frozen extracted deltas"]
    REC --> PROJ["Projector → user model"]
    KU["Kudos — past-event surface,<br/>deliberately outside the debrief (v-next)"]:::tbd
    OVER -.-> KU
```

---

## 5. Reflection & coaching — modes and routing

The debrief is information; these are the deeper, opt-in modes it opens a door to. Reflection is dual-scope (D43); nothing leaves it toward another member without explicit consent. (`reflection-and-coaching.md`)

```mermaid
flowchart TB
    classDef tbd stroke-dasharray: 6 4

    IN(["Entry: standing say-more door,<br/>or the user keeps writing (D44)"]) --> R["REFLECTION<br/>user-led; IRL listens and asks;<br/>patterns grounded in the user's own words"]
    R --> D1["Inward —<br/>self-understanding"]
    R --> D2["Process —<br/>event, venue, structure, IRL itself"]
    R --> D3["Outward —<br/>feedback for the organizer"]
    D1 --> M["User model<br/>(private, always)"]
    D2 --> E["Evaluation & improvement:<br/>hypothesis evidence, model evolution,<br/>event/operator register"]
    D3 --> CONSENT{"Explicit in-the-moment consent?<br/>named / anonymous / no"}
    CONSENT -->|yes| ORG["Organizer aggregated<br/>feedback channel"]
    CONSENT -->|no| M
    R -->|"stuck on the negative"| C["COACHING<br/>one modest perspective, frequency-capped,<br/>yields immediately, holds the line"]
    C -.-> SK["Skills development —<br/>conversation-starting first (TBD, D29)"]:::tbd
    R --> REC["ReflectionRecorded<br/>(deltas + routing choices recorded)"]
```

---

## 6. Organizer journey

Two engagement modes kept distinct: **invited** (collaborative, most of it) and **required** (gates). Trust-graduated — support and scrutiny scale down with track record. (`organizer-engagement.md`, `event-policy.md`)

```mermaid
flowchart LR
    classDef req fill:#fdf1f0,stroke:#b05959
    classDef tbd stroke-dasharray: 6 4

    PRO["Propose event"] --> FRAME["Framing help — invited:<br/>title, intent, audience, structure"]
    PRO --> DISC["Cost disclosure — required:<br/>amount + what it covers"]:::req
    PRO --> POLICY["Policy — required:<br/>honesty + non-coercion"]:::req
    FRAME --> FIRM["Firm up: time/date polls,<br/>suggestion mediation,<br/>minimumAttendance → planned"]
    FIRM --> RUN["Run (in-progress)"]
    RUN --> DONE["Over"]
    DONE --> ODB["Organizer debrief<br/>(OrganizerDebriefRecorded)"]
    ODB --> AGG["Aggregated attendee signal +<br/>consented reflection feedback"]
    ODB --> REG["Event/operator/venue register —<br/>TBD (Group 3)"]:::tbd
    ODB --> RATE["Organising-quality facet"]
    RATE --> TRUST["Trust graduation —<br/>lighter path next time"]
    TRUST --> PRO
    ESC["Escalation ladder (warn → restrict →<br/>remove) — TBD (Group 4 admin)"]:::tbd
    POLICY -.-> ESC
```

---

## 7. Data & projection architecture

One write path; the LLM acts only at command time (frozen deltas ride in events); the projector is pure and replayable. (`event-sourcing.md`, `projection-store.md`, `workshop-mode.md`)

```mermaid
flowchart TB
    classDef store fill:#eef3ee,stroke:#5a7d5a
    classDef tbd stroke-dasharray: 6 4

    CMD["Command handler (API Lambda)"] <--> LLM["Claude, at command time only<br/>(injected seam — deterministic stub<br/>in workshop/test, D37)"]
    CMD --> TX["TransactWriteItems (atomic)"]
    TX --> IC[("irl-commands<br/>idempotency")]:::store
    TX --> LOG[("irl-events-log<br/>+ Streams")]:::store
    TX --> ST[("state tables<br/>irl-users · irl-events · irl-interactions")]:::store
    LOG --> PROJ["Async projector — pure, deterministic:<br/>precedence observed > inferred > stated,<br/>decay anchored to simulatedTime"]
    PROJ --> UM[("irl-user-model<br/>profile-core · interests · affinity ·<br/>rating (access-gated)")]:::store
    UM --> USE["Matching · composition ·<br/>organizer trust · safety review"]
    LOG -. "replay — frozen deltas,<br/>exact for non-shredded aggregates" .-> PROJ
    LOG -. "batched LLM re-extraction<br/>(model evolution) — TBD" .-> PROJ
    SHRED["UserKeyShredded → key destroyed;<br/>model items unreadable, deleted"] --> UM
```

---

## 8. Matching pipeline

Fit-first, bounded soft nudges, a preserved exploration/injection floor; nothing gates except hard constraints and explicit earned thresholds. Affinity nudges consume strength-weighted edges (D47); de-weights are graduated by surface (D49); the floor covers newcomers *and* the re-entering (D48) and, when no well-fitting room exists, routes demand to the supply loop rather than relaxing fit (D51). (`matching.md`, `success-and-progress.md`, `hypotheses.md`)

```mermaid
flowchart LR
    classDef req fill:#fdf1f0,stroke:#b05959

    CAND["Candidate events<br/>and rooms"] --> HC["HARD CONSTRAINTS — filter:<br/>schedule, distance, capacity,<br/>protective blocks (D50)"]:::req
    HC --> FIT["FIT — base score, dominant:<br/>comfort envelope + doors + interests<br/>(works cold, from onboarding)"]
    FIT --> NUD["+ capped nudges:<br/>affinity & crews — edge strength,<br/>never boolean (D47);<br/>welcomer signal"]
    NUD --> DW["− graduated de-weights (D49):<br/>avoidance, didn't-click —<br/>suggestion &lt; injection &lt; composition;<br/>never hard-remove"]
    DW --> EXP["Blend: exploration floor +<br/>injection into well-fitting rooms<br/>(newcomers + re-entering, D48);<br/>floor windowed; debt → human review"]
    EXP --> OUT["Feed / suggestions /<br/>group composition"]
    OUT --> RES["Real-world outcomes:<br/>attend, return, see-again, crews"]
    RES --> IND["Success indicators —<br/>never targets (D39)"]
    IND --> TUNE["Hypothesis-driven tuning (D41):<br/>named tunables, kill criteria"]
    TUNE -.-> NUD
    TUNE -.-> EXP
    EXP -- "fit-gap read: no well-fitting<br/>rooms for a segment —<br/>never relax fit" --> SUP["Supply loop<br/>(diagram 9, D51)"]
```

---

## 9. The supply loop — where events come from

Matching allocates supply; it cannot create it. A standing function at every scale, never a thin-calendar fallback: demand sensed continuously (aggregate, de-identified, minimum-cohort-gated), a bar-free idea stage, bounded invitations, and a quality loop grounded in community signal. (`organizer-engagement.md` → The supply loop, `matching.md`, D51/H7)

```mermaid
flowchart TB
    classDef tbd stroke-dasharray: 6 4

    FG["Fit-gap read (diagram 8) —<br/>segments with scarce<br/>well-fitting rooms"] --> DS["Demand sensing — aggregate,<br/>de-identified, surfaced only above<br/>a minimum-cohort threshold"]
    ES["Event-selection signal —<br/>what tempts, what's missing"] --> DS
    DT["Debrief texture —<br/>'what would've made it easier'"] --> DS
    PRF["Process reflections (D43)<br/>+ explicit wishes"] --> DS
    DS --> ORG["Surfaced to trust-graduated organisers:<br/>'several members are looking for…'<br/>— never who"]
    DS --> INV["Bounded invitation to affected members:<br/>'nothing this week fits — start something?'<br/>(D14/D30: ≤1, earned, never pressure)"]
    INV --> IDEA["Idea stage — bar-free:<br/>'Anyone into scrabble?'<br/>quality bar applies to events, not ideas<br/>(mechanics: Group 2)"]:::tbd
    ORG --> PRO["Propose (diagram 6) —<br/>framing help at firm-up"]
    IDEA -- "interest firms<br/>time/place" --> PRO
    PRO --> EVT(["Events happen"])
    EVT --> QL["Quality loop: aggregated attendee<br/>signal → organiser; event/operator/venue<br/>register; propose-time help grounded in<br/>community outcomes (D27 modesty)"]
    QL --> PRO
```

---

## 10. Avoidance & protection — two tiers, drawn by need

The tier line is drawn by **need, never relationship type** ("ex-spouse" can be an awkwardness or a danger — nobody proves which). Comfort tier is soft and graduated (D49); the safety tier is hard, instant, and above everything (D50 — a commitment, not a hypothesis; mechanism designed in `protective-blocks.md`, D52). (`matching.md`, `user-model.md`, `protective-blocks.md`)

```mermaid
flowchart TB
    classDef req fill:#fdf1f0,stroke:#b05959
    classDef tbd stroke-dasharray: 6 4

    NEED{"Member names a person —<br/>routed by need"} -->|"comfort:<br/>'rather not share a table'"| DNI["DO-NOT-INTERACT (D49)<br/>soft · graduated · symmetric ·<br/>zeroes the pair's affinity nudge"]
    NEED -->|"safety: stalking,<br/>abuse, fear — proof-free"| BLK["PROTECTIVE BLOCK (D50)<br/>hard · instant · silent"]:::req
    DNI --> G1["Feed suggestion: soft de-weight —<br/>floor wins on a thin calendar"]
    DNI --> G2["Injection: steers room choice<br/>when alternatives exist"]
    DNI --> G3["Intimate composition: maximum<br/>de-weight — in practice never composed;<br/>never an advertised guarantee"]
    BLK --> B1["Presence-shielding everywhere:<br/>blocker vanishes from blocked's view;<br/>blocked's event visibility never<br/>conditionally altered — no leak"]:::req
    BLK --> B2["Hard co-placement filter —<br/>above the floor by construction<br/>(diagram 8 hard constraints)"]:::req
    BLK --> B3["Mechanism v1 (D52, protective-blocks.md):<br/>rendered-world rule — counts adjusted,<br/>indistinguishable from leaving;<br/>ordinary-power blocker view,<br/>awareness / peace choice;<br/>block ≠ accusation"]:::req
    B3 -.-> B4["Advocate validation before build;<br/>open: itinerary-alert scope, discovery<br/>escalation, tiny events, support<br/>resources, emergency escalation"]:::tbd
    MIS["Misuse watch: naming-rate outliers →<br/>human review of consequences only;<br/>the protection itself is never weakened"] --- BLK
```

---

## 11. Reading graduation — per member, never per group

Fires only for a member gone quiet *entirely*; classification uses their own signal, never the group's; indicators feed human review, never automated verdicts. (`success-and-progress.md` → Reading graduation, D48/H5)

```mermaid
flowchart TB
    classDef tbd stroke-dasharray: 6 4

    Q["Member goes quiet entirely<br/>(still active elsewhere =<br/>diversified — no read)"] --> CLS{"Per-member classification:<br/>mutuality density · trajectory<br/>completeness · exit pattern"}
    CLS -->|"probable<br/>graduation"| G["Get out of the way.<br/>Never win-back."]
    CLS -->|"probable<br/>left-behind"| LB["Joins the inclusion floor —<br/>re-entry via ordinary matching<br/>(diagram 8); inference never surfaced"]
    CLS -->|ambiguous| AMB["At most: the gentle self-report door —<br/>declining is never signal (D46)"]
    CLS --> HR["Indicators → human review,<br/>never automated verdicts (D39)"]
    G -.-> CI["Contribution invitation — ambient<br/>give-back path, never triggered by<br/>the read (deferred)"]:::tbd
```

---

## TBD inventory (dashed elements, in one place)

| Element | Where it appears | Status |
|---|---|---|
| Kudos (structured encouragement) | 1, 4 | Designed in shape (D45), scheduled v-next |
| Skills development (conversation-starting first) | 5 | First-class capability, own note pending (D29) |
| Batched LLM re-extraction (model evolution) | 7 | Named, uncosted (`projection-store.md`) |
| Event/operator/venue register | 6 | Group 3 |
| Escalation ladder / admin & support UI | 6 | Group 4 |
| Account deletion / export mechanism + key management | 2 | Group 1 — key management **blocks onboarding** (open-risks #3) |
| Time/place-less "idea" proposals ("Anyone into scrabble?") | 3, 9 | First-class in design (D51 — bar-free); mechanics Group 2 |
| Overlapping same-time RSVP/confirm handling (by scenario) | 3 | Group 2 |
| Recurring events, cancellation flow, interest surfacing, richer event data, suggest-change picker | 3 | Group 2 / 7 |
| Crew detection & continuity events | (matching) | Group 3; continuity deferred (D33) |
| Protective-block mechanism | 10 | **Designed** (D52, `protective-blocks.md`); advocate validation before build |
| Contribution invitation (ambient give-back path for graduates) | 11 | Deferred (`success-and-progress.md`) |
| Robot users / automated workshop activity | (workshop) | Deferred until needed (D2/D37) |
| Billing gates · automated locality · minors | — | Groups 5 / 1 / 6 |
