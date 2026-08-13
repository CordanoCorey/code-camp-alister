# Automated maintenance operations

## Operating boundary

One production-only Cloudflare Cron dispatcher runs at `7,37 * * * *`. D1 selects due jobs; local development never starts a timer. The dispatcher processes at most seven due jobs, one at a time. Source monitoring is capped at 16 Source Documents, 300 seconds, 4 MiB, and 32 external subrequests per pass; each source permits one optional same-host redirect and at most 262,144 response bytes. The six-minute job lease exceeds that five-minute work budget, and each source has its own five-and-a-half-minute lease.

Automation has a system identity such as `Automation: listing-lifecycle-v1`. A Cron run never has an Operator Tenure. Only an active, non-renewal-required Operator can change configuration, run maintenance manually, approve a Source Monitor, review a candidate, or acknowledge/resolve an alert. Renewal-required mode exposes a compact read-only summary while deterministic safety and retention work continues.

Technical source reachability is not factual verification. No source check updates Field Provenance, starts a Verification Cycle, edits a canonical fact, archives an Outpost, cancels an Event, or publishes content. No typed source adapter ships in Slice 9; changed unstructured sources produce review-only candidates with prior public values and no guessed replacement.

## Job inventory

| Job | Autonomous mutation | Default cadence / batch |
| --- | --- | --- |
| `listing-lifecycle` | Verified to grace at the exact due instant; grace to verification-expired strictly after the persisted grace end. The public projection removes expired listings without archiving them. | 1 hour / 25 |
| `proposal-retention` | Scrubs reply email and private notes at/after the six-month deadline and preserves non-PII disposition evidence. | 1 hour / 25 |
| `event-completion` | Moves only eligible published occurrences to completed after the organizer-local stored end boundary. | 1 hour / 25 |
| `security-intent-cleanup` | Expires pending transfer data and removes expired reauthentication intents without changing the active Operator. | 1 hour / 25 |
| `source-monitoring` | Records bounded technical observations, baselines, review-only change candidates, backoff/circuit state, and coalesced private alerts. | dispatcher every 30 minutes; target interval 6 hours–7 days / 16 |
| `maintenance-history-retention` | Aggregates then prunes expired routine observations and clears old successful-run detail, retaining counts and audit events. | 1 day / 50 |
| `ordinary-account-lifecycle` | Sends due renewal warnings, expires due ordinary Accounts and revokes sessions, and performs guarded full deletion only when the confirmed-delivery deadline is due. It never acts as an Operator Tenure. | installed paused; 1 hour / 25 when enabled |

Routine observations use a 90-day retention window; changed observations use a longer window and remain protected while referenced by a review candidate. Successful-run count columns remain after the optional detail JSON is cleared. Ordinary warning attempts and sanitized lifecycle events exist only while their private Account exists and cascade away in guarded deletion; non-identifying maintenance-run counts remain. System Maintenance Events, content revisions, Field Provenance, Verification Cycles, Operator Tenure history, and candidate review history are never pruned by this job.

## Safe local checks

These commands always create a fresh in-memory database, use a fixed clock, and prohibit external requests:

```powershell
npm run maintenance:local:status
npm run maintenance:local:run
npm run maintenance:test
```

The Operator **Run due maintenance now** action invokes the same dispatcher and accepts only confirmation. It does not accept job keys, SQL, URLs, batch sizes, or arbitrary fetch targets.

## Approving and operating Source Monitors

1. Confirm the Source Document is already canonical and its ordinary public terms and technical controls permit a low-rate check. Never approve the undocumented national locator JSONP endpoint, a submission URL merely because it was submitted, a permission-gated source, or a source requiring challenge bypass.
2. In the private Automation workspace, choose the exact Source Document, an allowlisted mode, interval, byte cap, redirect count, and record the approval reason. Approval records the current Operator Tenure but leaves the monitor disabled.
3. Recheck the displayed exact HTTPS URL and hostname, then enable it. The server rejects credentials, IP literals, localhost/private/internal names, nonstandard ports, fragments, credential-like query parameters, and unbounded values.
4. Establish the first successful fingerprint as a baseline. It is not a change and does not reverify a fact.
5. Review source changes against the public source manually. Mark review/no-material-change/superseded/dismissed with a reason. Conversion is unavailable because Slice 9 ships no typed adapter.

Requests send no cookies, authorization, Access identity, client certificate, or form data. Redirects are manual and limited to one separately validated same-host HTTPS target. Bodies are read only within the approved cap, hashed where configured, and discarded. D1 stores bounded counts, status class, MIME family, duration bucket, validator/fingerprint hashes, safe conditional validator values, redirect fingerprint, and a sanitized failure category—not bodies, snippets, header dumps, cookies, server banners, or redirect URLs.

`401`, `403`, challenge pages, `429`, `5xx`, DNS/TLS/network errors, timeouts, unsafe redirects, unsupported MIME, and oversized responses back off. Three consecutive source failures open the circuit and coalesce one private alert. Use **Reset circuit** only after reviewing the cause; it enables one new bounded attempt and resets failure state. Disable a monitor when permission or source policy is uncertain.

## Scheduler, backlog, and incidents

The Automation workspace shows due counts, leases, recent sanitized outcomes, and private alerts. A job running more than two configured intervals late creates/coalesces a scheduler-overdue alert. A batch reaching its bound creates/coalesces a backlog alert. Job exceptions back off exponentially; five consecutive job failures open a circuit. A source failure does not block lifecycle/retention jobs, and a failing job does not make public reads depend on maintenance.

An ordinary warning persists its attempt before delivery and uses one stable provider idempotency key for the term. A `sending` claim older than ten minutes is safely reclaimed with the same attempt and provider key after a Worker crash. Transient failures become due after bounded 5-minute, 15-minute, 1-hour, and 6-hour delays, for at most five attempts; the lifecycle executor returns its next retry instant and the generic dispatcher advances durable `next_due_at` without knowing lifecycle tables. The next configured Cron invocation claims work only after that instant. Provider acceptance—not recipient mailbox delivery—records confirmation and starts the six-calendar-month deletion deadline; acceptance sampled at/after Account expiry is cancelled and starts no deadline. Permanent rejection or the fifth transient failure coalesces one critical private Automation Alert and leaves the deadline unset. Resolve configuration/provider failures before resetting the job; never synthesize delivery or manually populate a deletion deadline.

After correcting and documenting a job invariant failure, use **Reset job circuit** with the incident reason. The action clears failure/backoff state, schedules one bounded attempt, and records the active Operator Tenure; it does not replay work directly.

When quotas or upstream limits are reached, leave work due or in backoff for a later bounded pass. Do not increase concurrency, retry in a loop, bypass a challenge, or publish stale guesses. The selected Free-plan budget is 16 sources × at most 2 requests = 32 external subrequests, below the documented 50-request allowance. At a 30-minute dispatcher cadence, the theoretical source capacity is 768 checks/day; actual capacity must be expanded only from observed scheduled-run evidence.

Incident responses:

- Runaway requests: disable the Source Monitor or pause `source-monitoring`, inspect sanitized counts, and do not reset until the exact approved URL and redirect policy are understood.
- Unexpected source traffic: pause the monitor/job immediately, retain observations and audits, and confirm no other deployment owns the traffic.
- Invariant failure: pause the affected job, run `npm run db:integrity:production`, and compare System Maintenance Events to canonical state. Never repair by inventing an Operator audit.
- Suspected private/public leakage: pause source monitoring and the Cron, preserve logs, verify public DTO/cache exclusions, and follow the production incident process before any cleanup.
- Catch-up: restore one job at its reviewed batch/cadence, run due maintenance, confirm idempotent events and backlog decline, then leave the Cron to continue bounded work.

Cloudflare Workers Logs and Cron Events are the only monitoring services used. Invocation logs remain disabled because they may retain URLs. Current public documentation does not establish an account-independent, no-cost Cron failure-notification setup; no custom email/SMS delivery is added. Configure a native provider alert only after the Operator verifies its account availability, recipient ownership, cost, and payload privacy.

## Migration, deploy, and rollback

1. Start from a clean reviewed release and capture a D1 Time Travel bookmark without copying it into repository evidence.
2. Run `npm run db:migrate:production`, confirm migrations `0010_automated_data_maintenance.sql` through `0012_ordinary_account_lifecycle.sql`, then run `npm run db:integrity:production`.
3. Deploy the scheduled handler. The production config validator requires exactly `7,37 * * * *`; top-level/local configuration has no Cron.
4. Keep Source Monitors and `ordinary-account-lifecycle` paused. Run one bounded dry pass, inspect due counts, then verify deterministic jobs and replay safety.
5. Enable warning delivery only for a designated non-personal test Account after provider configuration is complete. Confirm one accepted warning and its exact deadline before allowing deletion work.
6. Approve only a tiny low-risk first-party source pilot, establish baselines, and inspect traffic/log counts.
7. Treat activation as complete only after at least two real Cron Events show no overlap, private leakage, duplicate warnings, or public factual changes.

Before rolling back to a Worker that cannot understand migrations 0010–0012, pause warning/deletion work, remove the production Cron in a reviewed emergency configuration, and deploy that trigger removal. Cloudflare treats `crons: []` as explicit removal. Confirm the trigger is gone, then roll back only to code that remains forward-compatible with the D1 schema. D1 does not roll back with Worker code; restore only through the separately approved Time Travel incident procedure. Re-enable the reviewed Cron only after the compatible Worker is restored.

Production remains unprovisioned in this repository: the real D1 UUID, applied remote migrations through 0012, deployed trigger, configured lifecycle email provider, production URL, and two observed scheduled runs are absent. Production warning delivery and destructive deletion have not been activated. Do not describe local evidence as autonomous production operation.
