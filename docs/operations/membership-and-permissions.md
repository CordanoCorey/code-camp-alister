# Membership and permission operations

Slice 16 stores adult Outpost Membership and every ordinary-account capability privately. Never infer authority from Current Outpost, Claimed Position, organization relationships, URLs, or cached client state. On every protected server request, load the current ordinary Account lifecycle, the active exact Outpost Membership when member access is required, and an unexpired active Permission Grant matching both `scope_type` and `scope_id`.

The sole Service Operator may bootstrap or recover the first membership and grant only after manual review and must record the reason as an audited exceptional action. Later membership decisions require `review-outpost-membership` for the same Outpost; grants require `manage-outpost-permissions` plus the capability being delegated in that exact scope. No ordinary Account may approve, verify, or grant itself.

Pastor assignment is an appointment, not a profile claim. Replace an appointment in one transaction by ending the current row and inserting the successor; the partial unique index is the final concurrent-write guard. Do not retry uniqueness failures as an overwrite.

For revocation or Outpost changes, end membership-derived grants and the old Membership in the same transaction. Account expiry is checked on every request. Permanent deletion removes private membership, requests, positions, appointments, and grants through the Account foreign-key cascade; sanitized immutable Permission Events contain no names or email.

All membership endpoints must return `Cache-Control: private, no-store`, `Pragma: no-cache`, non-enumerating errors, and no membership response may enter Cache Storage. Never import real officeholders, contact leaders, or modify remote D1 while following this runbook.
