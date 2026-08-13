import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

type TestStatement = D1PreparedStatement & {
  testSql: string
  testBindings: unknown[]
  testExecute: () => void
}

export function createMigratedD1() {
  const sqlite = new DatabaseSync(':memory:')
  const queries: Array<{ sql: string; bindings: unknown[] }> = []
  sqlite.exec('PRAGMA foreign_keys = ON;')
  for (const name of [
    '0001_initial.sql',
    '0002_directory_foundation.sql',
    '0003_outpost_source_freshness.sql',
    '0004_victory_outpost.sql',
    '0005_advancement_library.sql',
    '0006_events_and_freshness.sql',
    '0007_normalized_content_model.sql',
    '0008_operator_lifecycle.sql',
    '0009_us_directory_operations.sql',
    '0010_automated_data_maintenance.sql',
    '0011_ordinary_adult_accounts.sql',
    '0012_ordinary_account_lifecycle.sql',
    '0013_international_directory_foundation.sql',
    '0014_membership_and_permissions.sql',
  ]) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  }

  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = []
      const prepared = () => sqlite.prepare(sql) as StatementSync
      const statement = {
        testSql: sql,
        testBindings: bindings,
        bind(...values: unknown[]) {
          bindings = values
          this.testBindings = values
          return this
        },
        async first<T>() {
          queries.push({ sql, bindings: [...bindings] })
          return (prepared().get(...bindings) ?? null) as T | null
        },
        async all<T>() {
          queries.push({ sql, bindings: [...bindings] })
          const results = prepared().all(...bindings) as T[]
          const meta = sqlite.prepare('SELECT changes() changes, last_insert_rowid() last_row_id').get() as { changes: number; last_row_id: number | bigint }
          return { results, success: true, meta: { changes: Number(meta.changes), last_row_id: Number(meta.last_row_id) } }
        },
        async run() {
          queries.push({ sql, bindings: [...bindings] })
          const result = prepared().run(...bindings)
          return { success: true, meta: { changes: Number(result.changes) } } as unknown as D1Result
        },
        testExecute() {
          prepared().run(...bindings)
        },
      }
      return statement as unknown as TestStatement
    },
    async batch(statements: TestStatement[]) {
      sqlite.exec('BEGIN IMMEDIATE;')
      try {
        for (const statement of statements) statement.testExecute()
        for (const statement of statements) queries.push({ sql: statement.testSql, bindings: [...statement.testBindings] })
        sqlite.exec('COMMIT;')
        return statements.map(() => ({ success: true }))
      } catch (error) {
        sqlite.exec('ROLLBACK;')
        throw error
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql)
      return { count: 0, duration: 0 }
    },
  }
  return {
    db: db as unknown as D1Database,
    sqlite,
    queries,
    clearQueries: () => { queries.length = 0 },
    close: () => sqlite.close(),
  }
}
