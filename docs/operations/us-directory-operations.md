# U.S. directory operations runbook

Updated: **2026-08-13**

This runbook covers private proposals, source-controlled population batches, annual Listing Verification, coverage, and temporary proposal data. It does not authorize a bulk national-locator import or automatic publication.

## Local intake and review

Copy the local-only values from `.dev.vars.example` into ignored `.dev.vars`, then start the app:

```powershell
npm run dev -- --host 127.0.0.1
```

The local intake bypass works only when `LOCAL_PUBLIC_INTAKE_BYPASS=true`, the signing secret is at least 32 characters, and the request hostname is exactly `localhost` or `127.0.0.1`. It cannot enable intake on a deployed hostname. Open `/operator`, claim the local Operator Account, and use:

- **Directory Submission Queue** for private public-form proposals;
- **Staged Outpost Candidates** for source-controlled manifests;
- **Freshness Queue** for annual verification, grace/expiry review, broken sources, archives, and six-month proposal PII deadlines.

Every proposal or staged candidate must be checked against the linked Source Document. Candidate matches are evidence only. Conversion creates or updates a private draft through the canonical content, Field Provenance, revision, and tenure-audit path. Preview and publish are separate Operator actions.

## Population manifests

Rebuild the deterministic manifests from the reviewed evidence notes and validate them:

```powershell
npm run outposts:manifests:build
npm run outposts:validate
npm run outposts:validate -- data/us-outposts/cohort-north-01.json
```

Validation is mandatory before any write. A batch contains at most four candidates and 24 source-evidence rows. One invalid manifest stops the entire command before the first request.

With the local app running and the local Operator Account active:

```powershell
npm run outposts:stage
npm run outposts:report
```

Both commands default to `http://127.0.0.1:5173`. Use `--origin` only for another explicit non-production local target. Staging is checksum-idempotent and writes only private batch, staged-candidate, proposed-provenance, and candidate-match tables. It does not create canonical content.

In the Operator Console, open each staged candidate, review every direct and derived source plus any candidate matches, record the duplicate decision and reason, and select **Convert to draft only**. Corrections require the selected stable Hub Outpost ID and optimistic version. Review the private draft and its Field Provenance before publishing. Publication establishes a one-year Listing Verification cycle and cannot be performed by a manifest or CLI command.

## Explicit production staging

Production staging is intentionally named separately:

```powershell
$env:OUTPOSTS_PRODUCTION_ORIGIN='https://the-reviewed-production-origin.example'
$env:CF_ACCESS_SESSION_TOKEN='short-lived token for the sole Operator Access session'
npm run outposts:stage:production
```

The command first runs the production configuration gate, validates every selected manifest, requires a clean worktree, requires a non-loopback HTTPS origin, and uses a short-lived session token for the same sole Operator identity already allowed by Access. It does not add a service identity or bypass the exact-email policy. Never put the token in source control, command history, chat, `VITE_*`, QA evidence, or a manifest. The command stages only; it cannot apply or publish.

Remote migration and staging remain pending until the production D1 UUID, Access application, Time Travel bookmark, Turnstile settings, and deployed Worker are evidenced. Follow [production-deployment.md](production-deployment.md) before any remote mutation.

## Production public intake

Online D1 intake enables only when all of these Worker-side values are present and consistent:

- public `TURNSTILE_SITE_KEY`;
- secret `TURNSTILE_SECRET_KEY`;
- secret `INTAKE_SIGNING_SECRET` of at least 32 characters;
- `TURNSTILE_EXPECTED_HOSTNAMES`, containing the exact request hostname.

The Worker verifies the Turnstile token through Siteverify, requires action `outpost-submission`, requires an exact hostname match, and fails closed on timeout, provider error, invalid/replayed token, or incomplete configuration. The Free Turnstile product is the confirmed no-cost control. A no-cost Workers Rate Limiting binding entitlement was not confirmed in official plan documentation, so no unverified binding is assumed. Timing token, honeypot, same-origin/content-type/body-size checks, typed validation, and the active-exact-duplicate constraint provide additional bounded controls.

If intake is unavailable, public browsing continues and the form says the proposal was not saved. Email preparation and copy remain available.

## Listing Verification and archive

- Publication or reverification creates an append-only, tenure-attributed Verification Cycle with an immutable snapshot of every supporting field/source URL/check date. Later edits cannot rewrite cycle evidence.
- Due date is one calendar year after the checked date, clamped at month end.
- The private warning begins two calendar months before due.
- At due, the Freshness Queue exposes an explicit, reasoned **Enter grace** action. Grace is stored as lifecycle state and ends 30 calendar days after due; the listing stays public during grace with its actual last-verified date.
- After grace, the Operator records expiry with a reason. Public directory, search, detail, bootstrap, and offline eligibility are removed atomically. Content history remains published internally because expiry is not closure.
- Reverification uses the ordinary canonical edit and the same Hub Outpost ID. Every populated public field must have a source checked on the new Listing Verification date; unsupported optional facts must be omitted. It creates a new cycle and restores the projection.
- Archive requires an effective date and an affirmative Source Document already attached to the Outpost. Locator absence, a broken page, or non-response is insufficient. Routine Outpost deletion is blocked.

## Proposal privacy and retention

Reply email and notes are private review data. They never enter public serializers, search, generic content audit snapshots, logs, health responses, or Cache Storage. Terminal conversion, duplicate, rejection, and withdrawal scrub them atomically. An unresolved proposal receives a six-calendar-month retention deadline; the private Freshness Queue exposes an explicit **Scrub personal data** action that converts it to non-PII terminal history. Slice 8 does not claim scheduled autonomous cleanup.

Do not accept youth/member rosters, personal leader contacts, phone/fax lists, attendance, church account numbers, payment/charter details, coordinates, challenge payloads, IP addresses, or user agents.
