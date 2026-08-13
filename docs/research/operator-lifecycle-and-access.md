# Operator lifecycle and Access constraints

Research checked against current official Cloudflare documentation on 2026-08-13 and the lockfile-resolved source for `jose@6.2.8` and `wrangler@4.122.0`. This note records only Slice 7 implementation constraints. **Confirmed** items are provider or package facts; **Project conclusion** items are design consequences inferred for Ranger Outpost Hub.

## Access identity token

### Confirmed

- An identity-based Access application token includes an IdP-verified `email`; `sub`, the Access user ID that is unique to an email within an Access account; `iss`, the team Access domain URL; `aud`, the application's audience tag; and Unix-time `iat`, `nbf`, and `exp` claims. `sub` can change if the user is removed and re-added to the Zero Trust organization or signs into another organization, so it is not a portable account identifier. [Application-token claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- A Worker must validate the `Cf-Access-Jwt-Assertion` token, not merely trust the header's presence: verify the signature with the team's JWKS and check the expected issuer, audience, and time claims. Cloudflare's example constrains the algorithm to `RS256`. [Cloudflare JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- In the lockfile-resolved `jose@6.2.8`, `jwtVerify` verifies the JWS before validating claims. Supplying `issuer` and `audience` makes those claims required and checks their values. `nbf` and `exp` are checked when present, but they are not required by default. `maxTokenAge` requires and bounds `iat`; other application-required claims must be named in `requiredClaims` and their types still need application validation. [`jose@6.2.8` `jwtVerify`](https://github.com/panva/jose/blob/v6.2.8/src/jwt/verify.ts), [`jose@6.2.8` claim validation](https://github.com/panva/jose/blob/v6.2.8/src/lib/jwt_claims_set.ts)
- A `jose@6.2.8` remote JWKS resolver retains fetched keys for ten minutes by default and applies a 30-second refetch cooldown. Those controls belong to the resolver instance, so recreating it per request discards the useful cache. [`jose@6.2.8` remote JWKS resolver](https://github.com/panva/jose/blob/v6.2.8/src/jwks/remote.ts)

### Project conclusion

- Verify with a module-reused remote JWKS resolver, `algorithms: ["RS256"]`, the exact configured `issuer` and `audience`, and require `email`, `sub`, `iat`, `nbf`, and `exp`. Reject non-string/blank identity claims and non-numeric time claims, normalize the verified email for equality matching, and retain only safe timing metadata in the in-memory Access principal. Do not use `sub` instead of the active D1 email: the transfer requirement is explicitly about the verified email identity, and `sub` is not stable across removal/re-addition.
- Successful JWT verification proves an Access email identity only. Every protected request must separately query D1 and authorize that normalized email as the active Operator or, for the narrow acceptance endpoints, the matching pending successor.

## Logout, re-authentication, and session invalidation

### Confirmed

- Access creates a global session token and an application token. The application token grants access for its whole lifetime. At expiry, Access can issue a new application token without prompting the IdP when the global token is still valid, after rechecking the stored identity against current policy. Consequently, application-token `iat` is token issuance time, not documented proof that the user just re-entered a password or completed a new IdP challenge. [Access session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)
- An end user can log out at `<application-domain>/cdn-cgi/access/logout` or `<team>.cloudflareaccess.com/cdn-cgi/access/logout`. Cloudflare says this revokes the session across applications, clears the relevant authorization cookie immediately, and causes previously issued tokens to stop being accepted after about 20-30 seconds. End users cannot log themselves out of only one Access application. [Access logout](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#log-out-as-a-user)
- Administrators can revoke every token for one application or revoke one user across applications. Revocation alone does not prevent a new session while the IdP identity and policy still permit it; after an administrator revokes a token, Access can prevent the user from logging in again for up to one minute. [Revoke Access sessions](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#revoke-user-sessions)
- Exact-email Access selectors are identity selectors checked at login, not continuously. A user can retain an already-issued application token until it expires or is revoked; policy is checked again when Access renews an expired application token. Cloudflare also states that a saved policy edit is then in effect for associated applications, but does not state that the edit revokes their already-issued tokens. [Access selectors](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/#cloudflare-access-selectors), [session lifecycle](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/), [policy editing](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/policy-management/#edit-a-policy)

### Project conclusion

- Removing the predecessor email from an Allow policy is **not** an immediate-session-invalidation mechanism. This is an inference from Cloudflare's documented token lifetime and login-time email evaluation. Atomic D1 replacement at acceptance must make the predecessor fail application authorization on the very next protected request, before Access cleanup finishes.
- For renewal, transfer initiation, and profile changes, record a short-lived intended action server-side, send the holder through the application-domain logout URL, then accept the action only with a newly verified Access token whose `iat` is after the re-auth intent and within the chosen short window. Do not put assertions or re-auth secrets in a URL. Account for the documented 20-30-second revocation propagation in the UX.
- Describe this as a **fresh Access session**, not guaranteed password re-entry. Cloudflare documents no general `auth_time` claim and may be satisfied by an active upstream IdP SSO session. If stronger re-entry is later required, configure and verify the chosen IdP/MFA behavior rather than inferring it from JWT `iat`.

## Temporary pending-successor access

### Confirmed

- An Allow policy can use the exact `Emails` selector. Multiple Include rules are OR conditions, so adding a second exact-email Include can admit the successor while retaining the predecessor. Access remains deny-by-default for identities that match no Allow policy. `Everyone`, a domain-wide selector, or `Login Methods: One-time PIN` as the Include would admit a much broader population; Bypass disables Access enforcement. [Access policies, rule logic, and misconfigurations](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- The exact successor must also be able to use a login method configured on the application. If one-time PIN is already configured, Access sends a PIN only when the email is allowed by policy; the PIN is single-use and expires after ten minutes. [Access one-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- Access's feature named **Temporary authentication** is an administrator-approval workflow that can grant a session for up to 24 hours. It is not required to create a manually controlled exact-two-email transfer window. [Temporary authentication](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/temporary-auth/)

### Project conclusion

- After Slice 7 D1 authorization is deployed and verified, the account owner can temporarily add exactly the pending successor email to the existing Operator Allow policy. Keep the predecessor email until acceptance. During this window both identities may pass Access, but only D1 may grant the predecessor ordinary Operator authority and the matching successor transfer-status/accept authority.
- Before and after the edit, inspect the whole attached policy set for `Everyone`, email-domain, unrestricted login-method, or Bypass rules. After acceptance, remove the predecessor exact email, test the resulting one-email policy, and optionally use per-user revocation for provider-side cleanup. Neither the cleanup nor its confirmation replaces D1 request-by-request authorization.

## D1 atomic lifecycle transitions

### Confirmed

- `D1Database.batch()` sends prepared statements in one call. Cloudflare guarantees that the statements execute sequentially and non-concurrently; the batch is a SQL transaction, and a failing statement aborts or rolls back the entire sequence. Results correspond positionally to the input statements. [D1 `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- D1 prepared statements support bound ordered or anonymous parameters. Values should be passed with `bind`, not interpolated into SQL. [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/#bind)
- D1 Sessions provide sequential consistency and can start on the primary, but they are not a substitute for an atomic multi-statement transaction. A `batch()` on a session has the same semantics as database `batch()`. [D1 Sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession)
- The lockfile-resolved Wrangler local runtime matches the documented model: Miniflare's D1 request handler runs the query array inside `transactionSync`, and `wrangler d1 execute` sends split local SQL statements through `db.batch()`. This corroborates local-test behavior only; the Cloudflare D1 documentation above remains the production contract. [`wrangler@4.122.0` Miniflare D1 transaction](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.122.0/packages/miniflare/src/workers/d1/database.worker.ts), [`wrangler@4.122.0` local D1 execute](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.122.0/packages/wrangler/src/d1/execute.ts)

### Project conclusion

- Implement bootstrap, renewal, transfer acceptance, and recovery staging as one bound `batch()` apiece. Put all state preconditions into SQL (`state`, active tenure, normalized identity, transfer state/expiry, token hash, and optimistic version), back them with fixed-key/unique/foreign-key/check/trigger constraints, and make later writes depend on the same matched state. Inspect affected-row metadata or returned rows so a conditional no-op is an explicit conflict, never success.
- A JavaScript read followed by independent writes is not sufficient for singleton claim or acceptance. Two concurrent requests must contend on database-enforced conditions. The losing transaction must either make zero dependent changes or hit a constraint/trigger that rolls the whole batch back.
- For bootstrap, conditionally create tenure 1 from the still-unclaimed singleton, then update that fixed singleton and append eligibility/audit rows tied to the created tenure in the same batch. For renewal, condition the due-date update on the active tenure and optimistic version, then append the renewal and privileged-event rows in that batch.
- For transfer acceptance, condition creation of the next tenure on the active singleton plus the matching unexpired pending transfer and token/identity checks; then close the old tenure, replace the singleton identity, create eligibility, scrub transfer PII/token material, and append non-PII events in the same batch. Any constraint or statement failure must leave the predecessor active. Tests must exercise both rollback-on-error and conditional-no-op race paths against the local Wrangler runtime.

## Implementation limits established by this research

- No external lifecycle delivery mechanism is justified for Slice 7: the required notice is in-app. Workers Cron pricing and limits therefore do not affect this implementation.
- Provider policy/session cleanup is defense in depth and operational hygiene. It cannot enforce the sole-Operator invariant as promptly or precisely as the application-side D1 lifecycle authorization.
- Neither Access nor D1 can recover loss of the entire Cloudflare account and all provider recovery methods; the application recovery tool can only stage the same pending-successor acceptance flow while the account owner still controls Cloudflare.
