# Audit log

The Register recording each audit execution (methodology
[Article 9](https://github.com/majodali/methodology/blob/main/docs/constitution.md#article-9--audits);
register type introduced in methodology v1.1.0). This is the
machine-readable source for *time of last semantic audit*, which the
Article 9 delta-ratio auto-trigger — and `mtool status`'s delta-ratio
report — require. Adopted at the v1.1.0 migration (2026-08-21);
optional under the migration notes, kept so the trigger is recordable.

Entry format: `date — kind (form | semantic) — scope — outcome —
findings pointer (or —)`.

- 2026-08-21 — form — full repo vs pinned v1.1.0, owner-run
  (family-wide sweep with in-real-life-ops and in-real-life-org, both
  clean) — one finding: no root `README.md` (W-007; the orientation
  README had been living as the design-notes index at
  `docs/README.md`) — fixed same day: root README added,
  `docs/README.md` renamed to `docs/design-notes.md`, pointers
  updated
