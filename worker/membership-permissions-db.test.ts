import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMigratedD1 } from './test-sqlite-d1'

let migrated: ReturnType<typeof createMigratedD1>
const now = '2026-08-13T12:00:00.000Z'

beforeEach(() => {
  migrated = createMigratedD1()
  migrated.sqlite.prepare(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)`)
    .run('adult-1', 'Adult', 'adult1@example.test', 1, now, now)
  migrated.sqlite.prepare(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)`)
    .run('adult-2', 'Adult', 'adult2@example.test', 1, now, now)
})

afterEach(() => migrated.close())

describe('membership and permission database invariants', () => {
  it('allows only one active Pastor per Outpost under competing inserts', () => {
    const statement = migrated.sqlite.prepare(`INSERT INTO pastor_appointments
      (id,auth_user_id,outpost_id,state,issuer_auth_user_id,reason,created_at,version)
      VALUES (?,?,?,'active',?,'Manual review',?,1)`)
    statement.run('pastor-1', 'adult-1', 'outpost-stx-70', 'adult-2', now)
    expect(() => statement.run('pastor-2', 'adult-2', 'outpost-stx-70', 'adult-1', now)).toThrow()
  })

  it('cascades private authority state when the ordinary Account is permanently deleted', () => {
    migrated.sqlite.prepare(`INSERT INTO outpost_memberships
      (id,auth_user_id,outpost_id,state,issuer_auth_user_id,reason,created_at,version)
      VALUES ('member-1','adult-1','outpost-stx-70','verified','adult-2','Manual review',?,1)`).run(now)
    migrated.sqlite.prepare(`INSERT INTO permission_grants
      (id,auth_user_id,capability,scope_type,scope_id,source_membership_id,state,issuer_auth_user_id,reason,created_at,version)
      VALUES ('grant-1','adult-1','view-outpost-private','outpost','outpost-stx-70','member-1','active','adult-2','Verified membership',?,1)`).run(now)
    migrated.sqlite.prepare(`DELETE FROM "user" WHERE id='adult-1'`).run()
    expect(migrated.sqlite.prepare(`SELECT COUNT(*) count FROM outpost_memberships WHERE auth_user_id='adult-1'`).get()).toEqual({ count: 0 })
    expect(migrated.sqlite.prepare(`SELECT COUNT(*) count FROM permission_grants WHERE auth_user_id='adult-1'`).get()).toEqual({ count: 0 })
    expect(migrated.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('keeps membership and grants out of every public schema', () => {
    const rows = migrated.sqlite.prepare(`SELECT s.name table_name, f.name field_name
      FROM sqlite_schema s, pragma_table_info(s.name) f
      WHERE s.type='table' AND s.name LIKE 'public_%'
        AND lower(f.name) IN ('membership','auth_user_id','permission','position','email','roster')`).all()
    expect(rows).toEqual([])
  })
})
