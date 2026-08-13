# International directory foundation QA

## Evidence and fixture boundary

- Primary-source findings: `docs/research/international-directory-country-structures.md`.
- Malaysia proves state/federal-territory identifiers, country-defined districts, and explicitly available FCF.
- Germany proves local terminology (`Distrikt`, `Stammposten`) and a prefixed Unicode-capable identifier model.
- United Kingdom proves sparse/unknown parent structure and a source identifier whose country label must not be discarded.
- Fixture local units remain non-public drafts because their sources do not establish current operation. Slice 15 must reverify a local unit before publication.

## Manual browser checklist

1. Open Find an Outpost on desktop and mobile widths; switch between USA and International using keyboard-accessible radio controls.
2. Confirm USA retains the state/territory filter and International instead shows a country control.
3. Confirm an International country with no published listings produces the incomplete-coverage empty state without false blank subdivision text.
4. In Operator preview, inspect Malaysia and Germany/UK fixture drafts and confirm source-native labels and identifiers, country labels, optional address fields, and country-defined affiliations.
5. Edit an international draft through the normalized Operator record endpoint; confirm provenance is required for every populated published field and the response is private/no-store.
6. Search ordinary-account matches in Malaysia, Germany, and the UK. Confirm only same-country publicly eligible listings could match; unmatched claims remain private.
7. Confirm public API responses remain cacheable while Account and Operator routes remain `private, no-store` and are excluded by the service worker.

## Required automated checks

`npm run db:verify`, `npm run scale:check`, `npm run test:integration`, `npm run check`, and `git diff --check`.
