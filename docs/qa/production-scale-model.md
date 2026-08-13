# Production-scale model evidence

Recorded August 12, 2026 for migration `0007_normalized_content_model.sql`.

This is local architecture evidence, not a production service-level objective or a deployment-readiness claim. Live D1 latency, concurrency, cache behavior, Access, and operational load remain deployment work.

## What changed

Migration 0007 keeps `content_records` as the stable publication envelope and moves filterable facts into foreign-keyed typed tables. Canonical child rows cover Outposts, civil geography, organizational scopes and overlapping affiliations, Program Groups, advancement relationships, Event Series and occurrences, informational page sections, deduplicated source documents, Field Provenance, editorial conflicts, coverage gaps, revisions, and audit history.

`details_json`, `record_sources`, `event_conflicts`, `broken_source_observations`, and `coverage_gaps` are retained as read-only recovery evidence from Slices 1–4. They are not written after the cutover. They may be removed only after deployed parity evidence and a separately reviewed forward migration.

Public search uses `public_search_documents` plus FTS5. Its text is an allowlisted published projection; it never includes audit actors, notes, conflict assertions, broken-source observations, or coverage-gap text. Public and Operator lists use opaque keyset cursors, default to 20 records, and have a server-enforced maximum of 50.

To add a queryable field, add it to the appropriate typed table in a forward migration, update the centralized projection/write code, add the necessary indexed query shape, and attach one or more `field_provenance` rows to its exact public field path. Do not revive `details_json` as an editable source.

## Migration and parity proof

`npm run db:verify` creates two disposable Wrangler/D1 states:

- an applied 0001–0006 state upgraded with 0007;
- a fresh state migrated through 0007.

Both paths contain 139 stable content records and 343 Field Provenance rows. The check verifies all durable migration assertions, typed row counts for every kind, source ID/field/date parity, representative Outpost/Event/advancement fact equality, published-only search projection, unique slugs, and `PRAGMA foreign_key_check`. The temporary databases are deleted automatically.

## Isolated 20,000-Outpost result

`npm run scale:check` applied migrations 0001–0007 to an operating-system temporary SQLite database, inserted 20,000 synthetic Outposts with representative civil jurisdictions, overlapping organizational affiliations, Program Groups, provenance, freshness dates, scoped repeated external numbers, and public search text, then removed the database in `finally`. Product migrations and the persistent local `.wrangler` state were not modified.

The fixture contained 20,006 total Outposts including seeds and had zero foreign-key violations. Every query asserted its maximum result count and serialized result size. Observed warm local averages over 20 executions were:

| Query shape | Rows | JSON bytes | Local average | Relevant plan evidence |
| --- | ---: | ---: | ---: | --- |
| Directory first page | 21 | 1,664 | 0.028 ms | covering `public_outposts_title` scan |
| Civil-jurisdiction filter | 21 | 1,664 | 0.026 ms | search `public_outposts_civil_title` |
| Scoped external number | 21 | 773 | 0.024 ms | search `public_outposts_number` |
| Keyset page after row 10,000 | 21 | 1,639 | 0.026 ms | row-value search `public_outposts_title` |
| Global FTS search | 21 | 778 | 42.853 ms | FTS virtual index, document PK, bounded temporary order |
| Upcoming events | 6 | 239 | 0.015 ms | covering event start-date index |
| Operator content list | 21 | 1,425 | 0.023 ms | covering `content_records_operator_updated` |
| Freshness candidates | 51 | 3,214 | 0.049 ms | search `field_provenance_freshness` |

The FTS query is deliberately called out: matching is indexed, while deterministic title ordering currently uses a temporary B-tree over the match set. The 20,000-row local result was bounded but materially slower than the directory indexes. A deployed load test should measure realistic term frequencies before considering an additional public search-order projection.

## D1 constraints and remaining risks

The implementation follows the official D1/SQLite constraints recorded in [`docs/research/d1-production-scale-model.md`](../research/d1-production-scale-model.md): append-only migration history, bound values and allowlisted SQL shapes, D1 batch atomicity, an in-batch SQL abort for stale zero-row updates, quoted/token-limited FTS input, explicit external-content FTS maintenance, keyset row-value comparisons, and semantic rather than exact query-plan assertions.

Remaining risks are deployed D1 latency and concurrency, production Access configuration, cache hit distribution, real national-data term distributions, live migration duration, and operational recovery. Those belong to Slice 6 and later data-population/maintenance slices.
