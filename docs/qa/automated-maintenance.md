# Automated maintenance QA

## Status — August 13, 2026

This file preserves the Slice 9 maintenance evidence. Slice 11 adds the seventh `ordinary-account-lifecycle` job; its current evidence and remote gaps are recorded in [`ordinary-account-lifecycle.md`](ordinary-account-lifecycle.md), and the current runbook is [`../operations/automated-maintenance.md`](../operations/automated-maintenance.md). No remote Cloudflare environment is evidenced in this repository. Migrations 0010–0012, the Worker/Cron, two real scheduled runs, production lifecycle email, logs, cache inspection, and public smoke remain unverified remotely.

No source check in this evidence reverified a fact or automatically published content. No typed adapter ships. The undocumented national locator JSONP endpoint is not approved, fetched, mirrored, or imported.

## Local verification

| Gate | Result |
| --- | --- |
| `npm run db:setup` | Passed; no local migrations pending. |
| `npm run db:verify` | Passed upgrade from 0009 and fresh through 0010: 139 content records, 343 provenance rows, and seven passing assertions each for migrations 0007–0010. |
| `npm run outposts:validate` | Passed 26 manifests / 103 candidates before writes. |
| `npm run maintenance:test` | Passed 5 files / 35 tests. |
| `npm run scale:check` | Passed isolated 20,006-total-Outpost fixture with zero foreign-key problems. |
| `npm run test:integration` | Passed 7 files / 53 tests. |
| `npm run check` | Passed Oxlint, 28 files / 171 tests, TypeScript, Worker build, and client build. |
| `git diff --check` | Passed after final edits. |

The deterministic local commands also passed:

- `npm run maintenance:local:status`: fresh in-memory schema, fixed `2026-08-13T12:00:00.000Z` clock, six stable jobs, zero Source Monitors, and external requests prohibited.
- `npm run maintenance:local:run`: six due jobs claimed, zero synthetic actions needed, zero failures, zero subrequests, and zero fetched bytes. The database was discarded afterward.

## Rule and privacy evidence

Injected-clock tests cover Listing Verification grace at the exact due instant and expiry strictly after the grace boundary, with replay-safe System Maintenance Events and removal only from the public projection. Proposal retention scrubs reply email/notes without copying values into before/after JSON. Event tests cover exact organizer-local timed completion, all-day completion only on the next local date, and cancelled preservation. Transfer/reauthentication cleanup preserves the active Operator and open tenure.

Dispatcher tests cover live-lease exclusion, expired-lease reclaim, maximum-job bounds, job/source backoff, source circuit open/reset, coalesced alerts, scheduler/backlog/invariant alert paths, and bounded aggregate-before-prune retention. Failed tasks do not automatically replay completed System Maintenance Events.

Every generated alert stores its latest Maintenance Run, rule version, and explicit Automation actor. Every successful or failed Source Monitor state update is transacted with an append-only System Maintenance Event containing the run, rule, idempotency key, sanitized reason and before/after state, actor, and timestamp.

Source fixtures cover approval rejection for HTTP, credentials, localhost, IPv4/IPv6, internal hostname, nonstandard port, fragment, token-like and signed query parameters. Runtime cases cover first baseline, conditional `304`, unchanged/changed fingerprints, review-candidate coalescing, cross-host redirect rejection, oversized/unsupported responses, abort timeout, DNS, `401`, `403`, `404`, `429`, and `503`. Assertions prove unchanged factual verification timestamps/content versions and the absence of fixture body text from automated observations. Response bodies are cancelled/discarded; only bounded fingerprints and technical metadata remain.

Candidate and alert actions preserve Operator-Tenure-labelled review histories. Review-only candidates have `proposed_values_json = NULL`; therefore conversion is deliberately unavailable. Existing canonical validation/provenance/publication paths remain unchanged.

## Scale and capacity evidence

The disposable 20,000-synthetic-Outpost supplement used migration 0010 and a fake fetch only:

- one lifecycle pass claimed one job and applied exactly 50 unique, idempotent grace actions;
- the immediate duplicate invocation claimed zero jobs and created no duplicate actions;
- 400 deduplicated synthetic Source Documents represented 50 Outpost field links each; one due Source Document produced exactly one fetch, one bounded observation, 33 bytes, and no repeat fetch in the immediate duplicate pass;
- history retention aggregated then pruned one expired routine observation and cleared one old successful-run detail object;
- a live lease was skipped and the same lease was safely reclaimed after expiry;
- due-job/source, lease, observation retention, open candidate, and open alert queries used the migration 0010 indexes;
- pre-existing public directory/search queries remained bounded. Local timings are not production SLOs.

The scale command throws if the single overlapping claim, 50 distinct lifecycle actions, one-fetch/one-observation source behavior, aggregate-before-prune result, or live/expired lease expectations regress; these values are enforced gates, not report-only diagnostics.

The chosen production cadence is one dispatcher every 30 minutes. A pass checks at most 16 sources and follows at most one same-host redirect, so the maximum is 32 external subrequests against the documented Free-plan allowance of 50. The theoretical capacity is 768 source checks/day before deferral/backoff. This is a quota calculation, not observed production throughput; gradual activation is required.

## Operator workspace, accessibility, and cache evidence

The in-app browser exercised `http://127.0.0.1:5174/operator` against the local Worker:

- the Automation workspace clearly distinguished technical reachability from factual verification;
- confirmed **Run due maintenance now** completed through the same dispatcher and exposed only sanitized counts;
- job pause/resume round-tripped through safe server allowlists;
- an Automation Alert was acknowledged with the current tenure and live status feedback;
- an exact synthetic `https://example.com/operator-verification` Source Document approval was recorded but remained disabled, with an **Enable** control and no fetch;
- keyset pagination displayed 20 Source Documents initially and loaded the remaining 17 without duplicates or console errors;
- 390×844 and the browser's minimum 240-CSS-pixel reflow envelope had no horizontal overflow; the latter is narrower than the CSS layout width produced by 200% zoom on the normal desktop viewport;
- visible keyboard focus styling, labelled controls, unique IDs, status semantics, reduced-motion CSS, and zero console warnings/errors were observed.

The service-worker policy unit/integration tests explicitly classify `/api/operator/automation` as ignored and reject private/no-store responses. Production smoke now includes unauthenticated Automation denial and expects schema 0010. The in-app browser's restricted page-evaluation surface did not expose Cache Storage for direct enumeration; that remaining production cache inspection must be completed after deployment.

## Failure, catch-up, and remote limitations

Source failures create observations/backoff without changing public facts. Three consecutive failures open a Source Monitor circuit; one coalesced private alert remains until Operator review. Job failures back off, alert, and eventually open a circuit without preventing unrelated jobs/public reads. Scheduler overdue and full bounded batches create private coalesced alerts. Quota pressure defers work; it never triggers aggressive retry or publication.

Routine observation/run detail is bounded and aggregated before pruning. Audit-worthy System Maintenance Events, candidate decisions, revisions, Field Provenance, Verification Cycles, tenure history, conflicts, and lifecycle evidence remain.

Remote evidence still required: real migration 0010 list/integrity output, deployed trigger propagation, two non-overlapping Cron Events, redacted logs/metrics, account-specific native notification availability/cost/privacy, public/Operator smoke, direct Cache Storage/privacy inspection, tiny first-party monitor baselines, quota behavior, Time Travel bookmark custody, and rollback-safe Cron removal. No production claim should be made until those checks exist.
