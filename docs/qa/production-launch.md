# Production launch evidence

**Evidence date:** 2026-08-13
**Status:** Repository-local implementation through Slice 11; remote launch not performed

This log retains the observed Slice 6–8 launch preparation and records the current Slice 9–11 repository-local implementation. It does not claim a public deployment, production email delivery, destructive lifecycle activation, official endorsement, complete U.S. data, or recovery capabilities that Cloudflare does not provide.

Slices 9–11 add a production-only Cron dispatcher, ordinary adult Account authentication, and the annual Account lifecycle through migration 0012. The deployed trigger, production auth/email configuration, provider acceptance, destructive deletion, and two observed scheduled runs remain unverified. See [`automated-maintenance.md`](automated-maintenance.md), [`adult-account-authentication.md`](adult-account-authentication.md), and [`ordinary-account-lifecycle.md`](ordinary-account-lifecycle.md) for local evidence and explicit remote gaps.

## Release and remote resources

| Item | Observed value |
| --- | --- |
| Public HTTPS URL | Not assigned |
| Release commit SHA/tag | Not created for the accumulated work |
| Worker deployment/version | Not created |
| Production D1 | Not created or inspected |
| Applied remote migrations | Not run |
| Access application/policy | Not created or inspected |
| Operator identity | Intentionally omitted |
| Deployment time | Not deployed |

Remote work is blocked until the human-controlled Cloudflare account and the one Operator identity are confirmed. No account IDs, database UUIDs, Access audience/issuer, tokens, or personal identifiers will be recorded here.

## Repository-local implementation evidence

- Current Cloudflare procedures and Wrangler 4.122.0 source constraints are recorded in [`../research/cloudflare-production-deployment.md`](../research/cloudflare-production-deployment.md). Slice 7 Access/session/D1 constraints are recorded in [`../research/operator-lifecycle-and-access.md`](../research/operator-lifecycle-and-access.md).
- Local preview moved from top-level Wrangler variables into ignored `.dev.vars`; production configuration omits the bypass and rejects it through `scripts/production-config.mjs`.
- `GET`/`HEAD /api/health` performs one bounded lookup for migration `0012_ordinary_account_lifecycle.sql`, returns only `{ "status": "ok", "schema": "0012" }`, uses `no-store`, and returns a generic `503` for D1/schema failure.
- Worker responses carry a generated `x-request-id`; sampled custom logs contain only correlation ID, route category, status, and duration, while automatic URL-bearing invocation logs are disabled.
- `scripts/production-smoke.mjs` is parameterized by HTTPS base URL, performs read-only credential-free checks, rejects private public-DTO fields, and covers the exact Operator parent/wildcard/API denial shapes.
- Production D1 migration/list/integrity/bookmark commands use explicit source config, named production environment, and remote target.
- `scripts/production-deploy.mjs` validates configuration, requires a clean Git release, selects the Vite production environment before build, checks the flattened output, and deploys that exact output configuration.
- Recovery documentation states the FTS5 export limitation and in-place-only Time Travel behavior instead of claiming a disposable full restore is available.

## Local gates

The Slice 11 local gate set was run on 2026-08-13:

```powershell
npm run db:setup
npm run db:verify
npm run outposts:validate
npm run maintenance:local:status
npm run scale:check
npm run test:integration
npm run check
git diff --check
```

- `db:setup`: passed against the retained local D1; no source migration remained pending after 0012.
- `db:verify`: passed a populated upgrade from 0011 and a fresh install through 0012; both retained 139 content records, 343 Field Provenance rows, seven passing assertions for every assertion set 0007–0012, and zero foreign-key violations.
- `outposts:validate`: passed the source-controlled candidate manifests without writing canonical content.
- `maintenance:local:status`: passed in an isolated database with external requests disabled and all seven maintenance jobs present and paused by default.
- `scale:check`: passed with 20,000 synthetic Outposts plus 50,000 synthetic ordinary Accounts, zero foreign-key problems, and indexed bounded warning, expiration, deletion, and session-revocation queries.
- `test:integration`: passed 7 files and 57 request-boundary/policy tests, including schema 0012, the separate Operator authority boundary, and private Account cache exclusions.
- `check`: passed lint, 35 files and 219 tests, TypeScript, and both production builds.
- `git diff --check`: passed.
- The production integrity SQL now covers migrations through 0012, ordinary auth/profile/lifecycle agreement, warning/deletion invariants, seven maintenance jobs, public-search parity, and foreign-key integrity.
- `config:production:check` produced the expected pre-provisioning failure: the remote production D1 binding is absent. This is the remaining repository configuration blocker, not a successful production-readiness result.

## Remote migration and integrity evidence

Pending. On launch, record only these non-sensitive results:

- migration names/state for `0001` through `0012`;
- content counts by kind/status and 139 total rows;
- 343 Field Provenance rows;
- seven durable assertions for each of migrations 0007–0012;
- ordinary auth-user/profile/lifecycle agreement and no invalid delivery-based deadline;
- public-search/publication parity; and
- zero `PRAGMA foreign_key_check` rows.

Never record the D1 UUID or load the local 20,000-Outpost scale fixture into production.

## Public, API, Access, and browser evidence

Pending a real HTTPS URL. Record measured results for:

- credential-free production smoke;
- public account-free browsing and logged-out Operator denial;
- authenticated one-identity Operator console/preview with `no-store` and no smoke-test write;
- ordinary Account verification/sign-in/profile/renewal and exact-expiry behavior with private responses excluded from caches;
- security/cache/content-type headers;
- SPA deep links, manifest, icons, service-worker scope, installation criteria, and offline scenarios;
- mobile/responsive, keyboard/focus, route-title, console, and accessibility checks; and
- Cache Storage exclusion for every Operator/private/mutation/error/`no-store` response.

Do not automate Access credentials into the smoke script or write verified production data merely to demonstrate a mutation.

## Operations, rollback, and recovery evidence

Pending. Record Workers Logs/D1 metric observations, notification configuration without the recipient, deployment/version IDs in redacted form, the rollback-and-redeploy timestamps/results, and the current Time Travel retention/bookmark procedure.

A full disposable D1 restore drill is currently unavailable: Time Travel cannot restore into another database, and full export does not support this schema's FTS5 virtual table. If a disposable source-migration recreation check is performed, label it as recreation evidence rather than a production-data restore.

## Known limits

- Representative beta data remains intentionally incomplete.
- Ranger Outpost Hub remains an independent service and does not imply official endorsement.
- The sole Operator lifecycle is implemented locally in Slice 7; production bootstrap, renewal, transfer, cleanup, and old-session rejection remain unverified until remote resources exist.
- Ordinary adult Accounts are implemented and verified locally, but production signup, provider warning delivery, and destructive deletion remain disabled pending the guarded rollout. Youth Accounts, broader U.S. publication, production source-monitor activation, and member workspaces remain later work. Automatic factual publication remains prohibited rather than deferred.
- Free-plan availability is subject to current quotas; no statement here guarantees indefinite zero cost.
