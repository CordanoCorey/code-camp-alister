# Slice 8 QA — U.S. directory population and submissions

Evidence date: **2026-08-13**  
Environment: local Windows workspace, disposable SQLite/D1-compatible migration fixtures, local Cloudflare Worker/Vite runtime.  
Remote status: **pending**. No production D1 migration, Turnstile secret, Access service token, deployed intake, or nationwide production publication is claimed.

The directory remains an independent, incomplete, source-backed service. A zero count means **No verified listings yet**, never no Outpost exists.

## Implemented boundaries

- Public intake is progressive: private D1 proposals only when exact-loopback testing or complete Turnstile production configuration is available; otherwise honest email/copy fallback.
- Siteverify is fail-closed and checks success, exact `outpost-submission` action, and exact hostname. Timing, honeypot, origin, JSON content type, 12 KB body, HTTPS, field lengths, and privacy confirmation are checked before D1 mutation.
- Intake stores no IP, user agent, challenge token/payload, raw request body, leader/member identity, or reference code in a public surface. Responses use `no-store`; the service worker explicitly ignores both intake routes.
- Proposals and manifest candidates cannot touch canonical or public content. The active, non-renewal-required Operator must resolve candidate matches and convert reviewed facts to a draft through the canonical write path.
- Terminal proposal actions and six-month retention scrub reply email and notes while retaining non-PII disposition history.
- Annual verification uses calendar arithmetic, a two-month warning, explicit persisted 30 calendar-day grace, expiry without closure, same-ID restoration, affirmative-source archive, immutable per-cycle evidence snapshots, and tenure-labelled audit. Reverification refuses to roll a populated field forward unless its source check date matches the new Listing Verification date.
- Public outpost queries, detail, search, home counts, coverage, and offline-eligible API data read only lifecycle-eligible projections.

## Seed re-audit

| Stable Hub Outpost ID | Disposition | Current public facts |
| --- | --- | --- |
| `outpost-stx-70` | Published/verified | Current district identity/number and church contact/location retained. Conflicting meeting schedules and inferred Program Groups omitted. FCF Not verified. |
| `outpost-stx-132` | Published/verified | Current district identity/number and church contact/location retained. The obsolete 2024 meeting and unsupported Program Groups omitted. FCF Not verified. |
| `outpost-stx-355` | Published/verified | Current district identity/number and church contact/location retained. Legacy meeting wording and unsupported Program Groups omitted. FCF Not verified. |
| `outpost-stx-173` | Published/verified | Current district number, church/location, four explicitly named Program Groups, and current meeting information retained with per-field sources. FCF Not verified. |
| `outpost-stx-41` | Draft/unverified | Stale district host identity conflicts with the congregation's documented 2022 replant/name change. It remains non-public; absence is not treated as closure and it is not archived. |
| `outpost-greenville-1` | Draft/unverified | Former first-party Outpost hostname did not resolve and current meeting/Program Groups conflict or lack confirmation. The record remains non-public; current church address/contact alone does not establish current Outpost identity. |

Stable IDs and historical evidence remain intact. Migration 0009 backfills the four published records with legacy Verification Cycles and the two drafts as unverified.

## Reviewed nationwide candidate cohort

The source-controlled cohort contains **103 unique candidates**, all **8** geographic regions, **33 named districts**, and **36 jurisdictions**. It is split into **26** validated manifests, each bounded to four candidates and 24 evidence rows. Four rows are explicit corrections to existing Hub IDs; 99 propose new stable listings. Source type is 72 church-owned candidates and 31 current South Texas district-owned candidates. Every candidate's FCF Activity Status is **Not verified**.

| Region | Candidates |
| --- | ---: |
| Northwest | 4 |
| North Central | 12 |
| Great Lakes | 13 |
| Northeast | 22 |
| Southwest | 3 |
| South Central | 33 |
| Gulf | 6 |
| Southeast | 10 |
| **Total** | **103** |

Jurisdiction counts: Alabama 1; Arizona 2; Arkansas 1; Connecticut 1; Delaware 1; Florida 6; Georgia 1; Hawaii 1; Idaho 1; Illinois 3; Indiana 2; Iowa 1; Kentucky 2; Louisiana 2; Maine 1; Maryland 3; Massachusetts 1; Michigan 2; Minnesota 4; Mississippi 1; Missouri 1; Montana 1; New Hampshire 1; New Jersey 4; New Mexico 1; New York 2; North Carolina 2; North Dakota 1; Ohio 4; Oklahoma 1; Pennsylvania 5; Tennessee 2; Texas 31; Virginia 3; Washington 2; Wisconsin 5.

Named-district counts: Alabama 1; Arizona 2; Arkansas 1; Georgia 1; Hawaii 1; Illinois 3; Indiana 2; Iowa 1; Kentucky 2; Louisiana 2; Michigan 2; Minnesota 4; Mississippi 1; Montana 1; New Jersey 4; New Mexico 1; New York 2; North Carolina 2; North Dakota 1; Northern Missouri 1; Northern New England 2; Northwest 2; Ohio 4; Oklahoma 1; Peninsular Florida 4; PennDel 6; Potomac 3; South Texas 31; Southern Idaho 1; Southern New England 2; Tennessee 2; West Florida 2; Wisconsin–Northern Michigan 5. Three Virginia candidates intentionally leave district unresolved while retaining verified Northeast region mapping.

The exact evidence and explicit searches/gaps are in [north cohort research](../research/us-outpost-cohort-north.md) and [south cohort research](../research/us-outpost-cohort-south.md). The manifests contain no source prose, private contacts, coordinates, or roster data.

### Coverage gaps retained

- Northwest has no retained Alaska, Oregon, or Wyoming candidate in this bounded pass.
- Southwest has no retained Northern California/Nevada, Southern California, or Rocky Mountain candidate.
- South Central has no retained Kansas, North Texas, or West Texas candidate; language-overlay results were not relabelled geographically.
- Gulf has no retained Southern Missouri candidate.
- Southeast has no retained South Carolina or Puerto Rico candidate.
- Northeast Virginia district boundaries remain unresolved for three candidates rather than guessed.
- American Samoa, Guam, Northern Mariana Islands, U.S. Virgin Islands, and many states have zero verified canonical listings. This is a search/review gap, not an absence claim.

### Publication truth

The 103-candidate cohort is source-controlled and validator-ready, but the repository has no live production target and a fresh database still has four verified public seeds. The manifests deliberately cannot publish. The first nationwide publication milestone therefore remains **pending an active Operator's per-candidate source review, draft preview, and publication pass**. This QA file does not call candidates published listings.

## Deterministic validation evidence

- `npm run outposts:manifests:build`: generated 26 validated manifests with 103 candidates.
- `npm run outposts:validate`: validated all 26/103 before any write.
- Manifest tests cover prohibited/private fields, field-source completeness, HTTPS/date/enums, scoped-number/campus reuse, 24-evidence-row D1 bound, and stable SHA-256 checksums.
- HTTP staging tests prove invalid input leaves zero batches, checksum replay returns the existing batch, a stable candidate key cannot be restaged through a revised batch, canonical record count is unchanged by staging, and repeated apply cannot create a second draft.
- Reviewed apply creates a private draft, exact Field Provenance, a revision, a tenure-labelled audit event, and no public directory/search projection.

## Migration, lifecycle, privacy, and scale evidence

- `npm run db:verify`: upgrade from 0008 and fresh through 0009 both passed with 139 content records, 343 Field Provenance rows, seven content assertions, seven Operator-lifecycle assertions, seven directory-operations assertions, and zero foreign-key failures.
- Directory-operation HTTP tests cover Access denial, renewal-required denial, private filters/detail, candidate matches, terminal transitions, six-month scrub, draft conversion, stale correction rejection, same-ID correction under optimistic concurrency, invalid/idempotent staging, globally stable candidate keys, draft-only apply, persisted grace, expiration, search/detail/bootstrap exclusion, stale-field reverification rejection, same-ID restoration, evidence-based archive, immutable cycle history, version history, and blocked hard delete.
- Public intake tests cover disabled fail-closed behavior, exact loopback restriction, non-enumerating duplicates, origin/content type/size/honeypot/timing/validation, exact Turnstile action/hostname, and private-only writes.
- Service-worker policy tests explicitly ignore intake config/mutation and all Operator routes; `no-store` responses cannot enter Cache Storage.
- `npm run scale:check`: isolated 20,006-Outpost fixture passed with zero foreign-key problems and indexed directory, jurisdiction, scoped-number, keyset, search, event, content, source-freshness, Listing Verification, private submission, and staged-population queue plans.
- `npm run test:integration`: five integration files and 46 tests passed.
- `npm run check`: Oxlint passed, all 23 test files and 134 tests passed, and Worker/client production builds passed.
- `git diff --check`: passed; Windows line-ending notices were informational.

## Local browser evidence

The in-app browser drove the real local Worker/Vite app after migration 0009 and idempotent staging of all 26 manifests:

- Public directory showed all eight region counts, all 56 state/territory choices, four eligible Texas listings, independent-verification wording, and the persistent incomplete/not-official statement.
- California produced **No verified listings yet**, Add Your Outpost, and the explicit warning that zero does not mean no Outpost exists.
- Empty form submission focused the semantic error summary. A synthetic valid form displayed the maintained Texas → South Central Region/Plainsmen Territory mapping while explicitly declining to infer district, language overlay, or local FCF activity.
- The synthetic proposal saved privately and appeared only in the protected queue with private reply data, source link, candidate-match area, state/type/jurisdiction/duplicate/age filters, non-PII events, and draft-only workflow. It was then rejected through the protected endpoint; reply data was scrubbed and only non-PII terminal history remains.
- The staged workspace showed 99 staged and four duplicate-review candidates, bounded pagination, exact per-field direct/derived sources, mapping links, stable correction targets, and candidate match evidence. The four existing-seed corrections resolve by Hub ID rather than bare number.
- The first browser load exposed a local D1 compound-select ceiling in the Freshness Queue. Listing-lifecycle and proposal-retention work were split into separate bounded indexed queries and merged in TypeScript. Reload then showed the full Operator Console with no alert, console warning, or console error.
- After final review, the browser confirmed the Operator editor shows the same-date evidence requirement, removes the unsafe one-click verification-date shortcut, and still renders with no application alert, console warning, or console error.
- At a 390 × 844 responsive viewport (375 CSS px), public form and Operator queue had no horizontal overflow; queue layout collapsed to one column. One H1 and labelled form controls were present, and the status region uses polite live output.
- Cache Storage inspection was unavailable in the browser's read-only page scope; repeatable service-worker policy tests prove intake and Operator routes are ignored and `no-store` is never cacheable.

Production evidence remains pending until a real remote configuration exists.
