# Ordinary adult Account authentication QA

**Evidence date:** 2026-08-13
**Status:** Local Slice 10 completion evidence; production signup and email are not activated

## Boundary under test

This evidence covers the private adult-only ordinary Account flow implemented with pinned `better-auth@1.6.27`, Cloudflare Worker/D1, the app-owned eligibility gate, and the ordinary profile boundary. It does not establish identity, membership, position, Outpost affiliation, editing permission, Operator authority, or youth-account readiness.

The controlling source review is [`../research/adult-account-authentication.md`](../research/adult-account-authentication.md). Authentication cryptography and password verification remain Better Auth responsibilities. App-owned code supplies adult eligibility, profile validation, exact-origin enforcement, durable throttling, no-store responses, and the separate lifecycle authorization boundary.

## Automated evidence

The final local gate includes:

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

Focused `worker/ordinary-auth.test.ts` coverage uses the real Better Auth handler and the D1 adapter. Its 11 cases prove:

- eligibility is one-time and verified email is required before session creation;
- wrong credentials and unverified sign-in fail;
- verification replay does not create a session;
- recovery responses do not enumerate an address, reset tokens expire and are one-use under replay/concurrency, and password reset revokes existing sessions;
- expired/deleted recovery returns the same generic response while D1 blocks orphan reset material and password writes after lifecycle expiry;
- stale sessions fail and private profile reads ignore caller-supplied user identifiers in favor of the cookie principal;
- account and eligibility mutations reject cross-origin requests;
- the eligibility limiter remains in D1 at its ten-attempt boundary;
- normalized duplicate signup returns no account-exists error, and concurrent duplicate signup leaves exactly one user/profile/credential graph;
- local email preview is rejected off exact loopback;
- profile and lifecycle DTOs are private/no-store and omit password, Birth Year, session token, and provider internals; and
- guarded full deletion allows the same email to complete an entirely new eligibility, onboarding, verification, and profile flow with a new auth user ID.

Worker integration tests separately prove ordinary cookies do not satisfy the Cloudflare Access Operator boundary, public DTO allowlists omit account/profile/lifecycle data, private routes are not service-worker cache candidates, and production local bypasses are rejected. Migration 0011/0012 assertions prove zero seeded ordinary Accounts and the absence of Birth Year columns.

## Workerd and browser evidence

The in-app Chromium browser exercised the app through Vite's Cloudflare Worker runtime and local Wrangler D1 after migration 0012 applied. This executed the pinned Better Auth Worker bundle rather than only the Node/Vitest adapter.

Observed local flow:

- an under-18 evaluation returned the specific adult-only error and the controlled Birth Year input was empty immediately afterward;
- the International path exposed a country selector backed by the ISO country set; Canada and an optional subdivision were accepted, while unit coverage rejects `ZZ`;
- one synthetic local Account used a private unmatched Outpost claim, local one-time verification, sign-in, and restored private Account view;
- the Account view showed the actual International path, private Claimed Position with **Not Verified**, and private Current Outpost claim with **Membership Not Verified**;
- profile editing changed the path to USA, searched the private profile endpoint, deliberately selected the canonical Victory Assembly listing, and then displayed its stored South Texas district, South Central region, Plainsmen territory, and FCF status without inference; and
- no horizontal overflow was measured at the 390×844 phone check.

The password-change submit was not repeated manually because the focused automated tests execute expiry, replay, concurrency, and session revocation more deterministically. No browser credential or one-time URL is recorded here.

## Accessibility and privacy review

The signup and Account pages expose native labels, fieldsets, checkboxes, radios, selects, status/alert regions, and named buttons in the browser accessibility tree. The persistent private lifecycle panels use headings and status regions without modal interruption.

The development-only axe-core 4.13.0 supplement ran after the affected React views had rendered. The renewal view reported 44 passing rules and no violations; the generic ended-session view reported 41 passing rules and no violations. One `color-contrast` item remained **incomplete**, not a violation, because the shared header's decorative `aria-hidden` search glyph contains only a non-text character. It predates the Account panels and remains excluded from assistive output. This is an automated supplement and manual semantic review, not a WCAG conformance claim or named screen-reader test.

Private HTTP responses use `Cache-Control: private, no-store`, `Pragma: no-cache`, and `Referrer-Policy: no-referrer`. Auth/profile data is absent from public projections and the service-worker cache allowlist. Worker request logs retain only route category, request correlation, status, and duration; they do not retain email, cookies, request bodies, eligibility values, or bearer URLs.

## Limitations and production status

- Production D1, Cloudflare Access, Turnstile, Resend, the canonical HTTPS origin, and remote migrations were not configured or exercised.
- Production ordinary signup and production email delivery were not activated.
- The local preview sink is exact-loopback only and is not evidence that a message reached a recipient mailbox.
- A disposable synthetic Account remains only in ignored local D1 state; no Account or credential is seeded or source-controlled.
- Youth accounts, identity proofing, membership/position verification, MFA/passkeys, email change, voluntary deletion, and permissions remain outside this slice.
