# Outpost Workspace calendar QA — 2026-08-13

## Automated evidence

- `shared/outpost-workspace-calendar.test.ts` verifies explicit IANA timezone validation, small allowlisted group-plan input, date/time ordering, and rejection of roster-style fields.
- `worker/outpost-workspace-calendar-repository.test.ts` verifies exact-Outpost read versus independent editor authority, create/range/update/cancel behavior, optimistic concurrency, immutable sanitized events, IDOR resistance, revocation, replay safety, bounded ranges, archived read-only behavior, and group-history survival after Account deletion.
- `npm run db:verify` covers populated upgrade from `0014`, fresh install through `0015`, migration assertions, parity, and foreign-key integrity.
- `npm run scale:check` uses 50,000 Accounts, at least 20,000 Outposts, 10,000 Workspaces, and 100,000 Calendar Entries and records indexed exact-member, editor-authority, and bounded-range plans.
- `npm run test:integration`, `npm run check`, and `git diff --check` are required before handoff.

## Browser evidence and limitations

The production client build was opened at `/workspace` in the in-app browser. Anonymous access rendered the non-enumerating “Workspace unavailable” state with an Account link and no private identifiers. The page produced no console warnings or errors and no horizontal overflow at 320, 390, 768, or 1280 CSS-pixel viewport widths. DOM checks found one main landmark, navigation, 21 keyboard-focusable controls/links, zero unlabeled form controls, zero missing image alternatives, and zero duplicate IDs. `tests/sw-policy.test.js` separately proves both workspace pages and APIs are excluded from Cache Storage.

Authenticated member/editor UI flows and a full axe scan were not run in the browser because the isolated preview did not contain a provisioned verified Membership session; their authorization and timezone/create/edit/cancel behavior is covered at the real HTTP and SQLite-backed repository interfaces. This is the remaining manual acceptance limitation. Month-grid navigation, recurrence, Reference Calendar linking, ICS, reminders, external synchronization, rosters, attendance, RSVP, youth data, and individual plans are intentionally absent. No production mutation or external notification was performed.
