# Production launch evidence

**Evidence date:** 2026-08-13
**Status:** Repository-local Slice 7 gates passed; remote launch not performed

This log retains the observed Slice 6 launch preparation and adds the current Slice 7 local supplement. It does not claim a public deployment, production lifecycle activation, official endorsement, complete U.S. data, future account readiness, or recovery capabilities that Cloudflare does not provide.

## Release and remote resources

| Item | Observed value |
| --- | --- |
| Public HTTPS URL | Not assigned |
| Release commit SHA/tag | Not created for the accumulated Slice 1â€“7 work |
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
- `GET`/`HEAD /api/health` now performs one bounded lookup for migration `0008_operator_lifecycle.sql`, returns only `{ "status": "ok", "schema": "0008" }`, uses `no-store`, and returns a generic `503` for D1/schema failure.
- Worker responses carry a generated `x-request-id`; sampled custom logs contain only correlation ID, route category, status, and duration, while automatic URL-bearing invocation logs are disabled.
- `scripts/production-smoke.mjs` is parameterized by HTTPS base URL, performs read-only credential-free checks, rejects private public-DTO fields, and covers the exact Operator parent/wildcard/API denial shapes.
- Production D1 migration/list/integrity/bookmark commands use explicit source config, named production environment, and remote target.
- `scripts/production-deploy.mjs` validates configuration, requires a clean Git release, selects the Vite production environment before build, checks the flattened output, and deploys that exact output configuration.
- Recovery documentation states the FTS5 export limitation and in-place-only Time Travel behavior instead of claiming a disposable full restore is available.

## Local gates

The final Slice 7 local run completed on 2026-08-13:

```powershell
npm run db:setup
npm run db:verify
npm run scale:check
npm run test:integration
npm run check
git diff --check
```

- `db:setup`: passed; no local migrations remained.
- `db:verify`: passed upgrade-from-0007 and fresh-through-0008; both had 139 content records, 343 Field Provenance rows, seven prior migration assertions, and seven Slice 7 lifecycle assertions.
- `scale:check`: passed with 20,006 total Outposts, zero foreign-key problems, bounded indexed query paths, and isolated cleanup.
- `test:integration`: passed five files and 44 tests, including health, authorization/JWT time claims, tenure-attributed mutation paths, cache exclusion, production configuration, private preview, and production smoke contracts.
- `check`: passed; Oxlint had no findings, Vitest passed 19 files and 110 tests, and the Worker/client TypeScript and production builds completed.
- `git diff --check`: passed; Windows line-ending notices were informational.
- The production integrity SQL was also exercised read-only against local D1: migrations through `0008`, 139 content rows, 343 provenance rows, both sets of seven passing assertions, 137/137 public-search parity, the lifecycle singleton/open-tenure/pending-transfer invariants, and zero foreign-key rows were observed.
- `config:production:check` produced the expected pre-provisioning failure: the remote production D1 binding is absent. This is the remaining repository configuration blocker, not a successful production-readiness result.

## Remote migration and integrity evidence

Pending. On launch, record only these non-sensitive results:

- migration names/state for `0001` through `0008`;
- content counts by kind/status and 139 total rows;
- 343 Field Provenance rows;
- seven durable migration assertions;
- public-search/publication parity; and
- zero `PRAGMA foreign_key_check` rows.

Never record the D1 UUID or load the local 20,000-Outpost scale fixture into production.

## Public, API, Access, and browser evidence

Pending a real HTTPS URL. Record measured results for:

- credential-free production smoke;
- public account-free browsing and logged-out Operator denial;
- authenticated one-identity Operator console/preview with `no-store` and no write;
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
- Ordinary/youth accounts, broader U.S. population, automated monitoring/publication, member workspaces, and notifications remain later slices.
- Free-plan availability is subject to current quotas; no statement here guarantees indefinite zero cost.
