# Outpost Workspace calendar QA — 2026-08-13

## Automated evidence

- `shared/outpost-workspace-calendar.test.ts` verifies explicit IANA timezone validation, small allowlisted group-plan input, date/time ordering, and rejection of roster-style fields.
- `worker/outpost-workspace-calendar-repository.test.ts` verifies exact-Outpost read versus independent editor authority, create/range/update/cancel behavior, optimistic concurrency, immutable sanitized events, IDOR resistance, revocation, replay safety, bounded ranges, archived read-only behavior, and group-history survival after Account deletion.
- `npm run db:verify` covers populated upgrade from `0014`, fresh install through `0015`, migration assertions, parity, and foreign-key integrity.
- `npm run scale:check` uses 50,000 Accounts, at least 20,000 Outposts, 10,000 Workspaces, and 100,000 Calendar Entries and records indexed exact-member, editor-authority, and bounded-range plans.
- `npm run test:integration`, `npm run check`, and `git diff --check` are required before handoff.

## Browser evidence and limitations

Browser QA covers the member agenda, editor timezone/create/edit/cancel flow, denied access, responsive widths, keyboard/focus, axe, console output, and Cache Storage exclusion. Month-grid navigation, recurrence, Reference Calendar linking, ICS, reminders, external synchronization, rosters, attendance, RSVP, youth data, and individual plans are intentionally absent. No production mutation or external notification is performed.
