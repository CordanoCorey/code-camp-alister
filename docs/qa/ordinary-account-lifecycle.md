# Ordinary Account lifecycle QA

**Evidence date:** 2026-08-13
**Status:** Local Slice 11 evidence; production email, Cron, expiration, and deletion are not activated

## Policy and architecture exercised

ADR 0019 and `shared/ordinary-account-lifecycle.ts` centralize the ordinary policy: one calendar year from activation or the existing timely-renewal due instant, a one-calendar-month notice window, pre-expiry explicit renewal only, and deletion six calendar months after confirmed provider acceptance of the warning. Public page views are not activity. The separate four-year Operator lifecycle is unchanged and never auto-deleted.

Migration 0012 creates one private lifecycle per active auth user, renewal events, a durable warning outbox, sanitized lifecycle events, due indexes, session/password-recovery persistence guards, a guarded full-deletion transition, and the seventh maintenance job. It broadens the loopback preview sink only with `renewal-warning`. No soft-deleted user, email/name tombstone, or public former-holder history exists.

## Migration and scale evidence

`npm run db:verify` passed both a populated upgrade from 0011 and a fresh install through 0012. Each scenario retained 139 content records, 343 Field Provenance rows, and seven passing assertions for every migration assertion set 0007–0012. The populated upgrade fixture proves an Automation Alert, System Maintenance Event, and daily aggregate survive the constrained maintenance-job table rebuild. `PRAGMA foreign_key_check` returned no rows.

The real local Wrangler D1 also upgraded without reset after its earlier uncommitted Slice 9 alert rows were normalized to the current migration-0010 column shape. Migration 0012 preserved those local alert/review rows. Final password-recovery guard triggers added during hardening were applied directly to that ignored local database because 0012 was already recorded there; fresh and production databases receive them from the source migration. This local-only development-history repair is not a production migration claim.

`npm run scale:check` passed against an isolated SQLite/D1 adapter fixture with 20,000 synthetic Outposts and 50,000 synthetic ordinary Accounts/lifecycles. It reported zero foreign-key problems and indexed plans for:

| Queue | Rows returned | Average local query time | Required index observed |
| --- | ---: | ---: | --- |
| due warning | 51 | 25.266 ms | `ordinary_lifecycle_notice_due` |
| exact expiration | 51 | 0.073 ms | `ordinary_lifecycle_expiration_due` |
| deletion deadline | 51 | 0.060 ms | `ordinary_lifecycle_deletion_due` |
| one-user session revocation | 1 | 0.011 ms | `session_userId_idx` |

These are deterministic local measurements, not Cloudflare production latency or quota guarantees.

## Focused behavioral evidence

Plain TypeScript tests cover leap-day and end-of-month clamping, exact notice/expiry boundaries, deletion-from-confirmed-delivery arithmetic, timely renewal from the existing due instant, and the expired route-capability matrix.

Repository and maintenance tests prove:

- lifecycle activation/backfill is idempotent and uses the verified profile's original `activated_at`;
- concurrent/replayed renewal creates one event and one new due time;
- notice delivery starts exactly at the notice boundary, reclaims stale `sending` claims after a crash, uses one stable provider key across replay/retries, samples confirmation after provider acceptance, and is accepted once per term;
- transient delivery advances the durable job/retry due time through bounded backoff for at most five attempts, then coalesces one private critical alert;
- no delivery confirmation means no deletion deadline;
- provider acceptance sampled at/after the due instant is cancelled and cannot start a deletion deadline;
- renewal cancels the old warning/deletion schedule, including a provider request already in flight, and an old deadline cannot delete the renewed Account;
- exact expiry revokes sessions, blocks profile/renewal and later session creation, while public and Operator data remain unchanged;
- expiry blocks password-reset verification/credential writes, and the D1 verification guard rejects a reset row whose user was concurrently deleted;
- exact deletion removes user, credentials, sessions, verification/reset rows, email previews, private profile/claim, eligibility challenge/result, lifecycle deliveries/events, and lifecycle itself in one guarded D1 batch;
- direct arbitrary deletion remains rejected, and a second guarded execution is a no-op; and
- after deletion, the old password cannot sign in and the same email can only return through a wholly new eligibility/onboarding/verification graph.

The warning adapter resolves the destination just-in-time from Better Auth, sends only the ordinary Account warning, links to normal `/account`, sends no bearer secret, and stores only idempotency/outcome fingerprints. Provider acceptance starts the deadline; recipient mailbox delivery is not claimed.

## Browser and accessibility evidence

The in-app Chromium browser exercised the lifecycle through the Cloudflare local runtime with a synthetic Account:

- the private Account page showed the exact due date and persistent renewal notice;
- the notice stated that renewal does not verify membership, position, or Outpost association;
- **Yes, renew for one year** worked at 390×844, returned the next exact due date, removed the old notice, and produced a polite confirmation;
- the phone viewport measured no document-level horizontal overflow;
- an expired/revoked session received a generic, non-enumerating ended-session/deletion explanation with Sign in and public-browsing actions; and
- public navigation remained available.

Rendered axe-core 4.13.0 scans reported zero violations for both the renewal view (44 passing rules) and ended-session view (41 passing rules). The one incomplete contrast review was the shared header's decorative, `aria-hidden` non-text search glyph, not a lifecycle control. Keyboard operation used native buttons, radio/select controls, and normal focusable actions. This is not a WCAG conformance certification.

## Operations and limitations

The `ordinary-account-lifecycle` job is installed paused-first with a one-hour configured cadence and processes at most 25 lifecycle actions in deterministic order when enabled. Warning failure returns a sanitized task failure without blocking public service or unrelated maintenance jobs. Ordinary warning attempts/events remain private and cascade away at Account deletion; only non-identifying aggregate maintenance counts remain.

Production Resend, warning delivery, Cron execution, private Automation Alert observation, session expiration, and destructive deletion were **not activated or tested**. No remote migration, email send, Cloudflare write, deployment, or provider change was performed. A later production rollout must remain paused-first, inspect due counts, use only a designated non-personal test Account, capture a D1 Time Travel bookmark for service disaster recovery, and separately approve deletion. Time Travel must never be offered as end-user Account restoration.
