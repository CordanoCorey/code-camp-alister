# Sole Operator lifecycle operations

This runbook operates the one transferable Operator Account defined by ADRs 0010 and 0015. Cloudflare Access proves an email identity; D1 decides whether it is the active Operator or the matching pending successor. Never treat an Access token alone as Operator authority, and never put an email, assertion, token, audience, account ID, or usable transfer link in logs or QA evidence.

Current provider behavior and the fresh-session limitation are documented in [`../research/operator-lifecycle-and-access.md`](../research/operator-lifecycle-and-access.md). A fresh Access JWT `iat` proves a newly issued Access application token, not necessarily password re-entry at the upstream identity provider.

## Production rollout order

Do not begin this sequence until the Slice 6 production resource evidence is real. The repository currently has no production D1 UUID, URL, release commit, remote migration state, Access application, or Operator identity recorded.

1. Confirm a clean, traceable release; run every local gate; inspect the production Access application; and capture the current D1 Time Travel bookmark without recording it in QA.
2. Apply additive migration `0008_operator_lifecycle.sql` to the explicit `--env production --remote` database and run `npm run db:integrity:production`. Expect one unclaimed singleton, no open tenure, no pending transfer, seven passing lifecycle assertions, and zero foreign-key rows.
3. Deploy the Slice 7 Worker and UI immediately. Verify `/api/health` reports schema `0008`; public APIs remain account-free; and a valid Access identity cannot use content routes while the singleton is unclaimed.
4. With the existing one-email Allow policy, complete first-sign-in setup: Display Name, optional bounded existing-Outpost selection, transient Birth Year, and the adult attestation. Verify tenure 1 and a tenure-labelled test write.
5. Run signed-out, active-Operator, public DTO, log, Cache Storage, keyboard, mobile/reflow, and accessibility checks.

Never add a second Access email until the Slice 7 D1 active/pending authorization is deployed and verified. Never roll the Worker back to Slice 6 code during a two-email transfer window: Slice 6 trusted any valid Access identity as the Operator.

## Founder bootstrap

The founder is not seeded. Protect `/operator`, `/operator/*`, `/api/operator`, and `/api/operator/*` first with one Allow policy whose only Include rule is the exact founder email. Confirm there is no Everyone, email-domain, unrestricted login-method, or Bypass rule.

Sign in through that policy and complete the displayed setup. The verified email comes only from the Access JWT. Birth Year is evaluated in request memory and discarded; D1 retains only the eligibility result, confirmation time, and attestation version. A failed or competing claim must leave the singleton unclaimed. Do not record any submitted value in deployment evidence.

## Renewal and fresh Access session

The due date is four UTC calendar years after activation or the applicable renewal base. The persistent console notice opens exactly two calendar months before the due instant. Early renewal adds four calendar years to the existing due date; renewal at or after expiry adds four calendar years to confirmation time.

Select **Yes, renew for four years**. If the Access JWT is too old, start the displayed fresh-session flow. The server stores a short-lived hashed intent in an HttpOnly, Secure, SameSite=Strict cookie, sends the browser through `/cdn-cgi/access/logout`, and consumes the intent only after a later token `iat`. Allow the documented Access logout/revocation propagation delay. Do not claim this guarantees password re-entry unless the configured IdP behavior has separately been verified.

At expiry, public service remains available and the account is not deleted or reassigned. Ordinary content/source/conflict/coverage mutations return `423 renewal-required`; account status, renewal, transfer, cancellation/acceptance, and recovery remain reachable.

## Normal staged transfer

Run `scripts/operator-access-transfer-wizard.sh` in Git Bash (or follow the same five stages in the console/runbook). It never collects credentials or persists successor data.

1. In Operator Account settings, enter the successor Display Name, exact email, and optional existing Hub Outpost; deliberately confirm; and stage the seven-day transfer. Copy the one-time link immediately. Its token is after `#transfer=`, so browsers do not send it in the HTTP request or referrer; the SPA removes the fragment from history before its first API call.
2. In Cloudflare Access, temporarily add only that exact successor email to the existing Allow policy. Retain the predecessor. Recheck every attached policy for broad or Bypass rules.
3. Send the link through a channel controlled by the two people. The matching successor signs in, enters their own transient Birth Year, checks the adult attestation, accepts site responsibility, and accepts the shown Current Outpost/No Current Outpost.
4. Acceptance atomically closes the predecessor tenure, creates the next number, replaces private active identity/settings, scrubs transfer PII and token hash, and writes a non-PII event. Any failure leaves the predecessor active. The predecessor's existing Access token now fails D1 authorization immediately.
5. The successor follows the mandatory banner: remove the predecessor exact email, verify one exact-email Allow rule and no broad/Bypass rule, test the old identity in a separate session, then record the cleanup confirmation. That confirmation is a human statement, not automated provider verification.

The predecessor may cancel before acceptance. Opening account status expires an overdue pending transfer and scrubs it. A cancelled or expired token cannot be reused. Changing the same person's email uses this transfer process; never edit `operator_account.verified_email` directly.

## Lost-email recovery

From an authenticated local Wrangler session owned by the intended Cloudflare account, run:

```powershell
npm run operator:recovery:production
```

The tool refuses non-interactive use, requires an HTTPS production origin and typed hostname confirmation, runs the production config check, displays the remote migration/integrity state, captures the current Time Travel bookmark, and asks for successor data interactively rather than through command arguments. It stages one `recovery` pending transfer from the current tenure; a database trigger appends the non-PII recovery event. The current identity and tenure remain active.

The tool writes successor data only to a permission-restricted temporary SQL file, stores only the token hash in D1, prints the fragment link once, and deletes the temporary directory in `finally`. Then perform the same exact-two-email Access window and normal adult-attested acceptance above. Do not paste terminal output, the bookmark, email, or link into chat or QA.

If the script cannot use the intended production binding or assertions are not all passing, stop. Do not substitute a direct singleton update. Loss of the entire Cloudflare account and every provider recovery method cannot be solved inside this application.

## Privacy and audit checks

- Current settings may show the active holder their own Display Name and email. Transfer acceptance never shows predecessor identity.
- Editorial history stores `operator_tenure_id` and `Operator tenure N`; lifecycle events carry tenure/request/transfer references only.
- Terminal transfers retain state/timestamps/tenure references but no name, email, Outpost, or token hash.
- Public DTOs, search, health, service-worker caches, custom logs, and production smoke output contain no lifecycle/account data.
- Do not restore a pre-0008 Worker while two Access emails are allowed. A D1 Time Travel restore is in-place data recovery and does not roll back Worker code.
