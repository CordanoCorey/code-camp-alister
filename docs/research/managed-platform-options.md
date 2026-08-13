# Managed platform options for Ranger Outpost Hub

**Research date:** 2026-08-12  
**Repository state reviewed:** React 19 + TypeScript + Vite 8 single-page application  
**Source policy:** Primary vendor documentation only. Pricing and product-stage labels are snapshots and must be rechecked before purchase or launch.

## Scope

This note compares managed technical foundations for a future Ranger Outpost Hub that may eventually need:

- roughly 20,000 verified outpost listings and 50,000 adult accounts;
- email/password sign-in, email verification, password recovery, MFA, and preferably passkeys or security keys;
- one highly privileged, privately provisioned Operator Account;
- outpost-, district-, region-, national-, FCF-, country-, and organizational-unit-scoped permissions that do not form one hierarchy;
- structured but country-flexible geography and field-level provenance;
- full-text search, scheduled source monitoring, reminders, and expiration jobs;
- a durable, append-only or tamper-resistant application audit history;
- managed backups and point-in-time recovery (PITR);
- transactional email; and
- the existing Vite frontend delivered as an installable PWA.

The first public release is narrower: public users only read verified content, and only one privately provisioned Operator Account can edit it. It has no ordinary member accounts, private outpost calendars, donations, uploads, youth accounts, copied protected curriculum, or delegated permissions. The larger comparison is retained so the launch choice does not accidentally block the later account-enabled phase.

This is a capability comparison, not a platform decision.

## Executive comparison

| Foundation | Strongest native fit | Important extra service or custom work | Recovery position | Principal tradeoff |
|---|---|---|---|---|
| **Supabase** | Managed PostgreSQL, relational constraints, JSON, geospatial extensions, Row Level Security (RLS), email/password auth, TOTP MFA, Postgres full-text search, cron | Production SMTP/transactional email; semantic application audit design; passkeys are experimental | Pro includes seven days of daily backups; true PITR is a separately priced add-on | Domain model is natural in Postgres, but true PITR currently dominates the base price |
| **Firebase** | Mature integrated web auth, Firestore, Security Rules, managed Functions/Scheduler, Google Cloud logging | Standard-edition full-text search needs another service; general transactional email needs another service; semantic audit is custom; no documented native end-user passkey option found | Firestore offers paid seven-day PITR plus scheduled backups | Low auth operations, but the overlapping relational model needs careful document references and denormalization |
| **Convex** | TypeScript functions, reactive document database with references, native scheduling, native search, very low backend-operations burden | Production-grade advanced auth is normally a third-party provider; transactional email is another provider; authorization and semantic audit are application code | Professional has periodic snapshot backups; no point-in-time recovery is documented | Excellent TypeScript workflow, but native search is a weak match for non-Latin global content and recovery is snapshot-based |
| **Cloudflare Workers + D1** | Low-cost Workers, relational SQLite/D1, native FTS5, Cron/Queues/Workflows, always-on D1 Time Travel, direct React/Vite hosting | Public-app identity is not native: add managed Clerk or run Better Auth; semantic audit is custom; email service is currently public beta | Seven-day Time Travel on Free or 30 days on Paid, with no additional history/restore charge | Attractive price and recovery/search primitives, but it is a composed stack rather than one integrated application platform |

Based on their published storage/account limits, none of the four is excluded merely by the proposed record counts. That is an inference, not a capacity guarantee: content size, public search traffic, source-monitor frequency, notification volume, geographic query patterns, and audit retention determine the real load and cost.

## Smallest shape for the read-only, sole-operator launch

The initial release does not need the 50,000-account architecture on day one. Its smallest sensible shape is:

1. keep the existing Vite/React frontend;
2. host static public assets on a CDN-capable static host;
3. keep verified content in one managed database or a build-time content store;
4. expose only read APIs publicly;
5. privately provision exactly one Operator identity with public signup disabled;
6. require MFA for that identity;
7. route all writes through a small server-side admin API that writes a semantic audit event in the same transaction where the database permits it; and
8. enable automated backup/recovery before real data is entrusted to the service.

There are several small implementations of that shape, without selecting among them:

- **Supabase launch shape:** Vite static hosting anywhere, Supabase Postgres/Auth, public signup disabled, one admin-created user, RLS-denied public writes, and daily backups on Pro. Supabase documents direct Vite/React use. ([React quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs), [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), [backups](https://supabase.com/docs/guides/platform/backups))
- **Firebase launch shape:** Firebase Hosting, one privately created Firebase Authentication user, Firestore, and one server Function for writes. Hosting supports static SPAs/PWAs, while Firestore Security Rules deny public writes. ([Hosting](https://firebase.google.com/docs/hosting), [web/PWA guidance](https://firebase.google.com/docs/web/pwa), [Security Rules](https://firebase.google.com/docs/rules))
- **Convex launch shape:** keep Vite, add Convex functions/database, and use an external identity provider for the one operator. Convex officially supports Vite and static hosting anywhere. ([React/Vite quickstart](https://docs.convex.dev/client/react/quickstart-create-react-app), [custom hosting](https://docs.convex.dev/production/hosting/custom))
- **Cloudflare launch shape:** Vite SPA + Worker + D1, with the operator route protected either by a separately managed application-auth provider or, for a strictly operator-only internal route, a Cloudflare Access allow policy. Cloudflare Access is an organizational application gate, not a future 50,000-member customer-auth system. ([React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Access identity providers](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/), [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/))

A Git-only content workflow would be even smaller operationally, but it would not satisfy the specified in-product Operator Account unless the operator experience is redefined as repository access. It also makes field-level edits and semantic audit history less direct for a nontechnical operator.

## 1. Supabase

### Native capabilities

Every Supabase project includes a full managed PostgreSQL database. That provides normalized relations and foreign keys for outposts, memberships, typed organizational scopes, country-defined units, events, translations, and per-field source records, while JSON columns can hold bounded country-specific attributes. Supabase also exposes PostGIS, `ltree`, `pg_trgm`, PGroonga, `pgaudit`, and `pg_cron` among its available extensions. ([database overview](https://supabase.com/docs/guides/database/overview), [extension catalog](https://supabase.com/docs/guides/database/extensions))

Supabase Auth natively supports email/password accounts, hosted-project email confirmation, reset-password flows, and JWT integration with database RLS. TOTP MFA is enabled on all projects and is free; passkey/WebAuthn support exists but is explicitly **experimental**, so a launch-critical operator recovery plan should not depend only on it. ([password auth](https://supabase.com/docs/guides/auth/passwords), [Auth and RLS integration](https://supabase.com/docs/guides/auth), [TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp), [experimental passkeys](https://supabase.com/docs/guides/auth/passkeys))

RLS and Postgres grants can express scoped permissions directly against membership and permission-grant rows. Supabase also documents custom JWT claims/RBAC, but frequently changing or highly specific scope grants are generally safer when checked against authoritative database rows rather than copied wholesale into a long-lived token. ([securing the Data API](https://supabase.com/docs/guides/api/securing-your-api), [custom claims and RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac))

Postgres supplies indexed full-text search. Supabase's extension catalog also lists PGroonga as supporting all-language full-text search, which is relevant to international names and reference material, but that option should be prototyped against the intended scripts, ranking, transliteration, and upgrade path before relying on it. ([full-text search](https://supabase.com/docs/guides/database/full-text-search), [extension catalog](https://supabase.com/docs/guides/database/extensions))

Supabase Cron uses `pg_cron`; jobs can execute SQL/database functions or invoke Edge Functions. The hosted guidance recommends no more than eight concurrent jobs and jobs no longer than ten minutes, which is sufficient for orchestration but argues for batching source monitors instead of one job per outpost. ([Cron](https://supabase.com/docs/guides/cron), [scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions))

### Add-ons or custom work

The built-in SMTP service is explicitly non-production: it sends only to authorized team addresses, is best-effort, and is currently limited to two messages per hour. Production verification, reset, and notification email requires a custom SMTP provider such as Resend, SES, Postmark, SendGrid, or another supported SMTP service. ([custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp))

Supabase automatically logs authentication events, and `pgaudit` can log selected database activity. Neither understands the product-level fact that an editor changed one sourced field from one value to another for a stated resolution reason. Ranger Outpost Hub would still need an application-owned append-only audit table, written through restricted functions/triggers, plus an external log copy if stronger tamper resistance is required. ([Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs), [`pgaudit`](https://supabase.com/docs/guides/database/extensions/pgaudit))

Platform audit logs concern dashboard/API actions by Supabase organization members and are available only on Team and Enterprise, not Pro. They are not a substitute for application editor history. ([platform audit logs](https://supabase.com/docs/guides/security/platform-audit-logs), [pricing](https://supabase.com/pricing))

### Backups and current price signals

The Pro plan currently starts at $25/month and includes 100,000 MAUs, an 8 GB database, two million Edge Function invocations, and seven days of daily backups. That covers the proposed 50,000-account ceiling if MAU remains within the included amount, but email-provider charges and usage overages are separate. ([pricing](https://supabase.com/pricing), [Edge Function usage](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations))

Daily backups can lose up to roughly a day of recent changes. True PITR is a paid add-on: seven days is currently about $100/month, and Supabase requires at least a Small compute add-on while PITR is enabled. PITR replaces daily backups; downloadable logical exports must be generated separately with the CLI/`pg_dump`. ([backups and PITR](https://supabase.com/docs/guides/platform/backups), [pricing](https://supabase.com/pricing), [logical backup guidance](https://supabase.com/docs/guides/troubleshooting/download-logical-backups))

**Cost unknowns:** production SMTP volume/provider, map/geocoding provider, egress, database compute needed for global search, optional PGroonga performance, off-provider backup storage, log drains, and whether paid PITR is required from the first public release.

## 2. Firebase

### Native capabilities

Firebase Authentication natively supports email/password signup and sign-in, address verification, and password-reset email. Upgrading Authentication to Google Cloud Identity Platform adds TOTP/SMS MFA, enhanced logging, and an SLA; TOTP requires a verified email. No current first-party Firebase/Identity Platform documentation was found for end-user WebAuthn/passkey enrollment, so passkeys or FIDO security keys would require a separate identity provider or custom integration. ([Firebase Authentication](https://firebase.google.com/docs/auth), [password auth](https://firebase.google.com/docs/auth/web/password-auth), [TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa), [Identity Platform upgrade](https://firebase.google.com/docs/auth#firebase-auth-with-identity-platform))

At the planned upper bound, Identity Platform's current Tier 1 pricing includes the first 50,000 email/social MAUs and charges above that threshold; stored but inactive users are not MAUs. Firebase's separate email-sending quotas still apply. ([Identity Platform pricing](https://cloud.google.com/identity-platform/pricing), [Auth limits](https://firebase.google.com/docs/auth/limits))

Cloud Firestore is a serverless document database, not a relational database. Country-variable fields fit naturally, but the many overlapping outpost, civil-geography, organizational-unit, event-scope, grant, and provenance relationships must be represented with document references and sometimes denormalized projections rather than database foreign keys. ([Firestore data model](https://firebase.google.com/docs/firestore/data-model))

Firebase Authentication custom claims and Firestore Security Rules can implement scoped access. Rules are not filters, so every query must prove it can return only authorized documents. Server SDKs bypass Firestore Rules, so server Functions must repeat the relevant authorization checks or be isolated behind IAM. ([custom claims](https://firebase.google.com/docs/auth/admin/custom-claims), [Rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions), [secure queries](https://firebase.google.com/docs/firestore/security/rules-query))

Scheduled Functions are backed by Cloud Scheduler. Each scheduler job is currently $0.10/month with three jobs per Google account included; Google warns scheduled functions can overlap, so monitoring, reminder, and deletion tasks must be idempotent. ([scheduled functions](https://firebase.google.com/docs/functions/schedule-functions))

### Add-ons or custom work

Firestore Standard does not provide native full-text search; Google's documented solution historically uses a dedicated service such as Algolia, Elastic, or Typesense. Firestore Enterprise now offers native text search, but it is a distinct edition with workload-based pricing that must be estimated separately. ([Standard full-text-search solution](https://firebase.google.com/docs/firestore/solutions/search), [Enterprise text search](https://firebase.google.com/docs/firestore/enterprise/text-search), [editions](https://firebase.google.com/docs/firestore/editions))

The managed Firebase Extensions service is deprecated and shuts down on 2027-03-31. Existing deployments continue as ordinary Google Cloud resources, but cannot be managed through the Firebase Extensions console/CLI after shutdown. A new long-lived design therefore should call an email/search provider directly from Functions or use Enterprise search rather than depend on a newly installed managed extension. ([Extensions deprecation FAQ](https://firebase.google.com/docs/extensions/faq-and-troubleshooting))

Authentication verification/reset messages are native, but general event, renewal, and conflict notifications need a transactional email provider or Cloud service called from Functions. The Trigger Email extension itself requires third-party SMTP and is affected by the Extensions retirement. ([Trigger Email](https://firebase.google.com/docs/extensions/official/firestore-send-email), [Extensions deprecation](https://firebase.google.com/docs/extensions/faq-and-troubleshooting))

Google Cloud audit logs can record Firestore administrative and data-access operations; Data Access logging is generally disabled by default and can add logging charges. This still does not replace a semantic audit collection recording before/after values, sources, editor, and resolution reason. For stronger retention, Cloud Logging allows a log bucket and retention policy to be irreversibly locked. ([Firestore audit logging](https://firebase.google.com/docs/firestore/enterprise/audit-logging), [enable Data Access logs](https://docs.cloud.google.com/logging/docs/audit/configure-data-access), [locked log buckets](https://docs.cloud.google.com/logging/docs/buckets))

### Backups and current price signals

Firestore PITR is paid, disabled by default, and retains minute-granularity history for seven days. Scheduled daily or weekly backups are also paid, require Blaze, and restore into a new database. ([PITR](https://firebase.google.com/docs/firestore/use-pitr), [backups](https://firebase.google.com/docs/firestore/backups), [Firestore billing](https://firebase.google.com/docs/firestore/pricing))

Firestore bills document reads/writes/deletes, index-entry reads, storage, and egress; Functions, Scheduler, Cloud Logging, email, and Standard-edition external search add their own meters. The first 50,000 Identity Platform Tier 1 MAUs are currently free, but this does not make the whole stack free. ([Firestore billing](https://firebase.google.com/docs/firestore/pricing), [Firebase pricing](https://firebase.google.com/pricing), [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing))

**Cost unknowns:** Standard-plus-external-search versus Enterprise search, real public search/read frequency, Function invocations, Cloud Logging volume/retention, backup/PITR storage, transactional email, map/geocoding, and egress.

## 3. Convex

### Native capabilities

Convex officially supports adding its backend to an existing React/Vite app. Its database stores JSON-like documents, supports schemas and typed document-ID references, and describes itself as a relational data model even though application code—not SQL foreign-key constraints—follows references. The international model can use typed common fields plus country-specific objects, while many-to-many scope grants remain separate documents. ([React/Vite quickstart](https://docs.convex.dev/client/react/quickstart-create-react-app), [database overview](https://docs.convex.dev/database/overview), [document references](https://docs.convex.dev/database/document-ids))

Convex queries, mutations, and actions form a three-tier boundary: public functions explicitly authenticate and authorize each request, while internal functions cannot be called directly by clients. There is no RLS policy layer; scoped authorization must be centralized in application helpers and called consistently from every relevant public function. ([authentication and authorization](https://docs.convex.dev/auth/overview), [Auth in functions](https://docs.convex.dev/auth/functions-auth), [internal functions](https://docs.convex.dev/functions/internal-functions), [best practices](https://docs.convex.dev/understanding/best-practices))

Native scheduling is a notable strength. Durable scheduled mutations are stored in the database and execute exactly once after internal retries; actions with external side effects are at-most-once and need explicit retry/idempotency design. Recurring cron jobs are defined in TypeScript. ([scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions), [cron jobs](https://docs.convex.dev/scheduling/cron-jobs))

Convex has reactive, transactional, paginated full-text search, but the official limits say it works best with English and other Latin-script languages and uses a simple whitespace/punctuation tokenizer. That is a material limitation for a global directory/reference library spanning non-Latin scripts. A second search system or a carefully tested alternate index may eventually be necessary. ([full-text search](https://docs.convex.dev/search/text-search))

### Add-ons or custom work

Convex Auth supports passwords, optional verification, and reset flows, but it is explicitly beta. Convex recommends third-party authentication for the most comprehensive feature set, including passkeys and 2FA; it documents integrations such as WorkOS AuthKit and compatibility with OIDC providers. Thus advanced operator authentication adds another vendor or acceptance of beta/community auth components. ([Convex Auth](https://docs.convex.dev/auth/convex-auth), [authentication overview](https://docs.convex.dev/auth/overview), [WorkOS AuthKit integration](https://docs.convex.dev/auth/authkit/))

Convex Auth provides flows, not an email delivery network. Convex's official material points to the Resend component/provider for transactional mail. Email delivery therefore has separate configuration and pricing. ([Convex/Resend integration](https://stack.convex.dev/convex-resend), [Convex Auth](https://docs.convex.dev/auth/convex-auth))

Convex's platform audit log tracks team/deployment administration. A Ranger Outpost Hub business audit trail still requires application documents written by the mutation that changes published data, or an additional audit component. Authorization is also application code rather than a built-in scoped-permission product. ([team audit log](https://docs.convex.dev/dashboard/teams/teams), [authorization model](https://docs.convex.dev/auth/overview))

### Backups and current price signals

Manual snapshots are stored for seven days. The Professional plan permits scheduled daily backups retained seven days or weekly backups retained 14 days. Backups omit deployment code, environment variables, and scheduled functions. The reviewed documentation does not offer point-in-time recovery, so this option does not currently meet a strict PITR requirement natively. ([backup and restore](https://docs.convex.dev/database/backup-restore))

Convex Professional is currently $25 per developer per month and includes daily backups, log streaming, text search, crons, Auth, and specified usage quotas. Starter is usage-based beyond its free allocation. At 50,000 accounts, active concurrent sessions and function/search traffic—not the stored account count—drive the bill. ([pricing](https://www.convex.dev/pricing), [pricing FAQ](https://www.convex.dev/pricing/faq))

**Cost unknowns:** third-party production auth and MFA/passkeys, email provider, external/global-script search if required, action/function volume from monitoring, database I/O, egress, off-platform exports, and the operational consequence of not having native PITR.

## 4. Cloudflare Workers + D1

### Native capabilities

Cloudflare provides an official React/Vite full-stack path: a Vite SPA can ship with static assets and call a Worker API in the same project. Keeping Vite is therefore practical. ([React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/))

D1 is managed serverless SQLite. It supports foreign keys, JSON functions, atomic batched statements, and the FTS5 extension. Those features map well to common relational geography plus country-variable JSON, scoped grants, per-field sources, and a first-party search index without another search vendor. ([D1 SQL](https://developers.cloudflare.com/d1/sql-api/sql-statements/), [foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [JSON queries](https://developers.cloudflare.com/d1/best-practices/query-d1/), [batched transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/))

Paid D1 allows a 10 GB database; row count is not capped separately. That is plausibly enough for 20,000 listings and 50,000 accounts, but audit history, content size, indexes, and workload must be measured. D1's limits and SQLite execution model warrant an indexed-query load test before treating it as proven for national launch traffic. ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/))

Cron Triggers can run source monitors, Queues provide at-least-once background delivery with retry, and Workflows provide durable multi-step execution. These are native but distinct primitives, so idempotency and observability remain application responsibilities. ([Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Workers background-work guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Workflows](https://developers.cloudflare.com/workflows/))

D1 Time Travel is always enabled and can restore any minute in the previous seven days on Free or 30 days on Workers Paid, with no additional history/restore charge. Restore currently overwrites the database in place; Cloudflare documents exporting D1 into R2 for longer independent retention. ([Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/))

### Add-ons or custom work

Cloudflare does not provide a native customer identity service equivalent to Supabase Auth or Firebase Authentication. Cloudflare Access protects workforce/internal applications through approved identity providers or one-time PIN policies; it is useful for a sole-operator internal route but is not the future public member-account system. ([Access identity providers](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/), [one-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/))

Two documented application-auth paths are available, each with a different burden:

- **Managed Clerk:** Clerk supports React/Vite, email/password strategies, verification/recovery, signed session JWTs, MFA, and passkeys on paid plans. This minimizes auth operations but adds a vendor and recurring MAU/user cost. ([React/Vite quickstart](https://clerk.com/docs/react/getting-started/quickstart), [authentication strategies](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options), [JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification), [pricing](https://clerk.com/pricing))
- **Better Auth on Workers/D1:** Better Auth natively supports D1 plus email/password, verification/reset hooks, TOTP/backup-code 2FA, and a WebAuthn passkey plugin. This avoids a managed identity bill but makes the project responsible for auth upgrades, availability, abuse controls, email delivery, and recovery. ([D1 support](https://better-auth.com/blog/1-5), [email flows](https://better-auth.com/docs/concepts/email), [2FA](https://better-auth.com/docs/plugins/2fa), [passkeys](https://better-auth.com/docs/plugins/passkey))

Cloudflare Email Service can send transactional email from Workers, but it is currently public beta and requires a Workers Paid plan and an onboarded sending domain. A third-party service such as Resend remains another compatible option. ([Email Service](https://developers.cloudflare.com/email-service/), [pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [limits](https://developers.cloudflare.com/email-service/platform/limits/), [Resend tutorial](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/))

Cloudflare account audit logs record platform configuration actions, not semantic application row changes. The application needs a server-written append-only audit table. Periodic hash-chained exports to R2 with bucket locks can make accidental overwrite/deletion harder, but R2 lock rules can be administratively removed; this is “immutable-ish,” not an irreversible WORM guarantee. ([Cloudflare audit logs](https://developers.cloudflare.com/fundamentals/account/account-security/audit-logs/), [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/))

### Current price signals

Workers Paid currently starts at $5/month and includes 10 million requests and 30 million CPU milliseconds. Paid D1 includes 25 billion rows read, 50 million rows written, and 5 GB storage before overages; D1 has no egress charge. Cloudflare Email Service includes 3,000 outbound messages/month on Workers Paid and then charges $0.35 per 1,000. ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/))

With managed Clerk, the published recurring floor rises by the identity plan price; with Better Auth, the monetary floor is lower but project-owned security/operations work is higher. R2 audit exports, Queues, email above the allowance, maps/geocoding, and usage overages are additional.

**Cost unknowns:** managed-auth plan and active-user definition, or the labor/risk cost of self-hosted auth; Email Service production limits while beta; Worker CPU for source processing; D1 indexed-search traffic and storage; Queues/Workflows volume; R2 audit/backup retention; and map/geocoding.

## Cross-cutting conclusions without selecting a platform

### Keeping Vite

Keeping Vite is practical for every candidate. Supabase, Firebase, Convex, and Cloudflare all document React or Vite browser clients/static deployment. None of the requirements inherently demands moving to Next.js or another server-rendered framework. Server-only operations—operator writes, source monitors, email, permission changes, and audit emission—belong in managed Functions/Workers/backend functions rather than in the Vite bundle.

PWA installability is a frontend concern: add a web manifest, service worker, icons, update policy, and deliberately restricted caching. The backend selection does not require a PWA framework migration. Private data must remain out of general offline caches when ordinary accounts are later enabled.

### One privileged operator

None of the platforms should encode the Operator role only in client state or a self-selected profile field. The authority should be a server-controlled singleton/unique record or claim, provisioned privately, with public role assignment disabled. Every privileged endpoint must re-check it server-side. TOTP or a phishing-resistant factor should be required, and account transfer must be a deliberate server-side workflow.

Supabase has stable TOTP and experimental passkeys; Firebase/Identity Platform has stable TOTP but no documented native passkey; Convex needs a third-party provider for comprehensive advanced auth; Cloudflare needs either managed application identity or a self-hosted auth library. These differences matter more for the sole operator than the number of public readers.

### Scoped permissions

The future permission model is not a single role ladder. It needs grant records such as `(account, permission, scope-type, scope-id, verified-by, starts-at, expires-at)`. PostgreSQL/RLS expresses this most declaratively. Firebase expresses it with custom claims plus Rules/documents. Convex and Workers enforce it in shared server-side helpers. In every option, claimed Royal Rangers position must remain separate from verified application authority.

### Audit trail

Vendor audit logs are useful for infrastructure/authentication events, but no vendor automatically records Ranger Outpost Hub's field-level provenance and editorial reasons. The application must write its own audit event with the same change operation wherever possible. “Immutable-ish” means:

- ordinary application roles cannot update/delete audit events;
- each event contains actor tenure, scope, before/after or a structured diff, source, reason, timestamp, and correlation ID;
- events can be hash-linked or periodically exported; and
- a separate retention-controlled destination protects copies from ordinary database mistakes.

True immutability against the sole cloud-account owner is harder. Google Cloud supports irreversibly locked Logging buckets. Cloudflare R2 bucket-lock rules are useful but removable by an authorized administrator. Supabase and Convex need an external locked destination if that stronger property is required. ([Google locked log buckets](https://docs.cloud.google.com/logging/docs/buckets), [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/))

### Recovery

The four recovery products are not equivalent:

- Supabase Pro daily backups are inexpensive, but second-level PITR currently adds about $100/month for seven days and requires larger compute.
- Firebase offers paid minute-granularity seven-day PITR and separate scheduled backups; actual price follows stored GiB and restore operations.
- Convex Professional provides daily/weekly snapshots but no documented PITR.
- D1 Time Travel provides minute-level history automatically for seven or 30 days, but restores in place and needs exports for independent/off-provider recovery.

Whichever foundation is selected, a quarterly restore drill should prove that content, schema/indexes, auth linkage, environment configuration, and scheduled jobs can all be restored—not merely that a backup exists.

## Cost and proof items that cannot be resolved from list prices

Before choosing a foundation, a small proof should measure:

1. storage size for 20,000 representative outposts, field-level sources, content versions, events, and five years of audit history;
2. search quality across English, Spanish, accented Latin text, Arabic, Devanagari, Chinese, Japanese, and Korean source names—even though custom UI translation is out of scope;
3. public search and map-query latency with representative filters;
4. one source-monitoring batch covering thousands of records without per-record scheduled jobs;
5. exact authorization tests for overlapping district, Spanish-language, FCF, country, and outpost scopes;
6. operator MFA enrollment, recovery, transfer, and session revocation;
7. restoration into a safe test environment and measured recovery time;
8. verification/reset, renewal, and event-reminder email volume and deliverability; and
9. a monthly cost model at quiet launch, 5,000 MAU, and 50,000 MAU using measured reads, writes, function time, search, egress, logs, email, and backups.

The material unresolved costs are not the 20,000 listing rows. They are advanced authentication, global-script search, transactional email, map/geocoding calls, log retention, source-monitor execution, and the desired recovery point objective.
