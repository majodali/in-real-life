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

(no audits recorded yet — the first entry lands with the first audit
run)
