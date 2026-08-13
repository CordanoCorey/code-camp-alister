# Code Handoff: Slice 17 — Private Outpost Workspace and Calendar

## Coding Agent Prompt

Complete Slice 17 as one end-to-end private Outpost Workspace and group-owned Outpost Calendar. This checkout already contains a Slice 17 checkpoint, so inspect and preserve correct existing behavior instead of rebuilding it. Treat the slice as complete only after the implementation, migration sequence, documentation, automated checks, and authenticated browser flow agree.

Before editing code:

- Read any `AGENTS.md` instructions supplied with the checkout or task. No repository-local `AGENTS.md` existed when this handoff was written.
- Read `CONTEXT.md`, especially Account, Outpost Membership, Permission Grant, Outpost Workspace, Outpost Calendar, Outpost Calendar Entry, and Calendar Entry Event.
- Read `docs/MVP.md`.
- Read `docs/adr/0021-separate-membership-position-and-exact-scope-authority.md`.
- Read `docs/adr/0022-keep-outpost-calendar-group-owned-and-exact-scope.md`.
- Read `docs/operations/membership-and-permissions.md` and `docs/operations/outpost-workspace-calendar.md`.
- Read `docs/qa/membership-and-permissions.md` and `docs/qa/outpost-workspace-calendar.md`, but verify their claims against the current code and migration numbering.

Run `git status --short` first. Do not implement in an unresolved merge or overwrite unrelated work. The snapshot used to prepare this handoff had unresolved merge conflicts and had renamed the Slice 17 migration to `migrations/0016_outpost_workspace_calendar.sql`, while older QA text still referred to `0015`. Resolve the branch integration separately, then use the final append-only migration order everywhere.

## What To Do

Deliver one private workspace for one canonical Outpost and a bounded agenda-style group calendar that verified adult Members of that exact Outpost can view. Only an Account with the independent exact-scope `manage-outpost-calendar` Permission Grant may set the workspace timezone or create, edit, and cancel entries.

Target type: vertical slice completion and integration audit.

## Why This Target

This is the smallest useful private collaboration boundary. It proves the Slice 16 Membership and Permission Grant model through a real member-visible workflow without introducing rosters, individual schedules, attendance, or youth data. Slice 18B and later leader tools depend on this boundary remaining exact-scope, private, and group-owned.

## Source Artifacts

- Domain language: `CONTEXT.md`
- Product scope: `docs/MVP.md`
- Decisions: `docs/adr/0021-separate-membership-position-and-exact-scope-authority.md`, `docs/adr/0022-keep-outpost-calendar-group-owned-and-exact-scope.md`
- Operations: `docs/operations/membership-and-permissions.md`, `docs/operations/outpost-workspace-calendar.md`
- Prior QA/checkpoint: `docs/qa/membership-and-permissions.md`, `docs/qa/outpost-workspace-calendar.md`
- Standalone PRD: none; use the explicit target and inline issue brief below.
- Issue document: none; use the inline issue brief below.
- Prototype: none found.

## Inline Issue Brief

### What to build

Complete or validate the existing `/workspace` experience and `/api/workspace*` boundary so an eligible exact-Outpost Member can view group plans and an independently authorized exact-Outpost editor can manage them.

### Acceptance criteria

- [ ] An active, email-verified adult Account with an unexpired Ordinary Access Term, active verified Membership for the exact Outpost, and active `view-outpost-private` grant can view only that Outpost's workspace and bounded calendar range.
- [ ] Anonymous, expired, revoked, wrong-Outpost, wider-scope, narrower-scope, Claimed Position, Current Outpost, and client-supplied Outpost ID paths fail closed without revealing whether another workspace or entry exists.
- [ ] An active exact-scope `manage-outpost-calendar` grant is independently required to set an explicit valid IANA timezone and to create, edit, or cancel an entry.
- [ ] Entry input is allowlisted and bounded; date/time ordering is valid; timed and all-day plans retain the workspace timezone; roster, RSVP, attendance, youth-progress, contact, medical, transportation, and private-residence fields are rejected or absent.
- [ ] Creates are replay-safe within the Outpost, updates and cancellation use optimistic versions, cancellation preserves history, and an archived workspace is read-only.
- [ ] Calendar Entry Events use only sanitized durable actor labels such as `Verified Outpost Editor`, `Service Operator`, or `Deleted Account`; no name or email enters group history.
- [ ] Account deletion removes personal Account data without deleting the Outpost's group-owned plans or exposing a former editor identity.
- [ ] Every workspace page/API response is private and `no-store`; service-worker policy excludes `/workspace` and `/api/workspace*`; public DTOs, search, logs, metadata, analytics, and notification previews contain no private plan data.
- [ ] The member and editor flows work with keyboard navigation and responsive reflow at 320, 390, 768, and 1280 CSS pixels, with labelled controls, visible focus, useful status/error output, and no serious automated accessibility findings.
- [ ] Migration verification passes for both a populated upgrade and a fresh install using the final migration number; operations, QA, `docs/MVP.md`, health checks, integration lists, and README status do not retain stale migration references.
- [ ] Existing public, Account, Membership, Permission Grant, and Operator behavior still passes.

### Out of scope

- Reference Calendar linking; that is Slice 18B.
- Recurrence, ICS/external synchronization, reminders, and notifications.
- Personal calendars, month-grid parity, RSVPs, attendance, headcounts, rosters, youth records, transportation, medical data, or advancement progress.
- Building a new general Membership or permission-administration UI beyond what this calendar needs.
- A Service Operator recovery mutation unless it is added through the existing Operator authorization and Privileged Access Event controls; never weaken ordinary Membership authorization to simulate recovery.

## Domain Language

- `Outpost Workspace` is the private collaboration boundary owned by one canonical Outpost.
- `Outpost Calendar Entry` is a group-owned plan, not an individual's intent or attendance record.
- `Calendar Entry Event` is sanitized immutable history, not a named member activity log.
- `Outpost Membership`, `Position Verification`, and `Permission Grant` remain independent.
- Avoid `member portal`, `personal calendar`, `RSVP`, and role-name authority.

## Decisions That Must Hold

- Reads require the finalized exact-Outpost Membership plus `view-outpost-private`; writes additionally require `manage-outpost-calendar` for that same exact scope. Source: ADRs 0021 and 0022.
- Scope does not inherit and Claimed Position or Current Outpost grants nothing. Source: ADR 0021 and `CONTEXT.md`.
- Plans belong to the Outpost and contain no individual or youth data. Source: ADR 0022 and `CONTEXT.md`.
- Private responses are never public-cache or offline-cache candidates. Source: existing operations and QA docs.

## Relevant Code Map

- `migrations/0015_membership_and_permissions.sql`: current prerequisite name in the handoff snapshot; confirm final sequence after merge.
- `migrations/0016_outpost_workspace_calendar.sql`: current Slice 17 schema name in the handoff snapshot; do not renumber an already-applied migration.
- `shared/membership-permissions.ts`: exact-scope permission primitives.
- `shared/outpost-workspace-calendar.ts`: calendar categories, statuses, input validation, and timezone rules.
- `worker/outpost-workspace-calendar-repository.ts`: server-derived access, persistence, optimistic concurrency, and history.
- `worker/outpost-workspace-calendar-http.ts`: private request boundary and headers.
- `worker/index.ts`: route dispatch, schema health marker, logging, and SPA/private-route policy.
- `src/workspace/OutpostWorkspacePage.tsx`: member/editor workspace UI.
- `src/data/client.ts`: private workspace DTOs and API calls.
- `src/App.tsx` and `src/App.css`: routing, navigation, shell, responsive, print/cache-adjacent styles.
- `public/sw-policy.js`, `public/sw.js`, and `tests/sw-policy.test.js`: cache exclusion contract.
- `scripts/verify-migrations.mjs`, `scripts/scale-check.mjs`, and `package.json`: migration, scale, and gate integration.

## Implementation Guidance

- Start with the existing tests and code. If the complete implementation is present, perform a completion audit and fix only demonstrated gaps, stale integration, or stale documentation.
- Derive Outpost and permissions from the authenticated server session on every request. Do not accept authority, Account ID, or Outpost ID from the client.
- Keep domain validation in plain TypeScript and Worker/React details at narrow adapters.
- Use existing D1 transaction, idempotency, cursor/range, sanitized-event, private-header, and error-response conventions.
- Keep the agenda bounded. Do not add recurrence, calendar synchronization, or speculative pagination UI to close this slice.
- Update the QA document with newly observed results; do not preserve old pass counts or browser claims as if rerun.

## Test Plan

Use TDD for any missing behavior:

1. Reproduce the missing or failing acceptance criterion at the shared validator, repository, HTTP boundary, or browser level.
2. Make the smallest implementation change that passes it.
3. Re-run Membership/Permission, workspace, cache-policy, migration, and scale tests.
4. Exercise synthetic exact-Outpost member and editor sessions in the real local Worker/browser flow.

Required focused checks:

```powershell
npx vitest run shared/membership-permissions.test.ts shared/outpost-workspace-calendar.test.ts worker/membership-permissions-db.test.ts worker/outpost-workspace-calendar-repository.test.ts worker/outpost-workspace-calendar-http.test.ts tests/sw-policy.test.js
npm run db:verify
npm run scale:check
npm run test:integration
npm run check
git diff --check
```

For browser verification, run the repository's normal local D1/Worker/Vite flow with synthetic test Accounts only. Check anonymous, member-only, editor, revocation-on-next-request, stale-version, narrow-screen, keyboard, focus, error, and Cache Storage behavior. Never enter real leader/member/youth data.

## Risks / Open Questions

- This handoff was written during a conflicted branch integration. Migration numbers and package-script lists must be reconciled before implementation claims are accepted.
- Existing QA calls the ordinary editor path complete but records missing authenticated axe/browser evidence. Treat that as an explicit remaining acceptance item, not proof that it passed.
- If the final base no longer contains the checkpoint implementation, build the same behavior from these decisions rather than copying stale code blindly.

## Expected Final Response From Coding Agent

Summarize:

1. Which existing Slice 17 parts were retained and which gaps were fixed.
2. The final migration identity and all updated integration/document references.
3. Automated and authenticated browser checks that passed.
4. Any remaining production-only or Operator-recovery limitation.
