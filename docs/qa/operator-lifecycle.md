# Operator lifecycle evidence

**Evidence date:** 2026-08-13
**Status:** Local implementation and verification passed; remote activation not performed

This log contains no personal data, Cloudflare identifiers, assertions, Birth Year, tokens, bookmarks, or usable transfer links.

## Deployment truth

Repository and configuration inspection still show Slice 6 as local-only: the production D1 binding has no real UUID, `docs/qa/production-launch.md` has no production URL/release/deployment/remote migration/Access evidence, and the accumulated working tree remains uncommitted on `codex/ranger-outpost-production` at base commit `434888b7f566eb54bfc65f0a4b2931ba4d30cdac`. Therefore no production bootstrap, notice delivery, transfer, Access cleanup, old-session rejection, or remote cache test is claimed here.

## Local architecture and privacy evidence

- Migration 0008 creates one fixed unclaimed singleton without PII, numbered tenures with one-open-tenure uniqueness, immutable adult eligibility, append-only renewals/notices/lifecycle events, one pending expiring transfer, hashed re-auth/acceptance tokens, and nullable tenure references for legacy editorial history.
- Worker verification requires Access signature, RS256 algorithm, issuer, audience, `email`, `sub`, `iat`, `nbf`, and `exp`. Authorization then queries D1 before any content read/write.
- Local preview uses only `local-preview@operator.invalid` on exact `localhost`/`127.0.0.1` and completes the same lifecycle routes.
- Birth Year has no schema column. HTTP/integration tests inspect schema, response, logs, and public DTOs for absence after a real claim.
- Transfer tests show fragment-only links, pending-successor route restriction, mismatch rollback, cancellation, atomic acceptance, terminal PII/token scrubbing, one open tenure, replay failure, and immediate predecessor rejection.
- Expiry tests show `423 renewal-required` for normal content work while account status, renewal, and transfer remain available. Notice insertion is idempotent.
- Recovery tests show a staged `recovery` transfer only, with no direct update/delete of the singleton; the production script uses interactive inputs and `finally` cleanup.
- Service-worker policy ignores every `/operator`, `/operator/*`, and `/api/*` request, including lifecycle routes.

## Local verification results

The final repository gates passed on 2026-08-13:

```powershell
npm run db:setup          # passed; no migrations remained
npm run db:verify         # passed; upgrade-from-0007 and fresh-through-0008
npm run scale:check       # passed; 20,006 Outposts, zero foreign-key problems
npm run test:integration  # passed; 5 files, 44 tests
npm run check             # passed; lint, 19 files/110 tests, Worker/client builds
git diff --check          # passed; line-ending notices were informational
```

Because the preserved Slice 1â€“6 worktree contains untracked files, an explicit trailing-whitespace scan across every Slice 7 file also passed. Unrelated pre-existing Markdown hard breaks elsewhere in the untracked repository were left unchanged.

Migration verification retained 139 content records, 343 Field Provenance rows, seven prior content assertions, and seven Slice 7 lifecycle assertions on both paths. The scale gate exercised public directory/search/events, Operator pagination, and freshness-queue queries against the expanded schema.

## Local browser scenarios

The in-app browser exercised the local-preview identity through the real Worker and local D1 on 2026-08-13. Only synthetic `.invalid` identities were used.

- The unclaimed route exposed the private first-sign-in form, labelled fields, the bounded existing-Outpost choices, the No Current Outpost choice, the exact adult attestation, and no ordinary editor data. Claim created tenure 1 and immediately opened the active console.
- The active Account panel showed only the holder's own synthetic email, Display Name, No Current Outpost, tenure number, activation/due dates, and confirmed eligibility without Birth Year.
- Moving the local due date into the past produced the persistent `Renewal required` status, hid ordinary editor work, and retained Account, renewal, and transfer controls. **Yes, renew for four years** restored the active console and displayed the new exact due date.
- A seven-day transfer was staged to a synthetic successor. The only plaintext token appeared once in a fragment link. Opening that link in a fresh tab cleared the fragment from the visible URL before the Account request completed. The predecessor session still had ordinary authority and cancelled the pending transfer; the active tenure remained unchanged.
- At a 390 by 844 viewport, the Account card and forms reflowed without horizontal overflow (`scrollWidth` equalled `clientWidth`). A 640 CSS-pixel viewport supplied the repository's documented 200%-zoom reflow proxy and likewise had no horizontal overflow. Both states retained readable labels and controls.
- The semantic browser snapshot exposed the skip link, landmarks, labelled fields, checkbox names, headings, status/alert regions, and ordinary buttons. Browser console inspection returned no warnings or errors.

The in-app browser's read-only inspection sandbox did not expose Cache Storage, service-worker globals, or reliable keyboard-focus state. Therefore this log does not claim a live Cache Storage or keyboard traversal result. The repeatable service-worker policy tests instead prove that `/operator`, `/operator/*`, every `/api/*` route, mutations, `no-store` responses, and error responses are ineligible for Cache Storage; Worker tests prove lifecycle responses are `no-store`. The existing beta keyboard/focus and axe evidence still covers the shared shell, while the Slice 7 semantic snapshot and responsive pass cover the new Account controls. A deployed keyboard, axe, and Cache Storage inspection remains in the production checklist.

## Known limits

- No external notice delivery is configured; the required two-calendar-month notice is in-app.
- A fresh Access token does not prove upstream password re-entry when an IdP SSO session remains active.
- Access-policy cleanup is manual; the recorded checkbox is a human confirmation, not provider verification.
- Complete loss of the Cloudflare account and every provider recovery method remains outside application recovery.
