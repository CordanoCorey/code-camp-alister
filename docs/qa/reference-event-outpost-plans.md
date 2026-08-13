# Reference Event Outpost Plans QA

Date: 2026-08-13

## Automated evidence

- `npm run db:verify`: populated upgrade from 0014 through 0016 and fresh install through 0016; four migration assertions and zero foreign-key failures.
- `npm run events:validate`: two Slice 18A review candidates validated without publication.
- Repository/interface tests cover atomic idempotent add, bounded input, material/non-material classification, unchanged local entry after a public date change, explicit refresh, and stale optimistic writes.
- Existing Slice 17 HTTP tests continue to cover anonymous, ordinary member, exact-Outpost editor, revocation-on-next-request, no-store headers, forged fields, and stale calendar versions.
- Service-worker policy tests cover exclusion of all workspace paths and APIs from Cache Storage.

## Browser evidence

On 2026-08-13 the local in-app browser showed anonymous public Events with zero private actions at 320, 390, 768, and 1280 CSS pixels and no console warnings/errors. An exact-Outpost editor fixture exposed six post-render private actions; adding one occurrence produced one linked agenda item, the saved/current comparison opened, the plan status changed to Confirmed by Outpost, and Detach and cancel removed the active relationship while retaining cancelled history. The workspace was rechecked at all four widths. A 320 px header overflow discovered during this run was fixed and remeasured at 320 px with `scrollWidth` 305 and no overflow. Existing HTTP/repository tests provide the wrong-Outpost, ordinary-member, expiry/revocation, stale-version, and public-cache/privacy checks without relying on browser state.

Keyboard semantics were exercised through labelled roles and controls. No console errors or warnings occurred. Automated service-worker policy tests prove `/workspace` and all `/api/workspace` requests are excluded; the in-app browser's isolated page evaluator did not expose Cache Storage for a redundant live enumeration. An automated axe scan was not available in that browser surface, so semantic DOM inspection plus the existing labelled-control behavior is the remaining accessibility evidence; a dedicated axe rerun remains advisable before production release.

## Limitations

This slice sends no notification and makes no organizer registration. It stores no RSVP, individual attendance, headcount, roster, youth data, transportation, medical, lodging, or registration credential. Review comparison is bounded and evaluated when the private plan or review queue is requested; no production Cron binding or schedule changed.
