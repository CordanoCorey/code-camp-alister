# Production deployment and recovery

This runbook launches Ranger Outpost Hub as one public, read-only Cloudflare Worker with one remote D1 database and one Cloudflare Access identity for the Operator paths. It implements the Initial Public Release boundaries in `CONTEXT.md` and ADRs 0010, 0012, 0013, 0014, and 0015. It does not provision ordinary accounts, copy protected program material, or automate publication. After Slice 7, follow [`operator-lifecycle.md`](operator-lifecycle.md) for bootstrap, renewal, staged transfer, cleanup, and emergency recovery.

Current platform constraints and source links are recorded in [`../research/cloudflare-production-deployment.md`](../research/cloudflare-production-deployment.md). Read that note before changing these commands. In particular, the Cloudflare Vite environment is selected at build time, Worker rollback does not roll back D1, D1 Time Travel restores only in place, and this schema's FTS5 virtual table prevents a routine full D1 SQL export.

## Human-controlled prerequisites

The Service Operator performs or explicitly confirms these steps:

- sign in through interactive `wrangler login` or an already authenticated local Wrangler session;
- select the intended Cloudflare account when more than one is available;
- confirm the one exact Operator email and its login provider;
- approve any paid-plan change before it is enabled; and
- configure provider account, security, billing, and service notifications to an Operator-controlled recipient.

Never paste a Cloudflare password, API token, recovery code, Access assertion, account ID, audience tag, team domain, or email-provider password into chat. Never write those values to this repository. Redact account/resource identifiers from copied command output and QA evidence.

The expected first launch uses Cloudflare's Free plans and a provider HTTPS `workers.dev` hostname. Stop for explicit approval if the dashboard requires payment, a domain purchase, or a paid feature.

## Local and production configuration

| Concern | Local development | Production |
| --- | --- | --- |
| Worker environment | Top-level `wrangler.jsonc` | `env.production` selected before the Vite build |
| D1 | Local Wrangler state; commands say `--local` | One real `ranger-outpost-hub-production` binding; commands say `--env production --remote` |
| Operator bypass | `LOCAL_OPERATOR_PREVIEW=true` in ignored `.dev.vars`, exact loopback hosts only | Variable absent; deployed hostnames cannot use the code-level bypass |
| Access settings | Not required for loopback preview | `ACCESS_TEAM_DOMAIN` and `ACCESS_POLICY_AUD` entered through interactive Worker secret prompts |
| Public support recipient | Optional `VITE_PUBLIC_SUPPORT_EMAIL` in `.env.local`; visible in the browser bundle | Supply only a published support address; otherwise retain the copyable-submission fallback |
| Logs | Local terminal | Persisted custom Workers Logs at 10% sampling; automatic URL-bearing invocation logs disabled |

`.dev.vars.example` documents the only local Worker variable. `.dev.vars`, `.env*`, `.wrangler`, D1 exports/backups, and `.cloudflare-recovery` are ignored. Access settings never use a `VITE_` prefix.

The production configuration validator intentionally fails until the real D1 UUID is present:

```powershell
npm run config:production:check
```

It also rejects a production or top-level `LOCAL_OPERATOR_PREVIEW`, committed Access values, missing logs, a non-`workers.dev` production target, or any all-zero production D1 UUID.

## Launch sequence

### 1. Verify the reviewed local state

Run every gate before creating a remote resource:

```powershell
npm run db:setup
npm run db:verify
npm run scale:check
npm run test:integration
npm run check
git diff --check
```

Review the complete diff from the Slice 1 base, confirm every file belongs to Ranger Outpost Hub, and confirm that ignored output contains no credentials or database exports.

### 2. Select the Cloudflare account

Use the interactive local session:

```powershell
npx wrangler login
npx wrangler whoami
```

Do not record `whoami` output in QA. If the account is absent or ambiguous, stop. Account selection is not inferred from an existing browser session.

### 3. Create one empty production D1 database

Create the database without `--update-config`; automatic config updates can target the wrong environment:

```powershell
npx wrangler d1 create ranger-outpost-hub-production --binding DB --config wrangler.jsonc
```

Confirm locally that the returned resource belongs to the selected account. Add only the returned database UUID to `env.production.d1_databases` in `wrangler.jsonc`, with:

- binding `DB`;
- database name `ranger-outpost-hub-production`; and
- migrations directory `migrations`.

Do not copy the UUID into QA evidence. Run `npm run config:production:check` and stop if it does not pass.

Before migration, use `wrangler d1 info` and the remote migration list to confirm this is the intended new database. Do not delete or recreate a database that contains unexpected tables or data.

```powershell
npx wrangler d1 info ranger-outpost-hub-production --config wrangler.jsonc --env production
npm run db:migrations:production:list
```

### 4. Create the traceable release

After the real D1 binding is present and every local gate passes:

1. create a `codex/` release branch;
2. stage only reviewed project files;
3. confirm `.wrangler`, `dist`, `.dev.vars`, `.env*`, database exports, logs, browser profiles, and recovery material are absent;
4. commit the complete Slice 1-8 release; and
5. optionally create a release tag.

Record the commit SHA locally. A GitHub push is optional and requires separate authorization. The deployment wrapper refuses a dirty or untracked working tree.

### 5. Apply and verify remote migrations

Re-run `db:verify`, `scale:check`, and `check`, then apply only the source-controlled `0001` through `0009` history:

```powershell
npm run db:migrate:production
npm run db:migrations:production:list
npm run db:integrity:production
```

Expected non-sensitive integrity evidence:

- migration list has no pending migrations and includes `0001` through `0009` in applied state;
- 139 total content records;
- 343 Field Provenance rows;
- seven passing `migration_0007_assertions` rows;
- seven passing `migration_0008_assertions` rows, one unclaimed Operator singleton, no open tenure, and no pending transfer before bootstrap;
- seven passing `migration_0009_assertions` rows and no proposal-private columns in public tables/views;
- public Outposts are lifecycle-eligible and coverage includes every U.S. jurisdiction row; and
- `PRAGMA foreign_key_check` returns no rows.

The `scale:check` fixture is local and disposable. Never run it against production and never add its 20,000 synthetic Outposts to remote D1.

### 6. Configure the sole Operator gate

The manual Access wizard has five stages: confirm the account/identity, create the path application, enter Worker secrets locally, enable no-cost notifications, and verify both signed-out and signed-in behavior. Author or run that wizard only after its stages are confirmed by the Service Operator.

Create one Access self-hosted application for the exact production `workers.dev` hostname with these destinations:

- `/operator`
- `/operator/*`
- `/api/operator`
- `/api/operator/*`

The parent and wildcard destinations are both required because `/*` does not cover its parent. Use one Allow policy whose only Include rule is the exact Operator email. Do not use Everyone, a domain-wide rule, an unrestricted login-method rule, Bypass, a service token, or a second identity. Select only a provider the Operator controls; OTP is acceptable when explicitly enabled, while an existing MFA-capable IdP may be stronger.

Configure the path application before enabling public traffic. If Cloudflare will not accept selective path destinations for the assigned `workers.dev` hostname, stop. Do not weaken the gate, purchase a domain, or expose the Operator console.

### 7. Configure or deliberately leave public intake in fallback

Create a Turnstile Free widget for the exact production hostname. Enter `TURNSTILE_SECRET_KEY` and `INTAKE_SIGNING_SECRET` only through interactive Worker secret prompts. Configure the public site key and exact `TURNSTILE_EXPECTED_HOSTNAMES` value without putting any secret in `VITE_*` or source control. Partial/mismatched configuration must leave online intake disabled; verify that the email/copy fallback remains available. Follow [us-directory-operations.md](us-directory-operations.md) for exact behavior and the production staging boundary.

Keep the Worker-side JWT verification. After the first guarded deployment exists, enter the exact issuer URL and audience tag through interactive prompts:

```powershell
npx wrangler secret put ACCESS_TEAM_DOMAIN --config wrangler.jsonc --env production
npx wrangler secret put ACCESS_POLICY_AUD --config wrangler.jsonc --env production
```

These commands create a new Worker version. Enter values only in Wrangler's local hidden prompt. Do not put them in a shell history argument, `.env`, QA document, or chat.

### 8. Build and deploy the selected production environment

```powershell
npm run deploy:production
```

The wrapper:

- validates the real production D1 binding and absence of local/Access variables;
- requires a clean Git release commit;
- sets `CLOUDFLARE_ENV=production` before `vite build`;
- verifies the flattened Vite output contains the production Worker and D1 binding but no local preview variable; and
- deploys that exact built configuration with the release SHA in the Worker version message.

Do not replace it with `wrangler deploy --env production`: for this Vite integration, that flag at deploy time does not select the environment used during the build.

Record the HTTPS URL, deployment/version ID, release SHA, compatibility date, and UTC deployment time in `docs/qa/production-launch.md`. Do not record account IDs, the D1 UUID, Access identifiers, or the Operator identity.

### 9. Run credential-free and browser smoke checks

Run safe production reads only:

```powershell
npm run smoke:production -- https://your-worker.workers.dev
```

The command refuses HTTP and credential-bearing URLs. It verifies the public SPA routes, manifest/icons/service worker/hashed assets, bounded public APIs, detail/search/pagination, cache and security headers, plain failures, all three logged-out Operator path shapes, and the D1-backed health endpoint. It never signs into Access or performs a write.

In a logged-out/incognito browser, confirm public routes need no account and all Operator destinations are gated. In the one allowed Operator session:

- load the console and bounded record/Freshness Queue data;
- open a record and an unsaved private preview;
- confirm Operator responses are `no-store` and absent from Cache Storage;
- confirm no console errors; and
- do not create or modify production content merely for smoke testing.

For the public PWA, verify route titles, keyboard/focus behavior, mobile navigation, responsive reflow, deep-link reloads, manifest installability, service-worker scope/control after reload, cached previously viewed public queries, the first-time offline unavailable state, preserved generated/verification dates, and the existing accessibility supplement. Confirm `/operator`, Operator APIs, drafts, mutations, errors, and all `no-store` responses are absent from Cache Storage.

## Logs, analytics, quotas, and notifications

The Worker emits one structured entry per request: correlation ID, route category, status, and duration. Automatic Cloudflare invocation logs are disabled because they include request URLs. The custom entry never logs the URL/query, Access assertion, Operator email, request body, form/submission content, source notes, database rows, account/resource IDs, or secrets. `x-request-id` lets a browser report be correlated without revealing identity.

After smoke traffic, inspect Workers Logs and built-in metrics. Inspect D1 rows read/written, query latency, serialized response bytes, database size, and the known FTS ordering path. `wrangler d1 insights` is experimental and exposes SQL structure, so keep its output out of public evidence.

Free-plan ceilings checked on 2026-08-12:

| Capability | Current Free allowance |
| --- | ---: |
| Dynamic Worker requests | 100,000/day |
| Worker CPU | 10 ms/request |
| Workers Logs | 200,000 events/day, 3-day retention |
| D1 rows read | 5,000,000/day |
| D1 rows written | 100,000/day |
| D1 account storage | 5 GB total |
| D1 database size | 500 MB/database |
| D1 queries | 50/Worker invocation |
| D1 Time Travel | 7 days |
| Zero Trust users | 50; standard logs up to 24 hours |

Review traffic, D1, storage, and log sampling at roughly 70% of any allowance. Improve indexing, cache behavior, or sampling before proposing a paid plan. Obtain explicit approval before enabling a paid plan or service.

Enable available account, security, billing/usage, D1, and Worker service notifications to the Operator-controlled provider account without copying the recipient into this repository.

## Worker rollback drill

List deployment history and capture the current and prior version IDs locally:

```powershell
npx wrangler deployments list --name ranger-outpost-hub-production --config wrangler.jsonc --json
npx wrangler versions list --name ranger-outpost-hub-production --config wrangler.jsonc --json
```

For the one safe drill, select a known previous release that is compatible with migration 0007:

```powershell
npx wrangler rollback <previous-version-id> --name ranger-outpost-hub-production --config wrangler.jsonc --message "Slice 6 rollback drill"
npm run smoke:production -- https://your-worker.workers.dev
npm run deploy:production
npm run smoke:production -- https://your-worker.workers.dev
```

Record the rollback deployment, smoke result, restored release deployment, and timestamps without copying account/resource identifiers. Rollback affects Worker code, assets, bindings, and settings only. It does not roll back D1 and can fail when an old version is schema-incompatible or references a deleted binding.

## D1 recovery

Get a current or historical Time Travel bookmark locally:

```powershell
npm run db:bookmark:production
npx wrangler d1 time-travel info ranger-outpost-hub-production --config wrangler.jsonc --env production --timestamp "<RFC3339 timestamp>"
```

Capture a current bookmark immediately before every future non-fresh remote migration. Store it outside the repository and label it with the release/migration and UTC time. A bookmark remains inside the same Cloudflare account and is not an independent backup.

A production restore is destructive and requires explicit incident approval:

```powershell
npx wrangler d1 time-travel restore ranger-outpost-hub-production --config wrangler.jsonc --env production --bookmark "<bookmark>"
```

It overwrites production in place, cancels in-flight requests, and returns the previous bookmark so the operation can be undone. Never use production for a drill.

Cloudflare cannot clone a Time Travel bookmark into a disposable D1 database. This project's FTS5 virtual table also prevents a routine full `wrangler d1 export`; do not delete production FTS tables to force an export. Consequently, the current platform does not support the requested disposable restore drill for the complete schema. A disposable database migrated from source can prove schema/seed recreation, but it does not prove restoration of production changes and must not be described as a restore.

Free-plan recovery can lose up to the interval between the incident and the chosen minute within the 7-day retention window. Anything older, anything outside the account, deleted account/database access, provider account recovery, Access configuration, secrets, notification settings, and uncommitted Operator work are not recovered by D1 Time Travel. The Service Operator chooses the recovery point, performs the restore, validates migrations/integrity, redeploys compatible code, and records the incident.

## Secret rotation and incidents

To rotate an Access setting, update only the corresponding production Worker secret through its interactive prompt. Confirm Access policy identity/path scope first, rotate one value, verify signed-out denial and signed-in access, then rotate the second if necessary. Deleting and recreating the Access application changes its audience tag and requires coordinated secret rotation.

For an incident:

1. preserve the request ID, UTC time, route category, and observed status without copying private data;
2. if authorization or privacy is uncertain, protect the affected Operator paths or disable traffic before diagnosis;
3. inspect Worker deployment markers/logs and D1 metrics without exposing assertions or rows;
4. choose Worker rollback, forward code fix, or approved D1 Time Travel based on whether code or data is affected;
5. run remote integrity and credential-free smoke checks;
6. re-verify the one Access identity in logged-out and authenticated browsers; and
7. record measured facts and remaining data-loss risk in the incident/evidence log.
