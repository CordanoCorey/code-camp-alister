# D1 and SQLite constraints for the production-scale model

**Research date:** 2026-08-12
**Versions inspected:** `wrangler@4.122.0`, `@cloudflare/workers-types@5.20260812.1`
**Source policy:** Official Cloudflare documentation, official SQLite documentation, and version-matched Cloudflare package source only.

## Scope

This note records only platform facts that constrain Slice 5: forward-only local migrations, atomic normalized writes, parameter binding, a published-safe FTS5 projection, keyset pagination, query-plan checks, and an isolated 20,000-outpost fixture. It is implementation guidance, not production capacity or deployment evidence.

## Material conclusions

- Add `0007` and later migrations; never edit `0001`-`0006`. Wrangler records applied **file names**, not checksums, in `d1_migrations`, and computes pending work by comparing discovered names with those rows. Changing an applied file would affect a fresh database but would neither rerun nor detect drift in the existing local database. Test both upgrade-from-`0001`-`0006` and fresh-database paths. ([Cloudflare migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Wrangler 4.122.0 `apply.ts`](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.122.0/packages/wrangler/src/d1/migrations/apply.ts), [Wrangler 4.122.0 `helpers.ts`](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.122.0/packages/wrangler/src/d1/migrations/helpers.ts))
- Use `db.batch()` for one logical content write, but make stale-version failure occur **inside SQL**. A version-qualified `UPDATE` that changes zero rows succeeds and reports `meta.changes = 0`; it does not by itself abort later statements. Checking `changes` only after the batch is too late. A constraint/trigger guard using `RAISE(ABORT, ...)`, or another locally proven SQL-level guard, must cause a stale write to fail so the whole batch rolls back. ([D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [D1 result metadata](https://developers.cloudflare.com/d1/worker-api/return-object/), [SQLite `RAISE()`](https://sqlite.org/lang_createtrigger.html#the_raise_function))
- Bind all request data. D1 currently supports anonymous `?` and numbered `?NNN` parameters, not named parameters, and limits a query to 100 bound parameters. Parameters stand for SQL values, not identifiers, so sort fields/directions and optional query shapes need a finite allowlist of static SQL fragments/templates. ([D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/#bind), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [SQLite parameters](https://sqlite.org/lang_expr.html#varparam))
- Do not send raw user input directly to `MATCH`. SQL binding prevents SQL injection, but the bound value is still parsed as an FTS5 query containing quotes, prefix operators, column filters, boolean operators, and parentheses. For the intended simple search, impose a short input/token limit and construct literal phrases by double-quoting each accepted term and doubling embedded `"` characters. ([SQLite FTS5 query syntax](https://sqlite.org/fts5.html#full_text_query_syntax))
- Keyset pagination maps directly to SQLite row-value comparison: `WHERE (sort_key, stable_id) > (?1, ?2) ORDER BY sort_key, stable_id LIMIT ?3`. `OFFSET` work grows with the offset. Cursor keys should be non-null, use the same collation/order as the index, include the unique stable ID as a deterministic tie-breaker, and be validated before binding. ([SQLite row values](https://sqlite.org/rowvalue.html#scrolling_window_queries))
- Normalization alone cannot produce one index for every filter/sort combination. D1 indexes cannot reference other tables, while publication/title and typed outpost/affiliation facts may live in different tables. Implement a small finite set of query shapes and indexes; if scale evidence still shows large scans or temporary sorts, use an atomically maintained public directory/query projection rather than creating an index-per-combination explosion. ([D1 index considerations](https://developers.cloudflare.com/d1/best-practices/use-indexes/#considerations))

## Forward-only migrations and integrity

Wrangler discovers migration SQL files in numeric order, records each applied name in `d1_migrations`, and exposes create/list/apply rather than a down-migration workflow. The pinned source builds each migration execution by appending the `d1_migrations` insert to the migration SQL. Its command documentation says a failing migration is rolled back while earlier successful migration files remain applied. This supports append-only corrective migrations rather than rewriting history. ([Cloudflare migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Wrangler 4.122.0 source](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.122.0/packages/wrangler/src/d1/migrations/helpers.ts))

D1 enforces foreign keys for queries and migrations as though `PRAGMA foreign_keys = on`; application SQL cannot disable it. A schema-changing migration may use `PRAGMA defer_foreign_keys = on`, but all violations must be repaired before transaction end or the transaction fails. `ON DELETE`/`ON UPDATE` actions still execute, so deferral is not a way to suppress cascades. End both migration paths with `PRAGMA foreign_key_check` plus the Slice 5 semantic parity/orphan/duplicate assertions. ([D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/))

Use an isolated `--persist-to` directory for fresh and 20,000-row checks. Wrangler local state persists by default, and Cloudflare documents both `--local` migration execution and explicit persistence paths. This keeps generated rows out of the user's existing `.wrangler` database without deleting it. ([D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/))

## Atomic writes and parameter types

`db.batch()` runs prepared statements sequentially and non-concurrently as a transaction; a statement error aborts or rolls back the sequence. Results are returned in statement order. Cloudflare publishes no separate numeric maximum statement count for a batch. Each statement retains the per-query limits, and the complete batch must resolve within 30 seconds, so relation/provenance replacement should remain bounded and the scale fixture should discover a conservative practical chunk size. ([D1 `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/))

The logical normalized write should include canonical facts, bounded child/join replacement, field provenance, immutable revision, audit event, and search-document publication change in the same failing batch. If a trigger supplies the stale-version guard, use `RAISE(ABORT, 'stale content version')` and translate only that known database error into the plain-language conflict response. Test that **none** of the other rows change after a stale request.

D1 converts booleans to integer `0`/`1`; `undefined` is rejected; `BigInt` is not supported by the binding; and JavaScript cannot precisely round-trip every SQLite `int64`. Use explicit `null`, ordinary safe integers for versions/order fields, and schema `CHECK` constraints for enum/boolean values. Cloudflare recommends `STRICT` tables to reduce storage/type mismatches, but compatibility with all migration SQL used here should be proven locally before adopting it. ([D1 binding type conversion](https://developers.cloudflare.com/d1/worker-api/#type-conversion))

## Published-safe FTS5 projection

D1 officially includes FTS5. The search source should be a deliberately shaped table containing only stable public identity/type and allowlisted published text; audit actors, notes, conflict assertions, broken-source text, raw JSON, drafts, and archives must never be inserted. A content-bearing FTS table is the simplest robust option at this scale; an external-content FTS table saves duplicate text but transfers consistency responsibility to the application. ([D1 supported extensions](https://developers.cloudflare.com/d1/sql-api/sql-statements/#supported-sqlite-extensions), [SQLite external-content FTS5](https://sqlite.org/fts5.html#external_content_and_contentless_tables))

For an external-content design, SQLite's required trigger pattern is:

- insert `new` values after content insert;
- issue the FTS5 special `'delete'` command with the exact `old` values after delete;
- delete `old`, then insert `new`, after update.

External-content triggers do not populate rows that existed before the triggers were created. Backfill explicitly or run the supported `INSERT INTO search_fts(search_fts) VALUES('rebuild')`, and include FTS integrity/parity checks. External-content `REPLACE` conflict handling becomes `ABORT`, another reason to prefer explicit update/delete/insert behavior. ([SQLite trigger pattern and pitfalls](https://sqlite.org/fts5.html#external_content_table_pitfalls), [SQLite FTS5 rebuild](https://sqlite.org/fts5.html#the_rebuild_command))

The default `unicode61` tokenizer is case-insensitive under Unicode 6.1 and removes most Latin-script diacritics by default, so representative Spanish/accented and non-Latin inputs should be regression fixtures. That behavior is useful evidence, not a claim of global-language search quality. Porter stemming is English-specific. Prefix indexes improve configured prefix lengths but add index entries/storage/write cost, so add them only if the visible search contract and measurements require them. ([SQLite FTS5 tokenizers](https://sqlite.org/fts5.html#tokenizers), [SQLite FTS5 prefix indexes](https://sqlite.org/fts5.html#prefix_indexes))

## Indexes, pagination, and query-plan evidence

Create composite indexes from each actual predicate/order shape, respecting the leftmost-column rule, and index foreign-key/join columns used from both sides of important joins. Partial indexes can make published/current/open queues smaller where query predicates exactly imply the partial-index condition. Avoid leading-wildcard `LIKE` for directory/search paths. After schema/backfill, run `PRAGMA optimize` so planner statistics reflect the fixture. ([D1 index guidance](https://developers.cloudflare.com/d1/best-practices/use-indexes/))

Record `EXPLAIN QUERY PLAN` for the exact parameterized high-volume shapes. Useful assertions are semantic and conservative:

- the intended named index appears for the high-volume table/filter;
- no full `SCAN` of the 20,000-row canonical/projection table where a selective `SEARCH` is expected;
- no `USE TEMP B-TREE FOR ORDER BY` on the main paged sort when an index is intended to provide order;
- join-table lookups use their indexes; and
- page two and a late page have the same bounded result contract without `OFFSET`.

Do not snapshot the whole plan string. SQLite explicitly warns that `EXPLAIN QUERY PLAN` output format may change, and `SCAN ... USING INDEX` can be a valid ordered index traversal even though it is not a selective `SEARCH`. A temporary b-tree signals an explicit sort/group/distinct; whether it is unacceptable depends on row volume and query shape. ([SQLite EQP](https://sqlite.org/eqp.html), [SQLite query planner](https://sqlite.org/queryplanner.html))

## Limits relevant to 20,000 outposts

Cloudflare's current published D1 limits include:

| Constraint | Current limit | Slice 5 consequence |
| --- | ---: | --- |
| Rows per table | Unlimited within database storage | 20,000 rows are not themselves near a row-count ceiling. |
| Database size | 500 MB Free / 10 GB Paid | Measure normalized tables, revision JSON, and all indexes; local success is not production capacity proof. |
| Columns per table | 100 | Prefer typed tables/children over one ever-widening record table. |
| String, BLOB, or row | 2 MB | Keep DTO/search/revision fields bounded. |
| SQL statement | 100 KB | Generate compact static query shapes, not enormous dynamic SQL. |
| Bound parameters per query | 100 | Chunk bulk fixture writes and large relation replacements. |
| Queries per Worker invocation | 50 Free / 1,000 Paid | Bound query fan-out; do not issue per-row source/join queries. |
| Query duration | 30 seconds | Applies to an individual query and to the entire batch call. |
| Simultaneous D1 connections per invocation | 6 | Prefer a few planned queries/batches, not broad parallel fan-out. |

Each D1 database is single-threaded and processes queries one at a time; shorter indexed queries directly improve throughput. Cloudflare specifically advises chunking very large data migrations (example: roughly 1,000 rows at a time) rather than attempting hundreds of thousands of updates in one statement. ([D1 limits and throughput](https://developers.cloudflare.com/d1/platform/limits/))

D1 does not publish a hard maximum result-row count or query-response byte limit. That absence does not make unbounded reads safe: D1 execution/result serialization consumes Worker resources, and a Worker isolate has 128 MB memory. Workers have no enforced response-body maximum, but buffering a large response can still exceed isolate memory. Page every public/operator list and return only requested fields/sources. ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/))

For evidence, capture returned `meta.rows_read`, `meta.rows_written`, SQL duration, actual API JSON byte length, and local wall time for every representative scale query. In a deployed follow-up, D1 analytics additionally exposes serialized `queryBatchResponseBytes` and server-side `queryBatchTimeMs`; analytics are retained for 31 days. ([D1 return metadata](https://developers.cloudflare.com/d1/worker-api/return-object/), [D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/))

## Ambiguities and architecture constraints to carry forward

- Cloudflare documents atomic rollback on a **statement error**, not a conditional "zero rows changed" outcome. The stale-version SQL guard needs an integration test using the real local D1 binding, including child/provenance/FTS/audit rollback.
- No documented batch-statement maximum was found. The 30-second whole-batch limit, per-statement limits, query-per-invocation ceiling, and measured relation counts are the usable boundaries.
- No D1 documentation reviewed here guarantees a query-result row/byte maximum or a specific SQLite engine version. Do not depend on a newly introduced SQLite/FTS feature solely by version number; prove the exact SQL in Wrangler's local D1 runtime.
- Cross-table filters plus a common-table sort may require a temp sort because an index cannot span the normalized tables. Prefer a finite query matrix first; adopt a canonical-to-public query projection only where the 20,000-row EQP/row-read evidence justifies it.
- Local Miniflare/workerd uses the same D1 version Cloudflare describes for local development, but local timings are evidence about query shape only. They are not a production latency, contention, replica, or load test.
