# Ranger Outpost Hub

An independent, source-backed Royal Rangers directory and learning hub. The MVP includes a public U.S. outpost directory, a searchable advancement and handbook library, a representative public Reference Calendar, Royal Rangers and FCF information pages, global search, and a sole-operator publishing console.

This is not an official Royal Rangers, Assemblies of God, or Gospel Publishing House platform.

**Production status:** Slice 8's local directory-operation paths and a 103-candidate source cohort are implemented, but no public intake, nationwide publication, or remote lifecycle activation is claimed until the production D1, one-identity Access gate, Turnstile configuration, deployment, Operator review, and browser evidence are complete. See [`docs/qa/us-directory-population.md`](docs/qa/us-directory-population.md).

## Try the beta locally

Requirements: Node.js 22.12 or newer (Node 24 recommended) and npm.

```powershell
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The first start automatically creates and seeds a local D1 database. If Vite selects another port, use the address printed in the terminal.

The public site needs no account. Open `/operator` on localhost to use the **Local Operator Preview**. Local preview is deliberately unavailable on a deployed hostname.

### Add Your Outpost intake and fallback

On exact loopback, the values documented in `.dev.vars.example` enable private D1 proposals for local testing. On an unconfigured or failed production intake, the form clearly says nothing was saved and retains email/copy fallback. To enable **Open email draft**, create `.env.local` with a public support recipient:

```text
VITE_PUBLIC_SUPPORT_EMAIL=directory@example.org
```

Replace the example with the real published support address. When this setting is absent, the form offers a copyable submission and explains that the user must supply a recipient; the app never invents one. Restart the development server after changing the value.

`VITE_PUBLIC_SUPPORT_EMAIL` is deliberately public configuration and is included in the browser bundle. Never put an Access secret, token, private email address, or other credential in a `VITE_` variable.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Apply local database migrations and start the full Worker + React app. |
| `npm run db:setup` | Apply pending migrations to the local D1 database. |
| `npm run config:production:check` | Fail closed unless production has one real D1 UUID, no local bypass, and persisted logs. |
| `npm run db:migrations:production:list` | List migrations on the explicitly selected remote production D1 database. |
| `npm run db:migrate:production` | Apply source-controlled migrations to the explicitly selected remote production D1 database. |
| `npm run db:integrity:production` | Run read-only migration/count/provenance/search/foreign-key checks remotely. |
| `npm run deploy:production` | Require a clean release, build the selected Vite production environment, verify it, and deploy that output. |
| `npm run smoke:production -- https://...workers.dev` | Run the credential-free, read-only HTTPS production smoke suite. |
| `npm run db:verify` | Verify the 0008-to-0009 upgrade and fresh migration in disposable D1-compatible states. |
| `npm run operator:recovery:production` | Interactively stage the normal successor-acceptance flow when the current email is inaccessible. |
| `npm run outposts:manifests:build` | Deterministically compile reviewed research notes into bounded source manifests. |
| `npm run outposts:validate -- <path>` | Validate selected manifests before any write; defaults to `data/us-outposts`. |
| `npm run outposts:stage -- <path>` | Validate, then idempotently stage private candidates against the explicit local target. Never publishes. |
| `npm run outposts:stage:production -- <path>` | Require a clean production configuration and explicit HTTPS target, then stage only. |
| `npm run outposts:report` | Print non-PII batch, candidate, duplicate, provenance, lifecycle, and coverage counts. |
| `npm run test` | Run the domain-helper tests. |
| `npm run test:integration` | Run the Worker request-boundary, public/offline cache-policy, and private-preview contract tests. |
| `npm run lint` | Run Oxlint. |
| `npm run build` | Type-check and build the Worker and client. |
| `npm run check` | Run lint, tests, type checking, and both production builds. |
| `npm run scale:check` | Build, exercise, report, and remove an isolated 20,000-Outpost fixture. |

## Architecture

- React and Vite deliver the public and operator interfaces.
- A Cloudflare Worker serves the API and production assets.
- D1 stores a shared publication envelope plus normalized typed facts, relationships, deduplicated source documents, Field Provenance, revisions, published-safe search data, and an append-only audit trail.
- Cloudflare Access protects the deployed Operator Console. No app password is stored in the repository.
- The service worker caches only the public app shell, same-origin hashed assets, and previously viewed bounded public GET queries. Operator routes, mutations, errors, and private/no-store responses are explicitly excluded.

Migration 0007 is the one-way canonical content cutover, 0008 adds the fixed sole Operator lifecycle, and 0009 adds private proposals, annual Listing Verification, staged source batches, duplicate evidence, and canonical coverage views. Retained Slice 1–4 JSON and editorial tables are read-only recovery evidence; new reads and writes use the normalized model. Public and Operator lists use opaque keyset cursors (20 records by default, 50 maximum). See [`docs/operations/us-directory-operations.md`](docs/operations/us-directory-operations.md) for the review/staging runbook.

## Install and offline behavior

Installability must be checked against a production build, not the development server:

```powershell
npm run build
npm run preview -- --host 127.0.0.1
```

Open the printed local URL in an install-capable browser. The manifest provides independent 192×192 and 512×512 compass icons plus a 512×512 maskable icon; the site does not show its own install prompt. Use the browser's install action when it is available.

On the first successful online visit, the browser installs and activates the service worker. Reload once while still online so that the page is controlled; a later offline visit can then show the saved public shell and previously viewed bounded public queries. A yellow status message identifies saved data, retains its generated and verification dates, and asks the visitor to confirm current details with the source. A first-ever offline lookup shows an unavailable state. `/operator`, Operator responses, private notes, conflicts, audit data, and submission drafts are never cached.

The browser-based WCAG supplement uses the development-only `axe-core` dependency against the production preview. It is intentionally not part of `npm run check` because it requires a running browser and manual review of gradient, zoom, and keyboard behavior. The repeatable non-browser contracts are included in `npm run test:integration`; see `docs/qa/beta-readiness.md` for the tested routes and evidence.

### Event freshness policy

The beta puts an event field source in the private Freshness Queue 14 days before its 60-day verification window expires. The same deterministic queue also identifies stale sources, completion-eligible or completed occurrences, manually recorded broken links, open source conflicts, and explicit coverage gaps. These values are centralized in `shared/events.ts`.

Queue calculations do not write to D1. Past occurrences are rendered as completed without changing stored history; only an explicit protected Operator action applies a lifecycle write. Broken-source observations are also human-recorded in this slice—an unreachable state is never inferred by the public app. The public API and service-worker cache exclude queue state, conflict notes, observations, coverage-gap notes, and Operator identity.

The migrations contain only records tied to visible sources. The directory foundation keeps civil geography separate from the eight U.S. regions, two Spanish-language regions, their respective districts, and eight FCF territories. The Reference Calendar is intentionally separate from any future member-only Outpost Calendar and never represents an outpost's plan to attend. Missing data is shown as **Not verified**, never guessed. Protected handbooks, paid curriculum, restricted merit materials, and official artwork are not copied into the site.

## Production operator setup

Local Operator Preview is loaded from ignored `.dev.vars` and works only on the exact `localhost` or `127.0.0.1` hostname. It is absent from the named production environment. Copy `.dev.vars.example` only for local work.

Production uses one real remote D1 binding under `env.production`, a Vite build selected with `CLOUDFLARE_ENV=production`, and two server-only Access settings entered through interactive Wrangler secret prompts:

- `ACCESS_TEAM_DOMAIN`, the exact Access issuer URL
- `ACCESS_POLICY_AUD`, the Access application audience tag

Never put either setting in `VITE_*`, `.env`, committed files, command arguments, chat, or QA evidence. Production Access must cover `/operator`, `/operator/*`, `/api/operator`, and `/api/operator/*` with one exact-email Allow rule. During a staged transfer, D1 keeps the predecessor active and limits the matching successor to acceptance until the atomic tenure change.

Use [`docs/operations/production-deployment.md`](docs/operations/production-deployment.md) for launch, [`docs/operations/operator-lifecycle.md`](docs/operations/operator-lifecycle.md) for founder bootstrap/transfer, and [`docs/operations/us-directory-operations.md`](docs/operations/us-directory-operations.md) for Turnstile intake, manifests, retention, and Listing Verification.

See [docs/MVP.md](docs/MVP.md), [CONTEXT.md](CONTEXT.md), and the decisions in [docs/adr](docs/adr) for scope and terminology.
