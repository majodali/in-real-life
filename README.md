# in·real·life

A mobile-first web app for a local community meetup platform — live
at [in-real.life](https://in-real.life). Members go through an
AI-guided onboarding interview, discover nearby events and people,
and coordinate real-world meetups. Privacy-focused: first names only,
no messaging — just show up. A not-for-profit: the interaction serves
the member, not engagement.

**For whom**: members of the launch community (Bainbridge Island
first), event organizers, and anyone following how the project is
designed — the design register is public by intent.

**Status**: pre-launch (C2). The backend, matching stack, and
operator tooling are built and exercised in workshop mode; soft open
is the C3 promotion gate.

## Where the documentation lives

Everything authoritative is under `docs/`
([methodology](https://github.com/majodali/methodology) K-001):

- [`docs/classification.md`](docs/classification.md) — the binding
  methodology declaration (C2 / S2 / web-app / serverless-aws,
  pinned v1.1.0)
- [`docs/backlog.md`](docs/backlog.md) — the source of truth for
  progress: what's built, what's next
- [`docs/design-notes.md`](docs/design-notes.md) — the index to the
  design notes: how every piece fits, reading order, cross-cutting
  principles
- [`docs/decisions.md`](docs/decisions.md) — the decision register
  (D1–D68), with companion registers for risks, radar, hypotheses,
  and feedback

## Repo family

Three repos, one project:

- **[in-real-life](https://github.com/majodali/in-real-life)** (this
  repo, public) — the app, infrastructure constructs, and design docs
- **in-real-life-ops** (private) — deployment and operations:
  environment registry, `irl-ops` CLI, runbooks
- **in-real-life-org** (private) — organization and governance
  (existence public, content private — the O1 boundary)

## Development

Plain HTML/CSS/JS with ES modules, no build step (`src/`); backend is
AWS CDK + Lambda + DynamoDB (`infrastructure/`). Local preview, test,
and deploy instructions: `CLAUDE.md` and `docs/` — unit tests via
`npm test`, functional tests against a deployed test stack via
`npm run test:functional` (both in `infrastructure/`).
