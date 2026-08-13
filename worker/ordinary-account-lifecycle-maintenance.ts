import { deletionDueFromConfirmedWarning } from '../shared/ordinary-account-lifecycle.ts'
import {
  deliverAuthEmail,
  EmailDeliveryError,
  type AuthEmailConfiguration,
} from './auth-email.ts'
import {
  deleteDueOrdinaryAccount,
  getOrdinaryAccountLifecycleStatus,
} from './ordinary-account-lifecycle-repository.ts'
import { sha256 } from './sha256.ts'

const SYSTEM_ACTOR = 'Automation: ordinary-account-lifecycle-v1'
const MAX_DELIVERY_ATTEMPTS = 5
const DELIVERY_CLAIM_STALE_SECONDS = 600
const RETRY_SECONDS = [300, 900, 3_600, 21_600] as const

type LifecycleMaintenanceDependencies = {
  db: D1Database
  now: () => Date
  createId: () => string
  fetch: typeof fetch
  ordinaryAccountLifecycle?: {
    accountUrl: string
    email: AuthEmailConfiguration
  }
}

type LifecycleJob = {
  job_key: string
  rule_version: string
  batch_size: number
}

type LifecycleCandidate = {
  id: string
  auth_user_id: string
  access_due_at: string
  notice_open_at: string
  version: number
}

type DeliveryAttempt = {
  id: string
  attempt_number: number
  state: 'queued' | 'sending' | 'retry' | 'accepted' | 'permanent-failure' | 'cancelled'
  attempted_at: string | null
  next_attempt_at: string | null
}

export type OrdinaryLifecycleMaintenanceOutcome = {
  actionsApplied: number
  failedTasks: number
  outboundSubrequests: number
  fetchedBytes: number
  nextDueAt?: string
}

function plusSeconds(value: string, seconds: number) {
  return new Date(Date.parse(value) + seconds * 1_000).toISOString()
}

async function finalizeOutcome(
  dependencies: LifecycleMaintenanceDependencies,
  outcome: OrdinaryLifecycleMaintenanceOutcome,
) {
  const retry = await dependencies.db.prepare(`SELECT MIN(next_attempt_at) next_due_at
    FROM ordinary_account_notice_deliveries
    WHERE state = 'retry' AND next_attempt_at IS NOT NULL`)
    .first<{ next_due_at: string | null }>()
  if (retry?.next_due_at && (!outcome.nextDueAt || retry.next_due_at < outcome.nextDueAt)) {
    outcome.nextDueAt = retry.next_due_at
  }
  return outcome
}

async function stableProviderKey(lifecycleId: string, termDueAt: string) {
  return `ordinary-account-warning-${await sha256(`${lifecycleId}:${termDueAt}`)}`
}

async function recordPermanentFailureAlert(
  dependencies: LifecycleMaintenanceDependencies,
  runId: string,
  job: LifecycleJob,
  lifecycleId: string,
  now: string,
) {
  const key = `ordinary-warning-delivery:${lifecycleId}`
  const existing = await dependencies.db.prepare(`SELECT id FROM automation_alerts
    WHERE coalescing_key = ? AND status IN ('open', 'acknowledged')`)
    .bind(key).first<{ id: string }>()
  if (existing) {
    await dependencies.db.prepare(`UPDATE automation_alerts SET occurrence_count = occurrence_count + 1,
      last_seen_at = ?, severity = 'critical', alert_type = 'repeated-failure'
      WHERE id = ?`).bind(now, existing.id).run()
    return
  }
  await dependencies.db.prepare(`INSERT INTO automation_alerts
    (id, maintenance_run_id, rule_version, actor_label, alert_type, severity,
     job_key, source_document_id, coalescing_key, summary, status,
     occurrence_count, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, 'repeated-failure', 'critical', ?, NULL, ?,
      'An ordinary Account renewal warning reached a permanent delivery failure; no deletion deadline was started.',
      'open', 1, ?, ?)`)
    .bind(dependencies.createId(), runId, job.rule_version, SYSTEM_ACTOR,
      job.job_key, key, now, now).run()
}

async function latestAttempt(
  db: D1Database,
  lifecycleId: string,
  termDueAt: string,
) {
  return db.prepare(`SELECT id, attempt_number, state, attempted_at, next_attempt_at
    FROM ordinary_account_notice_deliveries
    WHERE lifecycle_id = ? AND term_due_at = ?
    ORDER BY attempt_number DESC LIMIT 1`)
    .bind(lifecycleId, termDueAt).first<DeliveryAttempt>()
}

async function claimWarningAttempt(
  dependencies: LifecycleMaintenanceDependencies,
  candidate: LifecycleCandidate,
  now: string,
) {
  let attempt = await latestAttempt(dependencies.db, candidate.id, candidate.access_due_at)
  if (attempt?.state === 'sending') {
    const staleBefore = plusSeconds(now, -DELIVERY_CLAIM_STALE_SECONDS)
    const reclaimed = await dependencies.db.prepare(`UPDATE ordinary_account_notice_deliveries
      SET state = 'queued', outcome_category = 'timeout', next_attempt_at = ?, updated_at = ?
      WHERE id = ? AND state = 'sending' AND (attempted_at IS NULL OR attempted_at <= ?)`)
      .bind(now, now, attempt.id, staleBefore).run()
    if ((reclaimed.meta.changes ?? 0) !== 1) return null
    attempt = await latestAttempt(dependencies.db, candidate.id, candidate.access_due_at)
  }
  if (attempt?.state === 'accepted' || attempt?.state === 'permanent-failure'
    || attempt?.state === 'cancelled') return null
  if (attempt?.state === 'retry' && attempt.next_attempt_at && attempt.next_attempt_at > now) return null

  if (!attempt || attempt.state === 'retry') {
    const attemptNumber = (attempt?.attempt_number ?? 0) + 1
    if (attemptNumber > MAX_DELIVERY_ATTEMPTS) return null
    const id = dependencies.createId()
    const attemptKey = `ordinary-account-warning:${candidate.id}:${candidate.access_due_at}:${attemptNumber}`
    const insert = dependencies.db.prepare(`INSERT OR IGNORE INTO ordinary_account_notice_deliveries
      (id, lifecycle_id, term_due_at, attempt_number, state, idempotency_key,
       next_attempt_at, created_at, updated_at)
      SELECT ?, id, access_due_at, ?, 'queued', ?, ?, ?, ?
      FROM ordinary_account_lifecycles
      WHERE id = ? AND access_due_at = ? AND confirmed_delivery_at IS NULL
        AND notice_open_at <= ? AND access_due_at > ?
        AND (? IS NULL OR EXISTS (SELECT 1 FROM ordinary_account_notice_deliveries prior
          WHERE prior.id = ? AND prior.state = 'cancelled'
            AND prior.outcome_category IN ('transient', 'timeout')))`)
      .bind(id, attemptNumber, attemptKey, now, now, now,
        candidate.id, candidate.access_due_at, now, now, attempt?.id ?? null, attempt?.id ?? null)
    if (attempt?.state === 'retry') {
      await dependencies.db.batch([
        dependencies.db.prepare(`UPDATE ordinary_account_notice_deliveries
          SET state = 'cancelled', next_attempt_at = NULL, updated_at = ?
          WHERE id = ? AND state = 'retry' AND next_attempt_at <= ?`)
          .bind(now, attempt.id, now),
        insert,
      ])
    } else {
      await insert.run()
    }
    attempt = await latestAttempt(dependencies.db, candidate.id, candidate.access_due_at)
  }
  if (!attempt || attempt.state !== 'queued') return null
  const claim = await dependencies.db.prepare(`UPDATE ordinary_account_notice_deliveries
    SET state = 'sending', attempted_at = ?, updated_at = ?
    WHERE id = ? AND state = 'queued'`)
    .bind(now, now, attempt.id).run()
  return (claim.meta.changes ?? 0) === 1 ? attempt : null
}

async function sendWarning(
  dependencies: LifecycleMaintenanceDependencies,
  runId: string,
  job: LifecycleJob,
  candidate: LifecycleCandidate,
  now: string,
) {
  const attempt = await claimWarningAttempt(dependencies, candidate, now)
  if (!attempt) return { applied: 0, failed: 0, subrequests: 0, nextDueAt: undefined }
  const user = await dependencies.db.prepare(`SELECT email FROM "user" WHERE id = ?`)
    .bind(candidate.auth_user_id).first<{ email: string }>()
  const configuration = dependencies.ordinaryAccountLifecycle
  if (!user || !configuration) {
    await dependencies.db.prepare(`UPDATE ordinary_account_notice_deliveries SET
      state = 'permanent-failure', outcome_category = 'rejected', next_attempt_at = NULL, updated_at = ?
      WHERE id = ? AND state = 'sending'`).bind(now, attempt.id).run()
    await recordPermanentFailureAlert(dependencies, runId, job, candidate.id, now)
    return { applied: 1, failed: 1, subrequests: 0, nextDueAt: undefined }
  }

  const providerKey = await stableProviderKey(candidate.id, candidate.access_due_at)
  const fingerprint = await sha256(providerKey)
  try {
    const result = await deliverAuthEmail(dependencies.db, configuration.email, {
      authUserId: candidate.auth_user_id,
      to: user.email,
      url: configuration.accountUrl,
      purpose: 'renewal-warning',
      idempotencyKey: providerKey,
    }, dependencies.fetch)
    const acceptedAt = dependencies.now().toISOString()
    const deletionDueAt = deletionDueFromConfirmedWarning(acceptedAt)
    await dependencies.db.batch([
      dependencies.db.prepare(`UPDATE ordinary_account_notice_deliveries SET state = 'accepted',
        provider_request_fingerprint = ?, outcome_category = 'accepted', accepted_at = ?,
        next_attempt_at = NULL, updated_at = ? WHERE id = ? AND state = 'sending'
          AND EXISTS (SELECT 1 FROM ordinary_account_lifecycles lifecycle
          WHERE lifecycle.id = ? AND lifecycle.access_due_at = ?
              AND lifecycle.confirmed_delivery_at IS NULL AND lifecycle.access_due_at > ?
              AND lifecycle.version = ?)`)
        .bind(result.providerRequestFingerprint ?? fingerprint, acceptedAt, acceptedAt,
          attempt.id, candidate.id, candidate.access_due_at, acceptedAt, candidate.version),
      dependencies.db.prepare(`UPDATE ordinary_account_lifecycles SET state = 'renewal-notice',
        confirmed_delivery_at = ?, deletion_due_at = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND access_due_at = ? AND confirmed_delivery_at IS NULL
          AND access_due_at > ? AND version = ?`)
        .bind(acceptedAt, deletionDueAt, acceptedAt, candidate.id,
          candidate.access_due_at, acceptedAt, candidate.version),
      dependencies.db.prepare(`UPDATE ordinary_account_notice_deliveries
        SET state = 'cancelled', outcome_category = 'cancelled', next_attempt_at = NULL,
          updated_at = ? WHERE id = ? AND state = 'sending'`)
        .bind(acceptedAt, attempt.id),
      dependencies.db.prepare(`INSERT OR IGNORE INTO ordinary_account_lifecycle_events
        (id, lifecycle_id, event_type, idempotency_key, event_at, prior_state,
         resulting_state, due_at, actor_label)
        SELECT ?, id, 'notice-accepted', ?, ?, 'active', 'renewal-notice', access_due_at, ?
        FROM ordinary_account_lifecycles
        WHERE id = ? AND access_due_at = ? AND confirmed_delivery_at = ?`)
        .bind(dependencies.createId(), `ordinary-account-lifecycle-v1:notice-accepted:${candidate.id}:${candidate.access_due_at}`,
          acceptedAt, SYSTEM_ACTOR, candidate.id, candidate.access_due_at, acceptedAt),
    ])
    return {
      applied: 1,
      failed: 0,
      subrequests: configuration.email.mode === 'resend' ? 1 : 0,
      nextDueAt: undefined,
    }
  } catch (error) {
    const failure = error instanceof EmailDeliveryError ? error : new EmailDeliveryError('transient')
    const failureAt = dependencies.now().toISOString()
    const permanent = !failure.retryable || attempt.attempt_number >= MAX_DELIVERY_ATTEMPTS
    const nextAttemptAt = permanent
      ? null
      : plusSeconds(failureAt, RETRY_SECONDS[attempt.attempt_number - 1] ?? 21_600)
    await dependencies.db.prepare(`UPDATE ordinary_account_notice_deliveries SET state = ?,
      provider_request_fingerprint = ?, outcome_category = ?, next_attempt_at = ?, updated_at = ?
      WHERE id = ? AND state = 'sending'`)
      .bind(permanent ? 'permanent-failure' : 'retry', fingerprint,
        failure.category, nextAttemptAt, failureAt, attempt.id).run()
    if (permanent) await recordPermanentFailureAlert(dependencies, runId, job, candidate.id, failureAt)
    return {
      applied: 1,
      failed: 1,
      subrequests: configuration.email.mode === 'resend' ? 1 : 0,
      nextDueAt: nextAttemptAt ?? undefined,
    }
  }
}

export async function runOrdinaryAccountLifecycleMaintenance(
  dependencies: LifecycleMaintenanceDependencies,
  runId: string,
  job: LifecycleJob,
  now: string,
): Promise<OrdinaryLifecycleMaintenanceOutcome> {
  const outcome: OrdinaryLifecycleMaintenanceOutcome = {
    actionsApplied: 0,
    failedTasks: 0,
    outboundSubrequests: 0,
    fetchedBytes: 0,
  }
  let remaining = job.batch_size

  const notices = await dependencies.db.prepare(`SELECT id, auth_user_id, access_due_at, notice_open_at, version
    FROM ordinary_account_lifecycles
    WHERE state = 'active' AND confirmed_delivery_at IS NULL
      AND notice_open_at <= ? AND access_due_at > ?
    ORDER BY notice_open_at, id LIMIT ?`).bind(now, now, remaining).all<LifecycleCandidate>()
  for (const candidate of notices.results) {
    const sent = await sendWarning(dependencies, runId, job, candidate, now)
    outcome.actionsApplied += sent.applied
    outcome.failedTasks += sent.failed
    outcome.outboundSubrequests += sent.subrequests
    if (sent.nextDueAt && (!outcome.nextDueAt || sent.nextDueAt < outcome.nextDueAt)) {
      outcome.nextDueAt = sent.nextDueAt
    }
    if (sent.applied > 0) remaining -= 1
    if (remaining <= 0) return finalizeOutcome(dependencies, outcome)
  }

  const expirations = await dependencies.db.prepare(`SELECT auth_user_id
    FROM ordinary_account_lifecycles
    WHERE state IN ('active', 'renewal-notice') AND access_due_at <= ?
    ORDER BY access_due_at, id LIMIT ?`).bind(now, remaining).all<{ auth_user_id: string }>()
  for (const candidate of expirations.results) {
    const status = await getOrdinaryAccountLifecycleStatus(dependencies.db, candidate.auth_user_id, now)
    if (status?.state === 'expired') {
      outcome.actionsApplied += 1
      remaining -= 1
    }
    if (remaining <= 0) return finalizeOutcome(dependencies, outcome)
  }

  const deletions = await dependencies.db.prepare(`SELECT auth_user_id
    FROM ordinary_account_lifecycles
    WHERE state = 'expired' AND deletion_due_at IS NOT NULL AND deletion_due_at <= ?
    ORDER BY deletion_due_at, id LIMIT ?`).bind(now, remaining).all<{ auth_user_id: string }>()
  for (const candidate of deletions.results) {
    if (await deleteDueOrdinaryAccount(dependencies.db, candidate.auth_user_id, runId, now)) {
      outcome.actionsApplied += 1
      remaining -= 1
    }
    if (remaining <= 0) break
  }
  return finalizeOutcome(dependencies, outcome)
}
