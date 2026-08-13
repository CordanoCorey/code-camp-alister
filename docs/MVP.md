# Ranger Outpost Hub MVP

## Outcome

Build a locally runnable beta of **Ranger Outpost Hub**, an independent, mobile-friendly Royal Rangers information service. Public visitors can find verified sample outposts, explore advancement and program information, and view sourced events. The project founder privately manages published information through the sole Operator Account.

The MVP proves the product and editing workflow before production deployment or comprehensive data population.

## Product boundaries

- Ranger Outpost Hub is independent and does not imply endorsement by Royal Rangers USA, Royal Rangers International, or the Assemblies of God.
- Public pages contain original explanations, verified factual metadata, and clearly identified links to official sources.
- Permission-gated handbooks, curriculum, worksheets, artwork, logos, and copied official text are not hosted or reproduced.
- Only verified facts are published. Missing data is omitted or labeled unverified, and incomplete geographic coverage is stated plainly.
- The beta uses representative data; it does not claim to contain every outpost.

## Public experience

### Navigation

- Home
- Find an Outpost
- Advancement
- Events
- About Royal Rangers
- Other
- Help & Sources

On mobile, the primary navigation is Home, Find, Advancement, Events, and Menu. Other contains Trail of the Saber and GMA, uniforms and ideals, FCF, handbooks, and countries and regions. Help & Sources contains navigation help, browser-translation guidance, source methodology, correction instructions, verification explanations, accessibility help, and the independent-service disclaimer.

### Home

- One prominent unified search box
- Find an Outpost action
- Upcoming verified events
- Program Group shortcuts
- Recently verified resources
- A concise independent-service explanation

### Outpost directory

- Seed every US state, Washington DC, and populated US territory in the geographic navigation.
- Seed the verified USA regions, districts, Spanish-language overlays, and FCF territory mappings.
- Publish a small representative set of individually verified Outpost Listings for the beta.
- Search and filter by location, organizational affiliation, Program Group, and FCF activity where data is verified.
- Use a stable Hub Outpost ID internally; a bare outpost number is not a unique identifier.
- Show verified church/outpost name, number and campus suffix when known, public church address, city/state or territory, meeting information, Program Groups, affiliations, FCF status, public church contact route, sources, and verification dates.
- Link to an external maps provider rather than embedding a tracking-heavy map.
- Never expose leader contact details or member records.
- Explain incomplete coverage whenever a search has few or no results.
- Add Your Outpost validates public organizational facts and prepares a local email draft or copyable submission; it stores nothing and performs no public write. The Operator verifies and manually enters suggestions.

### Advancement and information

- Present the four USA Program Groups clearly.
- Ranger Kids opens its achievement trails; Discovery, Adventure, and Expedition open their verified advancement and merit metadata.
- Provide searchable merit titles, types/colors, applicable groups, original summaries, advancement relationships, sources, and official links.
- Provide original, sourced explanations of Trail of the Saber, GMA, uniforms, ideals, and FCF.
- List verified handbooks with bibliographic information, original summaries, and authorized purchase links; do not host the books.
- Do not save individual progress.

### Events

- Publish representative verified public events with title, category, host, scope, dates, organizer time zone, public location status, audience, registration facts, cost and status when verified, source, and verification date.
- Keep separate dated occurrences for recurring series.
- Mark past occurrences completed without overwriting their history.
- Use concise original descriptions and link to the organizer.

### Language, accessibility, and installation

- Author one English source interface with correct page-language metadata.
- Rely on browser-provided Google page translation; do not build a custom localization system.
- Meet WCAG 2.2 AA for keyboard use, screen readers, focus, contrast, text scaling, reduced motion, and plain-language errors.
- Make the responsive web app installable without interruptive installation prompts.
- Cache only suitable public assets and previously viewed public information.

## Private Operator experience

- Provision exactly one Operator Account to the project founder; public signup is disabled.
- Protect the Operator area using Cloudflare Access and server-side authorization.
- Provide basic create, edit, preview, publish, archive, verify, search, and source-history controls for:
  - Outposts
  - Organizational units and affiliations
  - Events
  - Advancement metadata
  - Original informational pages
- Attach field-level source, verification date, and change history to published information.
- Provide a private Freshness Queue for approaching verification expiry, broken sources, completed events, conflicts, and coverage gaps.
- Do not implement automatic scraping or automatic publication in the MVP.

## Technical foundation

- Retain React, TypeScript, and Vite.
- Use Cloudflare Workers for server-only reads and Operator writes.
- Use Cloudflare D1 for structured content, field provenance, audit history, and search.
- Use Cloudflare Access for the sole private Operator route.
- Keep public writes disabled.
- Preserve the existing npm-based lint and build workflow.
- Deliver the first beta locally in this workspace; deployment is a later decision after hands-on testing.

## Seed data

- Complete US state and territory navigation
- Verified USA region and district names, including the separate Spanish-language structure
- Verified FCF territory-to-region mappings
- Four USA Program Groups
- Representative, individually verified outposts
- Representative sourced events
- Representative advancement, handbook, award, uniform, ideals, and FCF metadata

All seed records retain sources and verification dates. Seed scope demonstrates every key flow without delaying the MVP for comprehensive population.

## Acceptance criteria

- Public navigation works on phone and desktop.
- Unified search separates outpost, advancement, event, FCF, handbook, and country result types.
- Directory filters work and incomplete-coverage notices appear appropriately.
- Advancement, Events, About Royal Rangers, Other, and Help & Sources pages render verified sample information.
- Operator edits support preview and publication and create field provenance and audit history.
- Unauthorized writes are rejected server-side.
- No private or permission-gated information appears in public search or offline caches.
- The web app is installable.
- Keyboard and screen-reader navigation, visible focus, contrast, scaling, and reduced motion are verified.
- Relevant automated tests, lint, typecheck, and production build pass.
- The locally running beta is ready for the founder to try before deployment.

Slice 4 beta-hardening evidence is recorded in [`docs/qa/beta-readiness.md`](qa/beta-readiness.md). It covers the local production build, Worker authorization/privacy contracts, private draft preview, safe offline caching, installability assets, keyboard/SPA behavior, accessibility scans, and responsive reflow. It does not claim production deployment or deployed Cloudflare Access readiness.

Slice 5 normalized-model, migration-parity, and isolated 20,000-Outpost query evidence is recorded in [`docs/qa/production-scale-model.md`](qa/production-scale-model.md). It establishes bounded local architecture behavior without claiming deployed performance or production readiness.

## Account-enabled beta addendum

Slice 10 extends the historical Initial Public Release with local ordinary adult Accounts while preserving anonymous public browsing. It adds provider-owned email/password identity, email verification and recovery, separate USA and International onboarding, a transient neutral Birth Year check, and one private non-authoritative profile per Account. Claimed Position and Current Outpost remain unverified context and grant no membership, Permission Grant, editing access, or Operator authority. Dated local evidence and limitations are recorded in [`docs/qa/adult-account-authentication.md`](qa/adult-account-authentication.md).

Slice 11 adds a one-calendar-year Ordinary Access Term, a one-calendar-month Renewal Notice, explicit pre-expiry one-year Renewal, exact expiry enforcement, and bounded irreversible deletion six calendar months after confirmed warning-provider acceptance. It does not change anonymous public browsing, Operator lifecycle, membership, verification, permissions, editors, workspaces, calendars, or youth-account scope. Dated local evidence and limitations are recorded in [`docs/qa/ordinary-account-lifecycle.md`](qa/ordinary-account-lifecycle.md).

## Explicitly deferred

- Youth accounts
- Private Outpost Calendars and Meeting Plans
- Membership, claimed-position, and delegated editor workflows
- Donations and payments
- User uploads, messaging, profiles, attendance, RSVPs, and advancement tracking
- Full nationwide or global outpost population
- Automated source scraping or unreviewed publication
- Custom translation/localization infrastructure
- Native iOS or Android applications
- Advanced notifications and feedback tooling
- Production deployment
