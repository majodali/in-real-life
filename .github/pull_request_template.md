<!-- PR template with verification checklist (methodology practice D2),
     adapted to this project's test ladder. -->

## Summary

<What this PR delivers and why; the D-rows / register rows it lands.>

## Changes

<Bullet list of the concrete changes.>

## Which tests cover this

<Name the rungs exercised and any gaps:
 - Unit — co-located `*.test.mjs` (`npm test` in `infrastructure/`)
 - Synthesis — `npx cdk synth` for infrastructure changes
 - Functional — runs post-merge against the deployed IrlStackTest (the
   chosen process): name what the suite will exercise, or the coverage
   gap a follow-up closes
 - Workshop manual check, where a screen/flow changed>

## Notes

<Decisions recorded, register rows touched, backlog updates in this
commit (W-003), follow-ups added rather than silently done.>
