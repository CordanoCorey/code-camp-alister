# Outpost Workspace calendar operations

Every `/workspace` page and `/api/workspace*` response is private and `no-store`. The service worker ignores both route families. Authorization is evaluated from the current ordinary session, unexpired Ordinary Access Term, verified exact-Outpost Membership, and active unexpired exact-scope grants on every request. Claimed Position, Current Outpost, Pastor appointment, URL values, broader-scope grants, and client state grant nothing.

Slice 16 enforces at most one active verified Membership per Account, so the private route resolves one deterministic current Outpost without accepting an Outpost ID from the URL.

An editor holding `manage-outpost-calendar` must explicitly choose an IANA timezone before the first entry. Timezone, edit, and cancellation writes use optimistic versions. Creates use a unique per-Outpost request key. An affirmatively archived Outpost Workspace is `read-only`; preserve entries and sanitized immutable Calendar Entry Events. Cancellation is a state transition, never routine deletion.

Entries are group-owned. Never enter or import attendee names, RSVPs, attendance, youth progress, parent/child relationships, contact or medical data, transportation lists, room assignments, or private residences. Do not copy private values into public DTOs, search, metadata, logs, analytics, notification previews, or Cache Storage. Operator recovery must use the `Service Operator` actor label and remain separately audited; this slice does not mutate production or configure scheduled automation.
