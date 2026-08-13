# Code Handoff: Slice 20 — Recurring-Use Leader Tools

## Coding Agent Prompt

Implement Slice 20 as a focused private leader-planning workflow: an Account can save authorized resources for later, and an exactly authorized Outpost leader can build, duplicate, and print one private Meeting Plan using original notes, timed blocks, supplies, Saved Resources, related Merits, and an optional public Event link.

Before editing code:

- Read any `AGENTS.md` instructions supplied with the checkout or task. No repository-local `AGENTS.md` existed when this handoff was written.
- Read `CONTEXT.md`, especially Account, Permission Grant, Merit, Advancement Library, Handbook Listing, Event Occurrence, Meeting Plan, Saved Resource, and Deleted Account.
- Read `docs/MVP.md`.
- Read `docs/adr/0009-link-and-summarize-protected-program-material.md`.
- Read `docs/adr/0014-normalize-the-production-content-model.md`.
- Read `docs/adr/0018-separate-ordinary-authentication-from-operator-access.md`.
- Read `docs/adr/0019-expire-and-delete-ordinary-accounts-after-delivery-based-renewal-notice.md`.
- Read `docs/adr/0021-separate-membership-position-and-exact-scope-authority.md`.
- Read the current Membership, Account, Workspace, Advancement, Handbook, and Event implementation before choosing schema or interfaces.

Run `git status --short` first. Finish or leave any existing merge safely before starting. Determine the next append-only migration number from the final merged history.

## What To Do

Deliver the smallest coherent recurring-use toolset:

1. Save/remove/list private Saved Resources, including Merit/Advancement pages, Events, Handbook Listings, and eligible leader resources.
2. Create/edit/duplicate/print one Account-owned private Meeting Plan for an exact Outpost using structured agenda blocks and references to those authorized resources.

Target type: narrowed vertical slice. “Favorites” and “saved merit resources” are normalized to the existing canonical term `Saved Resource`; “printable plans” means an accessible browser print view in this slice, not a new PDF service.

## Why This Target

Saving a resource and using it in a Meeting Plan creates a repeatable end-to-end leader workflow without copying curriculum, tracking youth progress, or adding a document-generation dependency. Browser printing provides a useful portable plan while keeping the source record private and editable.

## Source Artifacts

- Domain language: `CONTEXT.md`
- Product scope: `docs/MVP.md` and the explicit Slice 20 statement in this handoff.
- Decisions: ADRs 0009, 0014, 0018, 0019, and 0021.
- Public content behavior: current Advancement, Handbook, Event, source, and public-search code plus `docs/MVP.md`.
- Private behavior: current Account, Membership/Permission, Workspace, and deletion operations/QA docs.
- Standalone PRD: none; use the explicit target and inline issue brief below.
- Issue document: none; use the inline issue brief below.
- Prototype: none found.

## Assumptions To Record Before Coding

Meeting Plan ownership and authority are not yet decided in an ADR. Add the missing terms/clarifications to `CONTEXT.md` and write an ADR before the migration. Use these conservative defaults unless newer documentation overrides them:

- A Saved Resource is Account-owned personal state. An active ordinary Account may save an eligible canonical resource; saving does not imply ownership, permission, progress, endorsement, or a durable copy of the resource.
- A Meeting Plan is Account-owned private content associated with one exact Outpost. It is not the group-owned Outpost Calendar and is permanently deleted with its owning Account.
- Creating or editing a Meeting Plan requires an active verified Membership plus an active exact-Outpost `manage-outpost-meeting-plans` Permission Grant. A Claimed Position or Position Verification alone grants nothing.
- The first Slice 20 Meeting Plan is visible only to its owner. Sharing/co-editing is a later explicit decision.
- Printing uses a dedicated HTML route/state and `@media print`. The application does not generate or store a PDF, upload a file, or send a plan to an external service.
- Resource references store stable canonical identifiers and small relationship metadata, not copied page bodies, curriculum, handbook text, artwork, or arbitrary URLs.

If newer docs choose group ownership, collaboration, or a different capability, stop and reconcile that decision before implementing.

## Inline Issue Brief

### What to build

Add private Saved Resource and Meeting Plan persistence, validation, authorized APIs, responsive UI, duplication, and print behavior while reusing the canonical public resource model.

### Acceptance criteria

- [ ] An active ordinary Account can save an eligible published Advancement/Merit page, Event Occurrence, Handbook Listing, or documented leader resource with an idempotent action and later remove it.
- [ ] Saved Resource lists are bounded, private, Account-derived on the server, and show current allowlisted public metadata plus the official/authorized link; they never retain copied protected content.
- [ ] If a referenced public resource is unpublished, archived, replaced, or unavailable, the private list shows a safe unavailable/current-state message and removal action without leaking draft facts or preserving a hidden public-content copy.
- [ ] `Favorite` may be used as concise UI language only if helpful, while code, schema, tests, docs, and accessible names use the canonical `Saved Resource` concept consistently.
- [ ] An active exact-Outpost Member with `manage-outpost-meeting-plans` can create a private Meeting Plan with date, title, theme, bounded timed agenda blocks, original notes, supplies, related Merits, authorized resource references, and an optional public Event Occurrence.
- [ ] Claimed Position, broader-scope grants, wrong-Outpost grants, expired grants, expired Accounts, and client-supplied owner/Outpost IDs do not authorize Meeting Plan access.
- [ ] Meeting Plan input explicitly rejects attendance, Ranger/member identities, youth progress, contact/medical/transportation data, uploads, embedded protected content, and arbitrary HTML/script.
- [ ] Related resources and Merits are selected from canonical IDs server-side. Public labels/links are re-read through allowlisted projections rather than trusted from the client.
- [ ] Update uses optimistic concurrency and create/duplicate actions are replay-safe. Duplicate produces a new independent private plan and does not mutate the source plan.
- [ ] The optional Event link does not create an RSVP, organizer registration, Reference Event Plan, Outpost Calendar Entry, or notification. If those actions are desired, the user must perform them through their authoritative flows.
- [ ] The print view contains the plan title/date/theme, ordered timed blocks, original notes, supplies, and safe resource citations/links; it removes navigation, edit controls, private account chrome, status live regions, and irrelevant UI.
- [ ] Print layout works in portrait and ordinary browser “Save as PDF” output without clipped text, split headings from their first content where practical, invisible URLs, low-contrast ink, or reliance on background color.
- [ ] Meeting Plan and Saved Resource APIs are private and `no-store`, reject cross-origin writes, are excluded from Cache Storage/public search/logs/analytics, and return non-enumerating errors.
- [ ] Account deletion cascades Saved Resources and Meeting Plans completely. No recoverable personal-content tombstone or copied private print artifact remains in D1.
- [ ] List/editor/print states work by keyboard, have useful headings/labels/errors/focus, pass the accessibility supplement, and reflow at 320, 390, 768, and 1280 CSS pixels.
- [ ] Migration upgrade/fresh-install, scale, integration, lint, typecheck, build, browser, print-preview, privacy, and cache checks pass; operations/QA/MVP docs describe the final ownership and limitations.

### Out of scope

- Shared/co-edited plans, comments, messaging, approvals, assignments, attendance, rosters, youth progress, or personal Ranger plans.
- File uploads, copied curriculum/handbooks/worksheets/artwork, arbitrary rich HTML, or externally fetched preview content.
- Server-generated PDFs, emailed plans, cloud-drive export, ICS, external calendar synchronization, or printer integrations.
- Automatic creation of Outpost Calendar Entries, Reference Event Plans, registrations, or notifications.
- Full lesson-plan templates, recurring plan schedules, inventory/purchasing, or hypothetical content licensing.

## Domain Language

- `Saved Resource` is a private bookmark, not a copied resource or progress record.
- `Meeting Plan` is a leader's private agenda with original planning content and authorized references; it is not republished curriculum or attendance.
- `Merit` is the canonical achievement unit; avoid `badge` and `lesson`.
- `Advancement Library` is the public metadata/link collection, not a curriculum mirror.
- `Handbook Listing` is bibliographic metadata plus authorized links, not a hosted book.

## Decisions That Must Hold

- Protected program material is linked and summarized, not copied. Source: ADR 0009.
- Filterable canonical resource facts remain in typed normalized tables; private planning references stable IDs rather than reviving legacy JSON as truth. Source: ADR 0014.
- Ordinary Account identity remains separate from Operator authority. Source: ADR 0018.
- Ordinary private content is permanently deleted at the Account's guarded Deletion Deadline. Source: ADR 0019 and `CONTEXT.md`.
- A position label never grants capability; exact-scope Permission Grants authorize leader writes. Source: ADR 0021.

## Relevant Code Map

- `shared/advancement.ts` and `shared/domain.ts`: current Merit/Advancement/content vocabulary and DTOs.
- `shared/events.ts`: Event Occurrence validation and lifecycle.
- `worker/content-repository.ts`: canonical public content/resource reads.
- `worker/ordinary-auth.ts`, `worker/account-profile-repository.ts`, and `worker/ordinary-account-lifecycle-repository.ts`: Account principal/lifecycle boundary.
- `shared/membership-permissions.ts` and current Membership/permission repositories: exact-Outpost authority.
- `worker/index.ts`: authenticated routing, security headers, schema health, and logging.
- `src/App.tsx`: current Advancement, Handbook, Event, public detail, and shared navigation UI.
- `src/account/OrdinaryAccountPage.tsx`: current private Account area and a likely entry point to personal Saved Resources.
- `src/data/client.ts`: public and private DTO/API boundary.
- `src/App.css` and `src/index.css`: responsive/accessibility styles and the likely print stylesheet seam.
- `public/sw-policy.js`, `public/sw.js`, and `tests/sw-policy.test.js`: private-cache exclusion.
- `scripts/verify-migrations.mjs`, `scripts/scale-check.mjs`, `scripts/production-integrity.sql`, `scripts/production-smoke.mjs`, and `package.json`: release-gate integration.

Likely new seams are plain shared Saved Resource/Meeting Plan validators, one or two Worker repositories behind a narrow private HTTP adapter, and small React pages/components. Follow current repository naming and keep React-specific behavior out of the domain model.

## Implementation Guidance

- Write the ownership/authority ADR first. Add only the capability and indexes required by this slice.
- Store structured agenda blocks in normalized child rows when they need ordering/query constraints. Use bounded JSON only if it remains presentation-only and the ADR explains why; do not revive public legacy JSON patterns.
- Resolve resource eligibility and labels server-side through a central allowlisted projection. A client cannot save an arbitrary URL as a canonical resource.
- Keep plan notes plain text with explicit length/count limits. Render text, never unsanitized HTML.
- Keep print output a view of the authoritative private plan. Do not persist generated markup or files.
- Use stable print CSS and semantic HTML first; add JavaScript only for opening/triggering the browser print dialog.
- Update QA with newly observed print-preview and accessibility evidence; do not call browser “Save as PDF” a server PDF feature.

## Test Plan

Use TDD in this order:

1. Saved Resource eligibility, idempotency, current/unavailable projection, privacy, and deletion.
2. Meeting Plan validation, exact-scope authorization, ordering, optimistic updates, duplication, and deletion.
3. HTTP no-store/cross-origin/non-enumeration/cache boundaries.
4. UI save/use/duplicate/print behavior and print CSS.

Required verification:

```powershell
npx vitest run shared/advancement.test.ts shared/events.test.ts shared/membership-permissions.test.ts worker/account-profile-repository.test.ts worker/ordinary-account-lifecycle-repository.test.ts worker/membership-permissions-db.test.ts tests/sw-policy.test.js
npm run db:verify
npm run scale:check
npm run test:integration
npm run check
git diff --check
```

Add the new focused tests to the appropriate integration scripts. Browser verification must use synthetic Accounts, include a saved Merit and optional Event, cover revoked/expired/wrong-Outpost access, inspect print preview at representative paper/viewport sizes, and verify private routes never enter Cache Storage.

## Risks / Open Questions

- Meeting Plan ownership, sharing, and exact capability are not yet documented. The assumptions above must become an ADR before schema work.
- The current Membership/Permission UI may not expose the new capability. Add only the minimum safe provisioning/test path required by this slice; do not broaden authority through Claimed Position.
- Public content has incomplete representative coverage. An unavailable resource must remain an honest unavailable state, not a copied fallback.
- Browser print output varies by browser and printer. Verify semantic/layout robustness, but do not claim pixel-identical output or formal document certification.

## Expected Final Response From Coding Agent

Summarize:

1. The documented ownership/authority decision.
2. Saved Resource and Meeting Plan behaviors implemented.
3. Protected-content, privacy, deletion, print, accessibility, migration, scale, and test evidence.
4. Any unavailable-resource or production-only limitation.
5. Follow-up slices for sharing, outbound delivery, or richer export only if explicitly needed.
