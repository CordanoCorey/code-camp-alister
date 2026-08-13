import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMaintenance } from './maintenance'
import { ensureOrdinaryAccountLifecycle, renewOrdinaryAccount } from './ordinary-account-lifecycle-repository'
import { createMigratedD1 } from './test-sqlite-d1'

describe('ordinary Account lifecycle maintenance', () => {
  let migrated: ReturnType<typeof createMigratedD1>
  let id = 0

  beforeEach(() => { migrated = createMigratedD1(); id = 0 })
  afterEach(() => migrated.close())

  function seedActiveAccount(userId = 'lifecycle-maintenance-user') {
    const activatedAt = '2026-08-13T12:00:00.000Z'
    migrated.sqlite.prepare(`INSERT INTO "user"
      (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
      VALUES (?, 'Alex', ?, 1, NULL, ?, ?)`)
      .run(userId, `${userId}@example.test`, activatedAt, activatedAt)
    migrated.sqlite.prepare(`INSERT INTO account
      (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (?, ?, 'credential', ?, 'test-password-verifier', ?, ?)`).run(
      `credential-${userId}`, userId, userId, activatedAt, activatedAt,
    )
    migrated.sqlite.prepare(`INSERT INTO ordinary_account_eligibility_challenges
      (id, secret_hash, confirmed_at, attestation_version, expires_at,
       reserved_at, reserved_request_id, consumed_at, consumed_auth_user_id)
      VALUES (?, ?, ?, 'ordinary-adult-v1', '2026-08-13T12:20:00.000Z',
        ?, 'request', ?, ?)`).run(
        `challenge-${userId}`, userId.padEnd(64, 'a').slice(0, 64),
        activatedAt, activatedAt, activatedAt, userId,
      )
    migrated.sqlite.prepare(`INSERT INTO ordinary_account_profiles
      (auth_user_id, activation_state, eligibility_challenge_id, display_name, onboarding_path,
       claimed_position, claimed_position_other, current_outpost_id, outpost_claim,
       usa_jurisdiction_id, country_code, international_subdivision,
       created_at, updated_at, activated_at, version)
      VALUES (?, 'active', ?, 'Alex', 'usa', 'Adult Leader', NULL, NULL, 'Private claim',
        'us-va', NULL, NULL, ?, ?, ?, 1)`).run(
      userId, `challenge-${userId}`, activatedAt, activatedAt, activatedAt,
    )
    migrated.sqlite.prepare(`INSERT INTO ordinary_adult_eligibility
      (auth_user_id, confirmed, confirmed_at, attestation_version)
      VALUES (?, 1, ?, 'ordinary-adult-v1')`).run(userId, activatedAt)
    return userId
  }

  function enableLifecycleJob(now: string) {
    migrated.sqlite.prepare(`UPDATE maintenance_jobs SET enabled = CASE
      WHEN job_key = 'ordinary-account-lifecycle' THEN 1 ELSE 0 END,
      next_due_at = ?, lease_owner = NULL, lease_expires_at = NULL`).run(now)
  }

  function dependencies(now: () => Date, fetcher: typeof fetch, mode: 'local-preview' | 'resend' = 'local-preview') {
    return {
      db: migrated.db,
      now,
      createId: () => `lifecycle-maintenance-${++id}`,
      fetch: fetcher,
      ordinaryAccountLifecycle: {
        accountUrl: 'https://hub.example/account',
        email: mode === 'local-preview'
          ? { mode: 'local-preview' as const }
          : { mode: 'resend' as const, sender: 'Account <account@example.test>', apiKey: 'test-key' },
      },
    }
  }

  it('accepts one warning at the exact notice boundary and starts the six-calendar-month deadline once', async () => {
    const userId = seedActiveAccount()
    await ensureOrdinaryAccountLifecycle(migrated.db, userId, '2026-08-13T12:00:00.000Z')
    const boundary = '2027-07-13T12:00:00.000Z'
    enableLifecycleJob(boundary)
    const deps = dependencies(() => new Date(boundary), async () => { throw new Error('local preview must not fetch') })

    const first = await runMaintenance(deps, { trigger: 'local-test' })
    expect(first).toMatchObject({ jobsClaimed: 1, actionsApplied: 1, failedTasks: 0, outboundSubrequests: 0 })
    expect(migrated.sqlite.prepare(`SELECT state, confirmed_delivery_at, deletion_due_at
      FROM ordinary_account_lifecycles WHERE auth_user_id = ?`).get(userId)).toEqual({
      state: 'renewal-notice',
      confirmed_delivery_at: boundary,
      deletion_due_at: '2028-01-13T12:00:00.000Z',
    })
    expect(migrated.sqlite.prepare(`SELECT purpose, one_time_url FROM local_auth_email_previews`).get())
      .toEqual({ purpose: 'renewal-warning', one_time_url: 'https://hub.example/account' })

    enableLifecycleJob(boundary)
    await runMaintenance(deps, { trigger: 'local-test' })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM ordinary_account_notice_deliveries').get())
      .toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM local_auth_email_previews').get())
      .toEqual({ count: 1 })
  })

  it('retries transient delivery with one provider key and never starts deletion before acceptance', async () => {
    const userId = seedActiveAccount()
    await ensureOrdinaryAccountLifecycle(migrated.db, userId, '2026-08-13T12:00:00.000Z')
    let current = '2027-07-13T12:00:00.000Z'
    const providerKeys: string[] = []
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      providerKeys.push(new Headers(init?.headers).get('idempotency-key') ?? '')
      return new Response(null, { status: 503 })
    }
    const deps = dependencies(() => new Date(current), fetcher as typeof fetch, 'resend')

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      enableLifecycleJob(current)
      await runMaintenance(deps, { trigger: 'local-test' })
      const lifecycle = migrated.sqlite.prepare(`SELECT confirmed_delivery_at, deletion_due_at
        FROM ordinary_account_lifecycles WHERE auth_user_id = ?`).get(userId)
      expect(lifecycle).toEqual({ confirmed_delivery_at: null, deletion_due_at: null })
      const latest = migrated.sqlite.prepare(`SELECT state, next_attempt_at
        FROM ordinary_account_notice_deliveries ORDER BY attempt_number DESC LIMIT 1`).get() as {
        state: string; next_attempt_at: string | null
      }
      if (attempt < 5) {
        expect(latest.state).toBe('retry')
        const normalJobDueAt = new Date(Date.parse(current) + 3_600_000).toISOString()
        expect(migrated.sqlite.prepare(`SELECT next_due_at FROM maintenance_jobs
          WHERE job_key = 'ordinary-account-lifecycle'`).get()).toEqual({
          next_due_at: (latest.next_attempt_at as string) < normalJobDueAt
            ? latest.next_attempt_at
            : normalJobDueAt,
        })
        current = latest.next_attempt_at as string
      } else {
        expect(latest).toEqual({ state: 'permanent-failure', next_attempt_at: null })
      }
    }

    expect(providerKeys).toHaveLength(5)
    expect(new Set(providerKeys).size).toBe(1)
    expect(migrated.sqlite.prepare(`SELECT COUNT(*) count FROM automation_alerts
      WHERE coalescing_key LIKE 'ordinary-warning-delivery:%' AND status = 'open'`).get())
      .toEqual({ count: 1 })
  })

  it('keeps the earliest future retry due across multiple Accounts', async () => {
    const firstUser = seedActiveAccount('retry-user-one')
    const secondUser = seedActiveAccount('retry-user-two')
    await ensureOrdinaryAccountLifecycle(migrated.db, firstUser, '2026-08-13T12:00:00.000Z')
    await ensureOrdinaryAccountLifecycle(migrated.db, secondUser, '2026-08-13T12:00:00.000Z')
    const lifecycles = migrated.sqlite.prepare(`SELECT id, access_due_at
      FROM ordinary_account_lifecycles ORDER BY id`).all() as Array<{ id: string; access_due_at: string }>
    const current = '2027-07-13T12:00:00.000Z'
    const retryTimes = ['2027-07-13T12:05:00.000Z', '2027-07-13T12:15:00.000Z']
    lifecycles.forEach((lifecycle, index) => {
      migrated.sqlite.prepare(`INSERT INTO ordinary_account_notice_deliveries
        (id, lifecycle_id, term_due_at, attempt_number, state, idempotency_key,
         next_attempt_at, created_at, updated_at)
        VALUES (?, ?, ?, 1, 'retry', ?, ?, ?, ?)`)
        .run(`future-retry-${index}`, lifecycle.id, lifecycle.access_due_at,
          `ordinary-account-warning:future-retry:${index}`, retryTimes[index], current, current)
    })
    enableLifecycleJob(current)

    const result = await runMaintenance(
      dependencies(() => new Date(current), async () => { throw new Error('not due') }),
      { trigger: 'local-test' },
    )

    expect(result).toMatchObject({ actionsApplied: 0, failedTasks: 0 })
    expect(migrated.sqlite.prepare(`SELECT next_due_at FROM maintenance_jobs
      WHERE job_key = 'ordinary-account-lifecycle'`).get()).toEqual({ next_due_at: retryTimes[0] })
  })

  it('reclaims a stale sending attempt after a crash and reuses the term provider key', async () => {
    const userId = seedActiveAccount()
    await ensureOrdinaryAccountLifecycle(migrated.db, userId, '2026-08-13T12:00:00.000Z')
    const boundary = '2027-07-13T12:00:00.000Z'
    const lifecycle = migrated.sqlite.prepare(`SELECT id, access_due_at
      FROM ordinary_account_lifecycles WHERE auth_user_id = ?`).get(userId) as {
        id: string; access_due_at: string
      }
    migrated.sqlite.prepare(`INSERT INTO ordinary_account_notice_deliveries
      (id, lifecycle_id, term_due_at, attempt_number, state, idempotency_key,
       attempted_at, created_at, updated_at)
      VALUES ('crashed-warning-attempt', ?, ?, 1, 'sending',
        'ordinary-account-warning:crashed-attempt', ?, ?, ?)`)
      .run(lifecycle.id, lifecycle.access_due_at, boundary, boundary, boundary)

    const recoveredAt = '2027-07-13T12:11:00.000Z'
    enableLifecycleJob(recoveredAt)
    const providerKeys: string[] = []
    const result = await runMaintenance(dependencies(() => new Date(recoveredAt), async (_input, init) => {
      providerKeys.push(new Headers(init?.headers).get('idempotency-key') ?? '')
      return new Response(null, { status: 202 })
    }, 'resend'), { trigger: 'local-test' })

    expect(result).toMatchObject({ actionsApplied: 1, failedTasks: 0, outboundSubrequests: 1 })
    expect(providerKeys).toHaveLength(1)
    expect(migrated.sqlite.prepare(`SELECT state, attempt_number FROM ordinary_account_notice_deliveries
      WHERE id = 'crashed-warning-attempt'`).get()).toEqual({ state: 'accepted', attempt_number: 1 })
    expect(migrated.sqlite.prepare(`SELECT confirmed_delivery_at, deletion_due_at
      FROM ordinary_account_lifecycles WHERE auth_user_id = ?`).get(userId)).toEqual({
      confirmed_delivery_at: recoveredAt,
      deletion_due_at: '2028-01-13T12:11:00.000Z',
    })
  })

  it('starts the deletion clock at provider acceptance rather than request start', async () => {
    const userId = seedActiveAccount()
    await ensureOrdinaryAccountLifecycle(migrated.db, userId, '2026-08-13T12:00:00.000Z')
    let current = '2027-07-13T12:00:00.000Z'
    enableLifecycleJob(current)
    await runMaintenance(dependencies(() => new Date(current), async () => {
      current = '2027-07-13T12:02:30.000Z'
      return new Response(null, { status: 202 })
    }, 'resend'), { trigger: 'local-test' })

    expect(migrated.sqlite.prepare(`SELECT confirmed_delivery_at, deletion_due_at
      FROM ordinary_account_lifecycles WHERE auth_user_id = ?`).get(userId)).toEqual({
      confirmed_delivery_at: '2027-07-13T12:02:30.000Z',
      deletion_due_at: '2028-01-13T12:02:30.000Z',
    })
  })

  it('does not restore an old warning deadline when renewal wins during provider delivery', async () => {
    const userId = seedActiveAccount()
    const lifecycle = await ensureOrdinaryAccountLifecycle(
      migrated.db, userId, '2026-08-13T12:00:00.000Z',
    )
    let current = '2027-07-13T12:00:00.000Z'
    enableLifecycleJob(current)
    await runMaintenance(dependencies(() => new Date(current), async () => {
      current = '2027-07-13T12:00:01.000Z'
      await renewOrdinaryAccount(
        migrated.db, userId, lifecycle!.version,
        'renewal-during-provider-delivery', current,
      )
      return new Response(null, { status: 202 })
    }, 'resend'), { trigger: 'local-test' })

    expect(migrated.sqlite.prepare(`SELECT state, access_due_at, confirmed_delivery_at, deletion_due_at
      FROM ordinary_account_lifecycles WHERE auth_user_id = ?`).get(userId)).toEqual({
      state: 'active',
      access_due_at: '2028-08-13T12:00:00.000Z',
      confirmed_delivery_at: null,
      deletion_due_at: null,
    })
    expect(migrated.sqlite.prepare(`SELECT state FROM ordinary_account_notice_deliveries
      WHERE lifecycle_id = ?`).get(lifecycle!.id)).toEqual({ state: 'cancelled' })
  })

  it('does not confirm a warning or start deletion when provider acceptance crosses expiry', async () => {
    const userId = seedActiveAccount()
    await ensureOrdinaryAccountLifecycle(migrated.db, userId, '2026-08-13T12:00:00.000Z')
    let current = '2027-08-13T11:59:59.999Z'
    enableLifecycleJob(current)
    await runMaintenance(dependencies(() => new Date(current), async () => {
      current = '2027-08-13T12:00:00.001Z'
      return new Response(null, { status: 202 })
    }, 'resend'), { trigger: 'local-test' })

    expect(migrated.sqlite.prepare(`SELECT confirmed_delivery_at, deletion_due_at
      FROM ordinary_account_lifecycles WHERE auth_user_id = ?`).get(userId)).toEqual({
      confirmed_delivery_at: null,
      deletion_due_at: null,
    })
    expect(migrated.sqlite.prepare(`SELECT state FROM ordinary_account_notice_deliveries`).get())
      .toEqual({ state: 'cancelled' })
  })

  it('does not delete a timely renewal when the old deadline arrives', async () => {
    const userId = seedActiveAccount()
    const lifecycle = await ensureOrdinaryAccountLifecycle(migrated.db, userId, '2026-08-13T12:00:00.000Z')
    const warningAt = '2027-07-13T12:00:00.000Z'
    enableLifecycleJob(warningAt)
    await runMaintenance(dependencies(() => new Date(warningAt), async () => { throw new Error('no fetch') }), {
      trigger: 'local-test',
    })
    await renewOrdinaryAccount(migrated.db, userId, lifecycle!.version + 1,
      'maintenance-renewal-request', '2027-07-14T12:00:00.000Z')

    const oldDeadline = '2028-01-13T12:00:00.000Z'
    enableLifecycleJob(oldDeadline)
    await runMaintenance(dependencies(() => new Date(oldDeadline), async () => { throw new Error('no fetch') }), {
      trigger: 'local-test',
    })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM "user" WHERE id = ?').get(userId))
      .toEqual({ count: 1 })
    expect(migrated.sqlite.prepare(`SELECT state, deletion_due_at, access_due_at
      FROM ordinary_account_lifecycles WHERE auth_user_id = ?`).get(userId)).toEqual({
      state: 'active', deletion_due_at: null, access_due_at: '2028-08-13T12:00:00.000Z',
    })
  })

  it('deletes the complete expired Account at the exact deadline without touching public or Operator data', async () => {
    const userId = seedActiveAccount()
    await ensureOrdinaryAccountLifecycle(migrated.db, userId, '2026-08-13T12:00:00.000Z')
    migrated.sqlite.prepare(`UPDATE ordinary_account_lifecycles SET state = 'expired',
      confirmed_delivery_at = '2027-07-13T12:00:00.000Z',
      deletion_due_at = '2028-01-13T12:00:00.000Z',
      expired_at = '2027-08-13T12:00:00.000Z',
      updated_at = '2027-08-13T12:00:00.000Z', version = version + 1
      WHERE auth_user_id = ?`).run(userId)
    const publicCount = migrated.sqlite.prepare('SELECT COUNT(*) count FROM content_records').get()
    const operator = migrated.sqlite.prepare(`SELECT state, version FROM operator_account
      WHERE singleton_key = 1`).get()
    const deadline = '2028-01-13T12:00:00.000Z'
    enableLifecycleJob(deadline)
    const result = await runMaintenance(
      dependencies(() => new Date(deadline), async () => { throw new Error('no fetch') }),
      { trigger: 'local-test' },
    )

    expect(result).toMatchObject({ actionsApplied: 1, failedTasks: 0 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM "user" WHERE id = ?').get(userId))
      .toEqual({ count: 0 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM ordinary_account_lifecycles').get())
      .toEqual({ count: 0 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM content_records').get()).toEqual(publicCount)
    expect(migrated.sqlite.prepare(`SELECT state, version FROM operator_account
      WHERE singleton_key = 1`).get()).toEqual(operator)
  })
})
