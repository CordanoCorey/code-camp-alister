# Reference Event Outpost Plans

Reference Event Plans are private exact-Outpost operational data. Public event responses and search remain account-free and contain no plan lookup, count, Outpost ID, note, actor, Membership, or Permission Grant.

## Access and operation

- Every read derives one verified Membership and active `view-outpost-private` grant for the same Outpost from the current Account session.
- Add, status, refresh, detach, and cancel actions additionally require active `manage-outpost-calendar` at that exact Outpost. Position claims and wider or narrower grants never inherit.
- All private responses use `Cache-Control: private, no-store`, `Pragma: no-cache`, and the service worker ignores every `/api/workspace` request.
- Add validates a published canonical event/content/occurrence tuple, creates the calendar entry and plan in one transaction, and returns an existing exact-Outpost plan on replay.
- Refresh accepts current allowlisted public facts into the snapshot only. It never updates local calendar dates, timezone, location, or plan status.
- Detach is historical. Editors may retain the local group entry or use the default cancel path; no routine hard delete occurs.

## Review queue

The bounded private comparison classifies schedule, timezone, lifecycle, location, registration, required-fact conflict, and unpublication changes. A changed plan is presented as review-required without an automatic plan decision or notification. Organizer registration remains an external link; credentials, payment data, forms, and cookies are never stored or proxied.

## Incident checks

Confirm public `/api/public/events` payloads are identical with and without cookies, inspect Cache Storage for absence of `/api/workspace`, revoke the exact Membership/grant and repeat the next request, and run `npm run db:verify`, `npm run scale:check`, `npm run test:integration`, and `npm run check`.
