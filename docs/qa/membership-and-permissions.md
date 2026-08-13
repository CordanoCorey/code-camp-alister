# Membership and permissions QA — 2026-08-13

## Automated evidence

- `npm run db:verify`: populated upgrade from `0013` and fresh install through `0014` passed all four Slice 16 migration assertions with zero foreign-key failures.
- `shared/membership-permissions.test.ts`: exact-scope grants do not inherit across scope types or IDs; expired grants, self-approval, self-grant, privilege amplification, and cross-scope delegation fail closed.
- `worker/membership-permissions-db.test.ts`: the partial unique index rejects a competing second active Pastor; Account deletion cascades Membership and Permission Grants; public schemas contain none of the prohibited private fields.
- `worker/account-profile-repository.test.ts`: selecting a Claimed Position creates zero Permission Grants. A Current Outpost change ends the old verified Membership, revokes membership-derived grants, and withdraws pending requests in the profile-update transaction.
- Service-worker policy excludes every `/api/*` private route and refuses responses marked `private` or `no-store`.

## Checkpoint scope and manual/browser limitations

Slice 16 is intentionally accepted as a foundation-only schema and domain checkpoint. It establishes private Membership, Position Verification, Pastor Appointment, exact-scope Permission Grant, immutable sanitized Permission Event, conflict-assignment storage, authorization primitives, revocation on Current Outpost change, migration verification, and scale-query evidence.

Leader review, grant/revoke administration, delegated content-write, and conflict-resolution HTTP/UI flows are explicitly deferred; they are not prerequisites for the Slice 17 private calendar because Slice 17 consumes the same exact-scope grant contract through its own private calendar interface. No claim is made here for end-to-end membership request, approval, permission-administration, mobile, keyboard, focus, axe, or browser Cache Storage evidence. No production data, bindings, leaders, messages, or external notifications were touched.
