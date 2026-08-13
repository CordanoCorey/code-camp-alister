# International directory candidate operations

Date: **2026-08-13**

## Safe commands

```powershell
npm run international:manifests:build
npm run international:validate
npm run international:report
```

These commands parse the source-controlled files in `data/international-outposts`, enforce bounded country-scoped candidates and field provenance, and print an honest report. They do not connect to D1, stage, convert, publish, monitor, or change a factual record.

Every retained candidate remains private review material. An Operator must inspect every cited page, decide duplicate/correction evidence, convert through the authenticated Operator workspace, preview, and separately publish. A source change creates review work only.

## Blocking Slice 14 shape gap

Migration 0013 models canonical `countries`, `national_programs`, civil geographies, source-native identifiers, and affiliations. It does not model a private candidate for a Country or National Program. The existing `staged_outpost_candidates` table also requires a canonical `civil_geography_id`; the USA staging code resolves only an already-existing USA geography. Finland (`FI`) and South Africa (`ZA`) are absent from migration 0013.

Consequently, staging this cohort through the existing endpoint would require creating canonical Country/National Program/geography facts before human review, violating the rule that every candidate begins private. Reusing unrelated staged columns or silently inserting canonical facts would also destroy country-defined semantics. No migration 0014 was invented. Operator staging and draft conversion for the international manifests are blocked until the owner approves a private country/program candidate representation or narrows the cohort to already-canonical countries.

## Post-Slice-12 integration

After Slice 12 production evidence is complete:

1. Fetch the exact released Slice 12 commit.
2. Rebase `codex/ranger-outpost-slice-15` onto that exact commit, preserving migration 0013 byte-for-byte.
3. Resolve application conflicts in favor of released production bindings and configuration.
4. Confirm migrations 0001-0012 are byte-for-byte unchanged and 0013 is the only new migration.
5. Run `npm run db:verify`, `npm run scale:check`, `npm run test:integration`, `npm run check`, the three international commands, and `git diff --check`.
6. Take the required D1 Time Travel bookmark, apply migration 0013 through the normal release procedure, and only then use the single authenticated Operator identity for approved private staging.

Do not squash or renumber 0013. Do not modify or bypass Access, Turnstile, Resend, Cron, secrets, production bindings, or deployment controls.
