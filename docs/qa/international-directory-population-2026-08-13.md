# International directory population QA — 2026-08-13

## Exact source-controlled cohort

- Manifests: 5
- Candidates: 9, all private draft-only review material
- Countries / National Programs: 5 / 5
- Country counts: DE 1, FI 2, GB 1, MY 2, ZA 3
- RRI displayed grouping counts: Africa 3, Asia Pacific 2, Europe 4
- Coverage states: accepting verified submissions 5
- Publish-ready: 0
- Conflicts retained in cohort: 0
- Explicit country coverage gaps: 5

The source register is `docs/research/international-directory-initial-cohort.md`. Malaysia Kuala Lumpur#1 and Selangor#1 have current-operation evidence. The Slice 14 Malaysia Selangor#6, Germany RR150, and UK Wales 01 fixtures remain private historical/model drafts.

## Automated evidence

- `npm run international:validate`: 5 manifests and 9 candidates validated.
- `npm run international:report`: exact counts above reproduced deterministically.
- `vitest run shared/international-outpost-manifest.test.ts`: 6 tests passed, covering valid country scope plus rejection of inconsistent country scope, private fields, missing provenance, oversized batches, and inconsistent FCF state.

Full repository gates and browser QA must be rerun after the staging-shape blocker is resolved. No Operator candidate conversion was represented as passing, and no browser publication flow was exercised.

## Privacy and mutation evidence

The manifests contain no personal email, personal phone, leader name, roster, attendance, coordinates, account identity, private note, IP address, challenge data, or secret. No production endpoint, remote migration, source monitor, Operator staging action, draft conversion, or publication was invoked.
