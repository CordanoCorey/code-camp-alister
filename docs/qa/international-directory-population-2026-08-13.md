# International directory population QA — 2026-08-13

## Exact source-controlled cohort

- Manifests: 5
- Candidates: 9, all private draft-only review material
- Countries / National Programs: 5 / 5
- Country counts: DE 1, FI 2, GB 1, MY 2, ZA 3
- RRI displayed grouping counts: Africa 3, Asia Pacific 2, Europe 4
- Coverage states: country information available but directory incomplete 5
- Publish-ready: 0
- Conflicts retained in cohort: 0
- Explicit country coverage gaps: 5

The source register is `docs/research/international-directory-initial-cohort.md`. Malaysia Kuala Lumpur#1 and Selangor#1 have current-operation evidence. The Slice 14 Malaysia Selangor#6, Germany RR150, and UK Wales 01 fixtures remain private historical/model drafts.

## Automated evidence

- `npm run international:validate`: 5 manifests and 9 candidates validated.
- `npm run international:report`: exact counts above reproduced deterministically.
- `vitest run shared/international-outpost-manifest.test.ts`: 6 tests passed, covering valid country scope plus rejection of inconsistent country scope, private fields, missing provenance, oversized batches, and inconsistent FCF state.

- Private staging and Operator conversion integration test: checksum replay produced one batch; Finland Country/National Program remained absent until conversion; conversion created a private draft and no public projection.

## Privacy and mutation evidence

The manifests contain no personal email, personal phone, leader name, roster, attendance, coordinates, account identity, private note, IP address, challenge data, or secret. No production endpoint, remote migration, source monitor, Operator staging action, draft conversion, or publication was invoked.

## Browser evidence

Local browser QA used the Slice 15 dev server on `127.0.0.1:5174`:

- Public directory exposed an explicit USA/International path and required a country before international results; no global bare-number list appeared.
- A no-selection/no-listings state clearly said to choose a country and did not imply no Outpost exists.
- The international country control preserved Unicode country labels including Åland Islands, Côte d’Ivoire, Curaçao, Réunion, and São Tomé & Príncipe.
- Keyboard-addressable radios, labelled controls, skip link, source links, and bounded-result wording were present in the accessibility snapshot.
- At a 390×844 mobile viewport, document `scrollWidth` equaled `clientWidth` (375 CSS pixels in the browser), with no horizontal overflow; the skip link remained present.
- The local persistent database did not expose Operator preview authorization, so the Operator visual queue was verified by build/type checks and the authenticated HTTP integration test rather than an unauthenticated browser bypass.
