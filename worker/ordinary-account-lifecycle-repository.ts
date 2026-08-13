import {
  deriveOrdinaryLifecycleState,
  initialOrdinaryAccessSchedule,
  renewedOrdinaryAccessSchedule,
  type OrdinaryLifecycleState,
} from '../shared/ordinary-account-lifecycle.ts'

const SYSTEM_ACTOR = 'Automation: ordinary-account-lifecycle-v1'

type LifecycleRow = {
  id: string
  auth_user_id: string
  state: OrdinaryLifecycleState
  activated_at: string
  term_base_at: string
  access_due_at: string
  notice_open_at: string
  confirmed_delivery_at: string | null
  deletion_due_at: string | null
  last_renewed_at: string | null
  expired_at: string | null
  version: number
}

export type OrdinaryAccountLifecycleStatus = {
  id: string
  state: OrdinaryLifecycleState
  accessDueAt: string
  noticeOpenAt: string
  confirmedDeliveryAt: string | null
  deletionDueAt: string | null
  renewalAllowed: boolean
  warningDelivery: 'not-due' | 'pending' | 'accepted' | 'failed'
  version: number
}

function lifecycleId() {
  return `ordinary-lifecycle-${crypto.randomUUID()}`
}

function eventId() {
  return `ordinary-lifecycle-event-${crypto.randomUUID()}`
}

async function lifecycleRow(db: D1Database, authUserId: string) {
  return db.prepare(`SELECT id, auth_user_id, state, activated_at, term_base_at,
      access_due_at, notice_open_at, confirmed_delivery_at, deletion_due_at,
      last_renewed_at, expired_at, version
    FROM ordinary_account_lifecycles WHERE auth_user_id = ?`)
    .bind(authUserId).first<LifecycleRow>()
}

async function warningDeliveryState(
  db: D1Database,
  row: LifecycleRow,
  state: OrdinaryLifecycleState,
) {
  if (row.confirmed_delivery_at) return 'accepted' as const
  const attempt = await db.prepare(`SELECT state FROM ordinary_account_notice_deliveries
    WHERE lifecycle_id = ? AND term_due_at = ?
    ORDER BY attempt_number DESC LIMIT 1`).bind(row.id, row.access_due_at)
    .first<{ state: string }>()
  if (attempt?.state === 'permanent-failure') return 'failed' as const
  if (attempt) return 'pending' as const
  return state === 'renewal-notice' ? 'pending' as const : 'not-due' as const
}

async function statusFromRow(db: D1Database, row: LifecycleRow, now: string) {
  const state = row.state === 'expired'
    ? 'expired'
    : deriveOrdinaryLifecycleState({
      accessDueAt: row.access_due_at,
      noticeOpenAt: row.notice_open_at,
    }, now)
  return {
    id: row.id,
    state,
    accessDueAt: row.access_due_at,
    noticeOpenAt: row.notice_open_at,
    confirmedDeliveryAt: row.confirmed_delivery_at,
    deletionDueAt: row.deletion_due_at,
    renewalAllowed: state !== 'expired',
    warningDelivery: await warningDeliveryState(db, row, state),
    version: row.version,
  } satisfies OrdinaryAccountLifecycleStatus
}

async function expireIfDue(db: D1Database, row: LifecycleRow, now: string) {
  if (Date.parse(now) < Date.parse(row.access_due_at)) return row
  const idempotencyKey = `ordinary-account-lifecycle-v1:expired:${row.id}:${row.access_due_at}`
  await db.batch([
    db.prepare(`UPDATE ordinary_account_lifecycles SET state = 'expired', expired_at = ?,
      updated_at = ?, version = version + 1
      WHERE id = ? AND state <> 'expired' AND access_due_at <= ? AND version = ?`)
      .bind(now, now, row.id, now, row.version),
    db.prepare(`DELETE FROM "session" WHERE "userId" = ? AND EXISTS (
      SELECT 1 FROM ordinary_account_lifecycles lifecycle
      WHERE lifecycle.id = ? AND lifecycle.access_due_at <= ?
    )`).bind(row.auth_user_id, row.id, now),
    db.prepare(`INSERT OR IGNORE INTO ordinary_account_lifecycle_events
      (id, lifecycle_id, event_type, idempotency_key, event_at, prior_state,
       resulting_state, due_at, actor_label)
      SELECT ?, id, 'expired', ?, ?, ?, 'expired', access_due_at, ?
      FROM ordinary_account_lifecycles
      WHERE id = ? AND state = 'expired' AND access_due_at <= ?`)
      .bind(eventId(), idempotencyKey, now, row.state, SYSTEM_ACTOR, row.id, now),
  ])
  return (await lifecycleRow(db, row.auth_user_id)) ?? row
}

export async function ensureOrdinaryAccountLifecycle(
  db: D1Database,
  authUserId: string,
  now = new Date().toISOString(),
) {
  let row = await lifecycleRow(db, authUserId)
  if (!row) {
    const profile = await db.prepare(`SELECT profile.activated_at
      FROM ordinary_account_profiles profile
      JOIN "user" auth_user ON auth_user.id = profile.auth_user_id
      JOIN ordinary_adult_eligibility eligibility ON eligibility.auth_user_id = profile.auth_user_id
      WHERE profile.auth_user_id = ? AND profile.activation_state = 'active'
        AND profile.activated_at IS NOT NULL AND auth_user."emailVerified" = 1`)
      .bind(authUserId).first<{ activated_at: string }>()
    if (!profile) return null
    const schedule = initialOrdinaryAccessSchedule(profile.activated_at)
    const id = lifecycleId()
    await db.prepare(`INSERT OR IGNORE INTO ordinary_account_lifecycles
      (id, auth_user_id, state, activated_at, term_base_at, access_due_at,
       notice_open_at, version, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?, ?, 1, ?, ?)`)
      .bind(id, authUserId, profile.activated_at, profile.activated_at,
        schedule.accessDueAt, schedule.noticeOpenAt, profile.activated_at, profile.activated_at)
      .run()
    row = await lifecycleRow(db, authUserId)
    if (!row) throw new Error('The ordinary Account lifecycle could not be activated.')
  }

  await db.prepare(`INSERT OR IGNORE INTO ordinary_account_lifecycle_events
    (id, lifecycle_id, event_type, idempotency_key, event_at, prior_state,
     resulting_state, due_at, actor_label)
    VALUES (?, ?, 'activated', ?, ?, NULL, 'active', ?, ?)`)
    .bind(eventId(), row.id, `ordinary-account-lifecycle-v1:activated:${row.id}`,
      row.activated_at, row.access_due_at, SYSTEM_ACTOR).run()

  row = await expireIfDue(db, row, now)
  return statusFromRow(db, row, now)
}

export async function getOrdinaryAccountLifecycleStatus(
  db: D1Database,
  authUserId: string,
  now = new Date().toISOString(),
) {
  return ensureOrdinaryAccountLifecycle(db, authUserId, now)
}

export async function peekOrdinaryAccountLifecycleStatus(
  db: D1Database,
  authUserId: string,
  now = new Date().toISOString(),
) {
  const row = await lifecycleRow(db, authUserId)
  return row ? statusFromRow(db, row, now) : ensureOrdinaryAccountLifecycle(db, authUserId, now)
}

function validIdempotencyKey(value: string) {
  return value.length >= 16 && value.length <= 160
    && [...value].every((character) => {
      const code = character.codePointAt(0) ?? 0
      return code > 31 && code !== 127
    })
}

export async function renewOrdinaryAccount(
  db: D1Database,
  authUserId: string,
  expectedVersion: number,
  idempotencyKey: string,
  now = new Date().toISOString(),
) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error('Reload the Account lifecycle before renewing.')
  }
  if (!validIdempotencyKey(idempotencyKey)) throw new Error('A valid renewal request key is required.')
  await ensureOrdinaryAccountLifecycle(db, authUserId, now)
  const row = await lifecycleRow(db, authUserId)
  if (!row) throw new Error('Verified ordinary Account required.')
  const state = deriveOrdinaryLifecycleState({
    accessDueAt: row.access_due_at,
    noticeOpenAt: row.notice_open_at,
  }, now)
  if (row.state === 'expired' || state === 'expired') throw new Error('An expired Account cannot be renewed.')

  if (row.version !== expectedVersion) {
    const replay = await db.prepare(`SELECT id FROM ordinary_account_renewal_events
      WHERE lifecycle_id = ? AND version_before = ? LIMIT 1`)
      .bind(row.id, expectedVersion).first<{ id: string }>()
    if (!replay) throw new Error('This Account lifecycle changed after you opened it. Reload before renewing.')
    return statusFromRow(db, row, now)
  }

  const schedule = renewedOrdinaryAccessSchedule(row.access_due_at, now)
  const eventKey = `ordinary-account-lifecycle-v1:renewed:${row.id}:${row.access_due_at}`
  await db.batch([
    db.prepare(`UPDATE ordinary_account_lifecycles SET state = 'active',
      term_base_at = access_due_at, access_due_at = ?, notice_open_at = ?,
      confirmed_delivery_at = NULL, deletion_due_at = NULL, last_renewed_at = ?,
      expired_at = NULL, updated_at = ?, version = version + 1
      WHERE id = ? AND auth_user_id = ? AND state IN ('active', 'renewal-notice')
        AND access_due_at = ? AND access_due_at > ? AND version = ?`)
      .bind(schedule.accessDueAt, schedule.noticeOpenAt, now, now,
        row.id, authUserId, row.access_due_at, now, expectedVersion),
    db.prepare(`UPDATE ordinary_account_notice_deliveries
      SET state = 'cancelled', outcome_category = 'cancelled', next_attempt_at = NULL,
        updated_at = ?
      WHERE lifecycle_id = ? AND term_due_at = ? AND state IN ('queued', 'sending', 'retry')`)
      .bind(now, row.id, row.access_due_at),
    db.prepare(`INSERT OR IGNORE INTO ordinary_account_renewal_events
      (id, lifecycle_id, prior_due_at, renewed_at, new_due_at, idempotency_key,
       version_before, version_after)
      SELECT ?, id, ?, ?, ?, ?, ?, ?
      FROM ordinary_account_lifecycles
      WHERE id = ? AND auth_user_id = ? AND version = ? AND access_due_at = ?`)
      .bind(`ordinary-renewal-${crypto.randomUUID()}`, row.access_due_at, now,
        schedule.accessDueAt, idempotencyKey, expectedVersion, expectedVersion + 1,
        row.id, authUserId, expectedVersion + 1, schedule.accessDueAt),
    db.prepare(`INSERT OR IGNORE INTO ordinary_account_lifecycle_events
      (id, lifecycle_id, event_type, idempotency_key, event_at, prior_state,
       resulting_state, due_at, actor_label)
      SELECT ?, id, 'renewed', ?, ?, ?, 'active', access_due_at, 'Account holder'
      FROM ordinary_account_lifecycles
      WHERE id = ? AND auth_user_id = ? AND version = ? AND access_due_at = ?`)
      .bind(eventId(), eventKey, now, row.state, row.id, authUserId,
        expectedVersion + 1, schedule.accessDueAt),
  ])

  const renewal = await db.prepare(`SELECT id FROM ordinary_account_renewal_events
    WHERE lifecycle_id = ? AND prior_due_at = ?`).bind(row.id, row.access_due_at)
    .first<{ id: string }>()
  const current = await lifecycleRow(db, authUserId)
  if (!renewal || !current) throw new Error('This Account lifecycle changed before renewal completed.')
  return statusFromRow(db, current, now)
}

export async function deleteDueOrdinaryAccount(
  db: D1Database,
  authUserId: string,
  maintenanceRunId: string,
  now = new Date().toISOString(),
) {
  const row = await lifecycleRow(db, authUserId)
  if (!row || row.state !== 'expired' || !row.deletion_due_at
    || Date.parse(row.deletion_due_at) > Date.parse(now)) return false

  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO ordinary_account_deletion_guards
      (auth_user_id, lifecycle_id, expected_version, maintenance_run_id, action, created_at)
      SELECT auth_user_id, id, version, ?, 'ordinary-account-lifecycle-deletion-v1', ?
      FROM ordinary_account_lifecycles
      WHERE id = ? AND auth_user_id = ? AND state = 'expired'
        AND deletion_due_at IS NOT NULL AND deletion_due_at <= ? AND version = ?`)
      .bind(maintenanceRunId, now, row.id, authUserId, now, row.version),
    db.prepare(`DELETE FROM "session" WHERE "userId" = ? AND EXISTS (
      SELECT 1 FROM ordinary_account_deletion_guards WHERE auth_user_id = ?
    )`).bind(authUserId, authUserId),
    db.prepare(`DELETE FROM verification WHERE value = ? AND EXISTS (
      SELECT 1 FROM ordinary_account_deletion_guards WHERE auth_user_id = ?
    )`).bind(authUserId, authUserId),
    db.prepare(`DELETE FROM local_auth_email_previews WHERE auth_user_id = ? AND EXISTS (
      SELECT 1 FROM ordinary_account_deletion_guards WHERE auth_user_id = ?
    )`).bind(authUserId, authUserId),
    db.prepare(`DELETE FROM "account" WHERE "userId" = ? AND EXISTS (
      SELECT 1 FROM ordinary_account_deletion_guards WHERE auth_user_id = ?
    )`).bind(authUserId, authUserId),
    db.prepare(`DELETE FROM "user" WHERE id = ? AND EXISTS (
      SELECT 1 FROM ordinary_account_deletion_guards WHERE auth_user_id = ?
    )`).bind(authUserId, authUserId),
    db.prepare('DELETE FROM ordinary_account_deletion_guards WHERE auth_user_id = ?')
      .bind(authUserId),
  ])

  const remaining = await db.prepare('SELECT id FROM "user" WHERE id = ?')
    .bind(authUserId).first<{ id: string }>()
  if (remaining) throw new Error('Guarded ordinary Account deletion did not remove the complete user.')
  return true
}
