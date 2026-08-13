# Reference Calendar Slice 18A QA

**Evidence date:** 2026-08-13

**Branch:** `codex/ranger-outpost-slice-18a`

**Base:** `cf009091f83474eec3327a7d9c970c86bd661680` (committed Slice 11 checkpoint)

## Cohort and sources

- Existing published cohort: 8 occurrences in 7 series from 5 distinct organizer URLs; national 5, district 2, FCF 1, region 0.
- Source recheck: 12 first-party source documents/endpoints. Exact source groups and links are recorded in [`../research/royal-rangers-event-sources.md`](../research/royal-rangers-event-sources.md).
- Source-controlled expansion: 2 additional national occurrences, sharing the existing JBEI and NRMC series identities. After Operator review and publication, the bounded cohort would contain 10 occurrences in 7 series: national 7, district 2, FCF 1, region 0.
- The region count remains zero intentionally. The reviewed region pages do not support a genuinely region-scoped current occurrence with complete dates; the existing regional coverage gap remains open.
- Source monitoring remains disabled (`sourceMonitors: 0`), and all seven local maintenance jobs remain disabled. No remote staging, publishing, monitor activation, D1 write, or production action was performed.

## Review-path evidence

`npm run events:validate` validated the two-candidate manifest. The CLI hard-limits a manifest to 50 candidates, creates canonical `draft` event records through the existing Operator record API, and opens declared conflicts through the existing conflict API. It has no publication operation.

Manifest tests cover full field provenance, checked-date consistency, duplicate candidate/slug/occurrence identity, bounded batches, and draft-only conversion. Slice 18A also adds focused tests for date-only timezone boundaries, cancelled/postponed/completed view behavior, and recurring-series occurrence identity. Existing event/API/maintenance suites continue to cover public conflict masking, required-fact conflict withholding, stale/broken sources, keyset pagination, cache policy, service-worker boundaries, and deterministic completion.

## Browser evidence

The local app was checked in the in-app browser at `http://127.0.0.1:5173/events`.

- Route title: `Reference Calendar | Ranger Outpost Hub`.
- The page explicitly says `This is not an Outpost Calendar.`
- Upcoming view rendered 6 bounded results across national, district, and FCF scopes, including a cancelled future occurrence and an event with `Details under verification: endTime`.
- Search input retained keyboard focus while filtering `Kentucky`; the result announcement changed to `Showing 2 events`. Switching to Past and completed updated it to `Showing 0 events` for that filter.
- At 390 × 844 CSS pixels, the page had no horizontal overflow; main content measured 375 pixels wide. The skip target remained programmatically focusable (`tabindex=-1`).
- Public `/api/public/events?limit=2` returned `Cache-Control: public, max-age=60, stale-while-revalidate=300`; Operator `/api/operator/snapshot` returned `Cache-Control: no-store`.
- The recheck found two already-published facts that now need Operator review: NEEC changed to cancelled on 2026-08-13, and the North Texas October 6 date is a price-change cutoff rather than a registration deadline. This branch does not silently mutate or remotely publish either fact.

## Verification

All required local gates passed:

- `npm run db:verify`
- `npm run maintenance:local:status`
- `npm run scale:check`
- `npm run test:integration` (57 tests)
- `npm run check` (222 tests, lint, typecheck, production build)
- `npm run events:validate`
- `git diff --check`

## Deferred Slice 18 work

Blocked on Slices 16–17: selecting reference events for an outpost plan; member-only Outpost Calendar views; outpost-created events; attendance; RSVPs; reminders; and notifications.
