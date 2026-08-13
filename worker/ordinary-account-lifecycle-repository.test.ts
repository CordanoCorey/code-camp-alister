import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteDueOrdinaryAccount,
  ensureOrdinaryAccountLifecycle,
  getOrdinaryAccountLifecycleStatus,
  renewOrdinaryAccount,
} from './ordinary-account-lifecycle-repository'
import { createMigratedD1 } from './test-sqlite-d1'

describe('ordinary Account lifecycle repository', () => {
  let migrated: ReturnType<typeof createMigratedD1>

  beforeEach(() => { migrated = createMigratedD1() })
  afterEach(() => migrated.close())

  function seedActiveAccount(id = 'ordinary-user-1', activatedAt = '2026-08-13T12:00:00.000Z') {
    migrated.sqlite.prepare(`INSERT INTO "user"
      (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
      VALUES (?, 'Alex', ?, 1, NULL, ?, ?)`).run(id, `${id}@example.test`, activatedAt, activatedAt)
    migrated.sqlite.prepare(`INSERT INTO account
      (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (?, ?, 'credential', ?, 'test-password-verifier', ?, ?)`).run(
      `credential-${id}`, id, id, activatedAt, activatedAt,
    )
    migrated.sqlite.prepare(`INSERT INTO ordinary_account_eligibility_challenges
      (id, secret_hash, confirmed_at, attestation_version, expires_at,
       reserved_at, reserved_request_id, consumed_at, consumed_auth_user_id)
      VALUES (?, ?, ?, 'ordinary-adult-v1', ?, ?, 'request', ?, ?)`).run(
      `challenge-${id}`, 'a'.repeat(64), activatedAt, '2026-08-13T12:20:00.000Z',
      activatedAt, activatedAt, id,
    )
    migrated.sqlite.prepare(`INSERT INTO ordinary_account_profiles
      (auth_user_id, activation_state, eligibility_challenge_id, display_name, onboarding_path,
       claimed_position, claimed_position_other, current_outpost_id, outpost_claim,
       usa_jurisdiction_id, country_code, international_subdivision,
       created_at, updated_at, activated_at, version)
      VALUES (?, 'active', ?, 'Alex', 'usa', 'Adult Leader', NULL, NULL, 'Private claim',
        'us-va', NULL, NULL, ?, ?, ?, 1)`).run(id, `challenge-${id}`, activatedAt, activatedAt, activatedAt)
    migrated.sqlite.prepare(`INSERT INTO ordinary_adult_eligibility
      (auth_user_id, confirmed, confirmed_at, attestation_version)
      VALUES (?, 1, ?, 'ordinary-adult-v1')`).run(id, activatedAt)
    return id
  }

  it('activates and repairs one deterministic schedule idempotently', async () => {
    const userId = seedActiveAccount('leap-user', '2024-02-29T14:15:16.123Z')
    const first = await ensureOrdinaryAccountLifecycle(migrated.db, userId)
    const second = await ensureOrdinaryAccountLifecycle(migrated.db, userId)
    expect(first).toMatchObject({
      state: 'expired',
      accessDueAt: '2025-02-28T14:15:16.123Z',
      noticeOpenAt: '2025-01-28T14:15:16.123Z',
    })
    expect(second?.id).toBe(first?.id)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM ordinary_account_lifecycles').get())
      .toEqual({ count: 1 })
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM ordinary_account_lifecycle_events WHERE event_type = 'activated'").get())
      .toEqual({ count: 1 })
  })

  it('renews concurrent or replayed requests exactly once from the prior due instant', async () => {
    const userId = seedActiveAccount()
    const current = await ensureOrdinaryAccountLifecycle(migrated.db, userId)
    expect(current?.version).toBe(1)
    const [first, second] = await Promise.all([
      renewOrdinaryAccount(migrated.db, userId, 1, 'renewal-request-0001', '2027-07-13T12:00:00.000Z'),
      renewOrdinaryAccount(migrated.db, userId, 1, 'renewal-request-0002', '2027-07-13T12:00:00.000Z'),
    ])
    expect(first.accessDueAt).toBe('2028-08-13T12:00:00.000Z')
    expect(second.accessDueAt).toBe(first.accessDueAt)
    expect(first.version).toBe(2)
    expect(second.version).toBe(2)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM ordinary_account_renewal_events').get())
      .toEqual({ count: 1 })
  })

  it('reports a due warning as awaiting delivery before an attempt exists', async () => {
    const userId = seedActiveAccount()
    const status = await getOrdinaryAccountLifecycleStatus(
      migrated.db, userId, '2027-07-13T12:00:00.000Z',
    )
    expect(status).toMatchObject({ state: 'renewal-notice', warningDelivery: 'pending' })
  })

  it('expires at the exact instant, revokes sessions, and refuses late renewal', async () => {
    const userId = seedActiveAccount()
    await ensureOrdinaryAccountLifecycle(migrated.db, userId)
    migrated.sqlite.prepare(`INSERT INTO session
      (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
      VALUES ('session-1', '2027-08-20T00:00:00.000Z', 'token-1',
        '2027-08-01T00:00:00.000Z', '2027-08-01T00:00:00.000Z', ?)`).run(userId)

    const before = await getOrdinaryAccountLifecycleStatus(migrated.db, userId, '2027-08-13T11:59:59.999Z')
    const expired = await getOrdinaryAccountLifecycleStatus(migrated.db, userId, '2027-08-13T12:00:00.000Z')
    expect(before?.state).toBe('renewal-notice')
    expect(expired).toMatchObject({ state: 'expired', renewalAllowed: false })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM session WHERE "userId" = ?').get(userId))
      .toEqual({ count: 0 })
    await expect(renewOrdinaryAccount(
      migrated.db, userId, expired!.version, 'late-renewal-request', '2027-08-13T12:00:00.000Z',
    )).rejects.toThrow('expired')
  })

  it('permanently deletes the complete private graph through one guarded transition', async () => {
    const userId = seedActiveAccount()
    const lifecycle = await ensureOrdinaryAccountLifecycle(migrated.db, userId)
    migrated.sqlite.prepare(`UPDATE ordinary_account_lifecycles SET
      state = 'expired', confirmed_delivery_at = '2027-07-13T12:00:00.000Z',
      deletion_due_at = '2028-01-13T12:00:00.000Z', expired_at = '2027-08-13T12:00:00.000Z',
      updated_at = '2027-08-13T12:00:00.000Z', version = version + 1 WHERE auth_user_id = ?`).run(userId)
    migrated.sqlite.prepare(`INSERT INTO verification
      (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
      VALUES ('verification-1', 'hashed-reset', ?, '2028-02-01T00:00:00.000Z',
        '2027-12-01T00:00:00.000Z', '2027-12-01T00:00:00.000Z')`).run(userId)
    migrated.sqlite.prepare(`INSERT INTO local_auth_email_previews
      (id, auth_user_id, purpose, one_time_url, created_at, expires_at)
      VALUES ('preview-1', ?, 'renewal-warning', '/account',
        '2027-07-13T12:00:00.000Z', '2028-07-13T12:00:00.000Z')`).run(userId)
    migrated.sqlite.prepare(`INSERT INTO maintenance_runs
      (id, trigger_type, dispatcher_rule_version, status, started_at, operator_tenure_id)
      VALUES ('deletion-run', 'local-test', 'maintenance-dispatcher-v1', 'running',
        '2028-01-13T12:00:00.000Z', NULL)`).run()

    await expect(migrated.db.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run())
      .rejects.toThrow('guarded lifecycle')
    expect(await deleteDueOrdinaryAccount(
      migrated.db, userId, 'deletion-run', '2028-01-13T12:00:00.000Z',
    )).toBe(true)
    expect(await deleteDueOrdinaryAccount(
      migrated.db, userId, 'deletion-run', '2028-01-13T12:00:00.000Z',
    )).toBe(false)
    await expect(migrated.db.prepare(`INSERT INTO verification
      (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
      VALUES ('orphan-reset-after-delete', 'hashed-late-reset', ?,
        '2028-02-01T00:00:00.000Z', '2028-01-13T12:00:01.000Z',
        '2028-01-13T12:00:01.000Z')`).bind(userId).run())
      .rejects.toThrow('password recovery is unavailable')

    for (const table of [
      'user', 'account', 'session', 'verification', 'ordinary_account_profiles',
      'ordinary_account_eligibility_challenges', 'ordinary_adult_eligibility',
      'local_auth_email_previews', 'ordinary_account_lifecycles',
      'ordinary_account_renewal_events', 'ordinary_account_notice_deliveries',
      'ordinary_account_lifecycle_events', 'ordinary_account_deletion_guards',
    ]) {
      expect(migrated.sqlite.prepare(`SELECT COUNT(*) count FROM "${table}"`).get(), table)
        .toEqual({ count: 0 })
    }
    expect(lifecycle).not.toBeNull()
  })

  it('blocks reset material and password updates for an expired ordinary Account', async () => {
    const userId = seedActiveAccount('expired-recovery-user', '2024-01-01T00:00:00.000Z')
    await ensureOrdinaryAccountLifecycle(migrated.db, userId, '2026-08-13T12:00:00.000Z')

    await expect(migrated.db.prepare(`INSERT INTO verification
      (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
      VALUES ('expired-reset', 'hashed-expired-reset', ?,
        '2026-08-13T13:00:00.000Z', '2026-08-13T12:00:00.000Z',
        '2026-08-13T12:00:00.000Z')`).bind(userId).run())
      .rejects.toThrow('password recovery is unavailable')
    await expect(migrated.db.prepare(`UPDATE account SET password = 'replacement-verifier'
      WHERE "userId" = ?`).bind(userId).run())
      .rejects.toThrow('password recovery is unavailable')
    await expect(migrated.db.prepare(`INSERT INTO account
      (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES ('replacement-expired-credential', ?, 'credential', ?,
        'replacement-verifier', '2026-08-13T12:00:00.000Z', '2026-08-13T12:00:00.000Z')`)
      .bind(userId, userId).run()).rejects.toThrow('password recovery is unavailable')
  })
})
