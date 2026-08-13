# Code Handoff: Slice 18B — Add Reference Calendar Events to Private Outpost Plans

## Coding Agent Prompt

Complete Slice 18B by connecting one public Reference Calendar occurrence to one Outpost's private group plan without turning the public event into an RSVP, attendance record, or disclosure of Outpost intent. This checkout already contains a Slice 18B checkpoint; inspect, test, and integrate it rather than duplicating working code.

Before editing code:

- Read any `AGENTS.md` instructions supplied with the checkout or task. No repository-local `AGENTS.md` existed when this handoff was written.
- Read `CONTEXT.md`, especially Event Occurrence, Reference Calendar, Outpost Calendar, Reference Event Plan, Reference Event Snapshot, and Plan Review State.
- Read `docs/MVP.md`.
- Read `docs/adr/0002-separate-reference-and-outpost-calendars.md`.
- Read `docs/adr/0021-separate-membership-position-and-exact-scope-authority.md`.
- Read `docs/adr/0022-keep-outpost-calendar-group-owned-and-exact-scope.md`.
- Read `docs/adr/0023-link-public-event-truth-to-private-outpost-intent.md`.
- Read `docs/operations/outpost-workspace-calendar.md` and `docs/operations/reference-event-outpost-plans.md`.
- Read `docs/qa/reference-calendar-slice-18a.md`, `docs/qa/outpost-workspace-calendar.md`, and `docs/qa/reference-event-outpost-plans.md`.

Run `git status --short` first. Do not implement in an unresolved merge or overwrite unrelated work. The snapshot used for this handoff had unresolved conflicts and the current Slice 18B schema file was `migrations/0017_reference_event_outpost_plans.sql`, while older QA text still referred to `0016`. Establish the final append-only migration order before changing health checks, scripts, or evidence.

## What To Do

Allow an authorized exact-Outpost calendar editor to add a published Reference Calendar occurrence to that Outpost's private Calendar as a Reference Event Plan, review material changes in public facts, explicitly accept a refreshed snapshot, update the Outpost's private planning status, and detach or cancel the relationship without changing public event truth.

Target type: vertical slice completion and integration audit.

## Why This Target

The slice connects public discovery to private group planning through a narrow, independently testable transaction. A bounded snapshot preserves what the Outpost planned against, while explicit review prevents later public edits from silently changing private intent.

## Source Artifacts

- Domain language: `CONTEXT.md`
- Product scope: `docs/MVP.md`
- Decisions: ADRs 0002 and 0021–0023 under `docs/adr/`
- Operations: `docs/operations/outpost-workspace-calendar.md`, `docs/operations/reference-event-outpost-plans.md`
- Prior QA/checkpoints: `docs/qa/reference-calendar-slice-18a.md`, `docs/qa/outpost-workspace-calendar.md`, `docs/qa/reference-event-outpost-plans.md`
- Event-source research: `docs/research/royal-rangers-event-sources.md`
- Standalone PRD: none; use the explicit target and inline issue brief below.
- Issue document: none; use the inline issue brief below.
- Prototype: none found.

## Inline Issue Brief

### What to build

Complete or validate the public-event-to-private-plan flow across the public Event detail, private workspace, Worker boundary, D1 transaction, review comparison, and privacy/cache contracts.

### Acceptance criteria

- [ ] Public Event pages and APIs remain account-free and reveal no plan lookup, count, Outpost ID, note, Membership, Permission Grant, or indication that any Outpost plans to attend.
- [ ] A current exact-Outpost Member with `view-outpost-private` can read only that Outpost's Reference Event Plans; add, status, refresh, detach, and cancellation additionally require exact-scope `manage-outpost-calendar`.
- [ ] An editor can add only a published canonical content/Event Occurrence tuple with no blocking required-fact conflict.
- [ ] Add creates the Outpost Calendar Entry and Reference Event Plan atomically, uses a per-Outpost idempotency key, and leaves at most one active plan for the same Outpost/occurrence.
- [ ] The Reference Event Snapshot contains only the documented allowlist of public organizer facts plus source/version check metadata; it contains no registration credentials, cookies, payment data, roster data, or arbitrary public response copy.
- [ ] A material public schedule, timezone, lifecycle, location, registration, required-conflict, or publication change produces a bounded `review-required` comparison without automatically rewriting the local entry or the Outpost's private status.
- [ ] Explicit refresh accepts only currently valid public facts into the snapshot. It does not rewrite local dates, local timezone, local location, or planning status.
- [ ] An editor can move through the documented private plan statuses with optimistic concurrency and sanitized immutable history.
- [ ] Detach preserves historical evidence and either retains the local group entry or cancels it according to the explicit editor choice; routine hard deletion is absent.
- [ ] Public and private pages explain the distinction between organizer facts and Outpost intent in plain language; the flow works by keyboard and reflows without horizontal overflow at 320, 390, 768, and 1280 CSS pixels.
- [ ] Every private response is `private, no-store`, service-worker policy excludes all workspace routes, and public DTOs are byte-for-byte independent of ordinary cookies/private plan state.
- [ ] Migration upgrade/fresh-install checks, repository/HTTP tests, production schema health, scale query plans, README/MVP status, operations, QA, and integration script lists all use the final migration identity.
- [ ] Existing Slice 17 calendar behavior and public Reference Calendar behavior still pass.

### Out of scope

- Organizer registration, RSVP, attendance, headcount, youth information, transportation, lodging, medical data, or payment handling.
- Automatic acceptance of changed public facts or automatic changes to Outpost intent.
- Notifications and reminders; those belong to Slice 19.
- Recurrence, external calendar synchronization, or copying protected event/program materials.
- Publishing or staging new Event candidates merely to exercise this flow.

## Domain Language

- `Reference Calendar` is public cross-Outpost event truth; it is not an Outpost Calendar.
- `Reference Event Plan` is private Outpost intent; it is not an RSVP, registration, attendance, or organizer confirmation.
- `Reference Event Snapshot` is the bounded private copy of the public facts accepted by the Outpost.
- `Plan Review State` asks an authorized editor to review; it is not an automatic plan update.
- Use `Event Occurrence` for the dated occurrence and preserve recurring-series identity.

## Decisions That Must Hold

- Public Reference Calendar facts and private Outpost intent stay separate. Source: ADR 0002.
- Private reads and writes use exact-Outpost Membership/Permission Grant checks with no scope inheritance. Source: ADRs 0021 and 0022.
- The relationship uses a dedicated plan plus bounded snapshot and explicit acceptance. Source: ADR 0023.
- Public maintenance cannot silently change private local scheduling or disclose selected Events. Source: ADR 0023 and `CONTEXT.md`.

## Relevant Code Map

- `migrations/0016_outpost_workspace_calendar.sql`: current prerequisite name in the handoff snapshot; confirm final sequence.
- `migrations/0017_reference_event_outpost_plans.sql`: current Slice 18B schema name in the handoff snapshot.
- `shared/events.ts`: public occurrence/lifecycle rules.
- `shared/reference-event-plan.ts`: private status, input, and material-change classification.
- `shared/outpost-workspace-calendar.ts`: local entry rules.
- `worker/reference-event-plan-repository.ts`: public-fact allowlist, atomic add, comparison, refresh, status, and detach behavior.
- `worker/outpost-workspace-calendar-repository.ts`: exact-scope access and local entry persistence.
- `worker/outpost-workspace-calendar-http.ts`: private route boundary.
- `worker/content-repository.ts` and `worker/index.ts`: public event projection, route dispatch, schema health, and privacy/logging boundary.
- `src/App.tsx`: public Event detail and private add action.
- `src/workspace/OutpostWorkspacePage.tsx`: private plan summary, comparison, status, refresh, and detach UI.
- `src/data/client.ts`: public/private DTOs and mutations.
- `data/events/reference-calendar-2026.json` and `scripts/event-candidate-cli.mjs`: reviewed Slice 18A candidate input; do not publish as part of 18B.
- `public/sw-policy.js`, `public/sw.js`, and `tests/sw-policy.test.js`: public/private cache contract.
- `scripts/verify-migrations.mjs`, `scripts/scale-check.mjs`, `scripts/production-integrity.sql`, `scripts/production-smoke.mjs`, and `package.json`: release gates.

## Implementation Guidance

- First determine whether the checkpoint already satisfies each criterion. Add tests for gaps before changing behavior.
- Fetch the current public occurrence server-side from canonical typed tables. Do not trust a client-supplied event snapshot, title, date, URL, scope, or Outpost ID.
- Keep snapshot fields explicitly allowlisted. Do not serialize an entire public DTO into private storage.
- Keep local Outpost entry fields distinct from refreshed organizer facts. A comparison may explain drift but cannot decide whether the Outpost attends.
- Reuse the Slice 17 authorization and transaction conventions; do not create a parallel weaker workspace boundary.
- Update QA with newly observed evidence and current test counts. Do not preserve the existing browser narrative as if it were rerun.

## Test Plan

Use TDD for any missing behavior:

1. Add a failing classification, repository, HTTP, public-leakage, or browser test.
2. Implement the smallest code needed to pass.
3. Re-run Slice 17 and public Event regression tests.
4. Exercise the real local Worker/browser with synthetic exact-Outpost member/editor fixtures.

Required focused checks:

```powershell
npx vitest run shared/events.test.ts shared/reference-event-plan.test.ts worker/reference-event-plan-repository.test.ts worker/outpost-workspace-calendar-repository.test.ts worker/outpost-workspace-calendar-http.test.ts worker/index.test.ts tests/sw-policy.test.js
npm run events:validate
npm run db:verify
npm run scale:check
npm run test:integration
npm run check
git diff --check
```

If the final merged `package.json` does not contain `events:validate`, restore the reviewed script integration rather than changing this command to bypass validation.

Browser verification must cover anonymous public Event behavior, ordinary member read-only behavior, exact-Outpost editor add/replay/status/review/refresh/detach paths, wrong-Outpost denial, revocation on the next request, narrow-screen reflow, keyboard/focus, console output, automated accessibility supplement, and Cache Storage exclusion.

## Risks / Open Questions

- This handoff was written during a conflicted Slice 18B branch. Reconcile migration renames, health markers, scripts, and integration tests before accepting any existing QA claim.
- Public source rechecks found candidate fact corrections in Slice 18A. Those require the normal Operator review/publication path and must not be silently bundled into private-plan implementation.
- The existing review queue is bounded and evaluated on read. Slice 19 may create notifications from these transitions, but Slice 18B must not introduce an unreviewed scheduler or delivery channel.

## Expected Final Response From Coding Agent

Summarize:

1. Which existing Slice 18B parts were retained and which gaps were fixed.
2. The final migration identity and updated release-gate/document references.
3. Automated and authenticated browser checks that passed.
4. Any remaining production-only, source-review, or accessibility limitation.
