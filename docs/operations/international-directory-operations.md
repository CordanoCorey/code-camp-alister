# International directory candidate operations

Date: **2026-08-13**

## Safe commands

```powershell
npm run international:manifests:build
npm run international:validate
npm run international:stage -- --origin http://127.0.0.1:5173
npm run international:report
npm run international:coverage:report
```

Build, validation, and reporting are read-only. `international:stage` submits the validated manifests to the authenticated Operator endpoint. Staging is checksum-idempotent and writes only private international batch, candidate, field-evidence, and scoped-match rows. It cannot convert or publish.

Every retained candidate remains private review material. An Operator must inspect every cited page, decide duplicate/correction evidence, convert through the authenticated Operator workspace, preview, and separately publish. A source change creates review work only.

## Slice 14 shape gap resolved by migration 0014

Migration 0013 models canonical `countries`, `national_programs`, civil geographies, source-native identifiers, and affiliations. It does not model a private candidate for a Country or National Program. The existing `staged_outpost_candidates` table also requires a canonical `civil_geography_id`; the USA staging code resolves only an already-existing USA geography. Finland (`FI`) and South Africa (`ZA`) are absent from migration 0013.

Migration `0014_international_candidate_review.sql` adds private, country-scoped batch/candidate/evidence/match tables. Staging does not create canonical Country, National Program, civil geography, or Outpost rows. Only the Operator's reviewed **Convert to draft only** action creates those canonical identities and a private draft. Publication remains the separate existing preview/publish action.

## Post-Slice-12 integration

After Slice 12 production evidence is complete:

1. Fetch the exact released Slice 12 commit.
2. Rebase `codex/ranger-outpost-slice-15` onto that exact commit, preserving migrations 0013 and 0014 byte-for-byte.
3. Resolve application conflicts in favor of released production bindings and configuration.
4. Confirm migrations 0001-0012 are byte-for-byte unchanged and 0013-0014 are the only new migrations.
5. Run `npm run db:verify`, `npm run scale:check`, `npm run test:integration`, `npm run check`, the three international commands, and `git diff --check`.
6. Take the required D1 Time Travel bookmark, apply migrations 0013 then 0014 through the normal release procedure, and only then use the single authenticated Operator identity for approved private staging.

Do not squash or renumber 0013 or 0014. Do not modify or bypass Access, Turnstile, Resend, Cron, secrets, production bindings, or deployment controls.
