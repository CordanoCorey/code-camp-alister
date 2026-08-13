import { SourceTargetPolicyError, validateSourceTarget } from '../shared/maintenance-policy.ts'
import type { AuthEmailConfiguration } from './auth-email.ts'
import { runOrdinaryAccountLifecycleMaintenance } from './ordinary-account-lifecycle-maintenance.ts'

export type MaintenanceTrigger = 'cron' | 'operator-run-now' | 'local-test'

export type MaintenanceDependencies = {
  db: D1Database
  now: () => Date
  createId: () => string
  fetch: typeof fetch
  ordinaryAccountLifecycle?: {
    accountUrl: string
    email: AuthEmailConfiguration
  }
}

export type MaintenanceOutcome = {
  runId: string
  status: 'succeeded' | 'partial' | 'failed'
  jobsClaimed: number
  actionsApplied: number
  failedTasks: number
  outboundSubrequests: number
  fetchedBytes: number
}

type JobExecution = Omit<MaintenanceOutcome, 'runId' | 'status' | 'jobsClaimed'> & {
  nextDueAt?: string
}

type MaintenanceOptions = {
  trigger: MaintenanceTrigger
  operatorTenureId?: number
  maximumJobs?: number
}

type JobRow = {
  job_key: string
  rule_version: string
  interval_seconds: number
  batch_size: number
  next_due_at: string
}

type ListingLifecycleRow = {
  outpost_id: string
  state: 'verified' | 'grace'
  next_verification_due_at: string
  grace_ends_at: string
}

type ProposalRetentionRow = {
  id: string
  state: string
  retention_deadline: string
  had_reply_email: number
  had_private_notes: number
}

type EventCompletionRow = {
  content_id: string
  version: number
  lifecycle_status: 'scheduled' | 'accepting-registration' | 'confirmed' | 'full'
  start_date: string
  end_date: string | null
  end_time: string | null
  time_zone: string
  all_day: number
}

type ExpiredTransferRow = { id: string; predecessor_tenure_number: number; expires_at: string }
type ExpiredReauthenticationRow = {
  token_hash: string
  tenure_number: number
  intended_action: string
  created_at: string
  expires_at: string
}

type SourceMonitorRow = {
  source_document_id: string
  url: string
  canonical_hostname: string
  source_url_fingerprint: string
  check_mode: 'availability-metadata' | 'bounded-fingerprint'
  interval_seconds: number
  maximum_response_bytes: number
  maximum_redirects: number
  last_success_at: string | null
  consecutive_failures: number
  etag_hash: string | null
  last_modified_hash: string | null
  etag_value: string | null
  last_modified_value: string | null
  content_fingerprint: string | null
  redirect_fingerprint: string | null
}

type SourceFetchResult = {
  statusClass: 'not-modified' | '2xx'
  redirectOutcome: 'none' | 'same-host'
  mimeFamily: 'none' | 'html' | 'text' | 'pdf' | 'feed'
  bytes: Uint8Array
  etag: string | null
  lastModified: string | null
  redirectFingerprint: string | null
  subrequests: number
}

type SourceFailureCategory = 'timeout' | 'dns' | 'tls' | 'unauthorized' | 'forbidden'
  | 'not-found' | 'rate-limited' | 'server-error' | 'oversized' | 'unsupported-mime'
  | 'redirect-blocked' | 'challenge' | 'network'

class SourceCheckFailure extends Error {
  readonly category: SourceFailureCategory
  readonly statusClass: '3xx' | '4xx' | '5xx' | 'network'
  readonly redirectOutcome: 'none' | 'same-host' | 'blocked-cross-host' | 'blocked-invalid' | 'redirect-limit'
  readonly subrequests: number
  readonly byteCount: number

  constructor(
    category: SourceFailureCategory,
    statusClass: '3xx' | '4xx' | '5xx' | 'network',
    redirectOutcome: 'none' | 'same-host' | 'blocked-cross-host' | 'blocked-invalid' | 'redirect-limit',
    subrequests: number,
    byteCount = 0,
  ) {
    super(category)
    this.category = category
    this.statusClass = statusClass
    this.redirectOutcome = redirectOutcome
    this.subrequests = subrequests
    this.byteCount = byteCount
  }
}

const DISPATCHER_RULE_VERSION = 'maintenance-dispatcher-v1'
const JOB_LEASE_SECONDS = 360
const SOURCE_LEASE_SECONDS = 330
const SOURCE_JOB_TIME_BUDGET_MS = 300_000
const SOURCE_JOB_SUBREQUEST_BUDGET = 32
const SOURCE_JOB_BYTE_BUDGET = 16 * 262_144
const SYSTEM_LABEL_PREFIX = 'Automation: '
const SOURCE_TIMEOUT_MS = 8_000
const SOURCE_FAILURE_THRESHOLD = 3

function plusSeconds(date: Date, seconds: number) {
  return new Date(date.valueOf() + seconds * 1_000).toISOString()
}

function emptyJobExecution(): JobExecution {
  return { actionsApplied: 0, failedTasks: 0, outboundSubrequests: 0, fetchedBytes: 0 }
}

async function sha256Bytes(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function safeValidator(value: string | null, maximum: number) {
  const trimmed = value?.trim() ?? ''
  return trimmed && trimmed.length <= maximum && !/[\r\n]/.test(trimmed) ? trimmed : null
}

function mimeFamily(value: string | null): SourceFetchResult['mimeFamily'] | 'other' {
  const mime = value?.split(';')[0].trim().toLowerCase() ?? ''
  if (!mime) return 'other'
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  if (mime === 'text/plain' || mime === 'text/csv') return 'text'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'application/rss+xml' || mime === 'application/atom+xml'
    || mime === 'application/xml' || mime === 'text/xml') return 'feed'
  return 'other'
}

function sourceDurationBucket(milliseconds: number) {
  if (milliseconds < 250) return 'under-250ms'
  if (milliseconds < 1_000) return 'under-1s'
  if (milliseconds < 3_000) return 'under-3s'
  if (milliseconds < 10_000) return 'under-10s'
  return 'timeout'
}

function validateFetchTarget(value: string, approvedHostname: string) {
  try {
    return validateSourceTarget(value, approvedHostname).url
  } catch (error) {
    throw new SourceCheckFailure('redirect-blocked', '3xx',
      error instanceof SourceTargetPolicyError && error.failure === 'cross-host'
        ? 'blocked-cross-host' : 'blocked-invalid', 0)
  }
}

async function readBoundedBody(response: Response, maximumBytes: number) {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel()
    throw new SourceCheckFailure('oversized', '4xx', 'none', 0)
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    total += next.value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      throw new SourceCheckFailure('oversized', '4xx', 'none', 0, Math.min(total, maximumBytes))
    }
    chunks.push(next.value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}

async function fetchApprovedSource(dependencies: MaintenanceDependencies, monitor: SourceMonitorRow): Promise<SourceFetchResult> {
  let target = validateFetchTarget(monitor.url, monitor.canonical_hostname)
  let redirects = 0
  let subrequests = 0
  let redirectFingerprint: string | null = null
  while (true) {
    const headers = new Headers({ accept: monitor.check_mode === 'bounded-fingerprint'
      ? 'text/html,text/plain,application/pdf,application/rss+xml,application/atom+xml,application/xml;q=0.9'
      : '*/*' })
    if (monitor.etag_value) headers.set('if-none-match', monitor.etag_value)
    if (monitor.last_modified_value) headers.set('if-modified-since', monitor.last_modified_value)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS)
    let response: Response
    try {
      subrequests += 1
      response = await dependencies.fetch(target.toString(), {
        method: monitor.check_mode === 'availability-metadata' ? 'HEAD' : 'GET',
        redirect: 'manual', headers, signal: controller.signal,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      const category: SourceFailureCategory = controller.signal.aborted
        || (error instanceof Error && error.name === 'AbortError') ? 'timeout'
        : message.includes('dns') || message.includes('resolve') ? 'dns'
          : message.includes('tls') || message.includes('certificate') ? 'tls' : 'network'
      throw new SourceCheckFailure(category, 'network', redirects ? 'same-host' : 'none', subrequests)
    } finally {
      clearTimeout(timeout)
    }
    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new SourceCheckFailure('redirect-blocked', '3xx', 'blocked-invalid', subrequests)
      if (redirects >= monitor.maximum_redirects) {
        throw new SourceCheckFailure('redirect-blocked', '3xx', 'redirect-limit', subrequests)
      }
      let next: URL
      try { next = validateFetchTarget(new URL(location, target).toString(), monitor.canonical_hostname) } catch (error) {
        if (error instanceof SourceCheckFailure) {
          throw new SourceCheckFailure(error.category, error.statusClass, error.redirectOutcome, subrequests)
        }
        throw error
      }
      redirects += 1
      redirectFingerprint = await sha256Bytes(next.toString())
      target = next
      continue
    }
    if (response.status === 304) {
      await response.body?.cancel()
      return { statusClass: 'not-modified', redirectOutcome: redirects ? 'same-host' : 'none',
        mimeFamily: 'none', bytes: new Uint8Array(), etag: monitor.etag_value,
        lastModified: monitor.last_modified_value, redirectFingerprint, subrequests }
    }
    if (response.status === 401 || response.status === 403 || response.status === 404
      || response.status === 429 || response.status >= 500 || response.status < 200) {
      await response.body?.cancel()
      const category: SourceFailureCategory = response.status === 401 ? 'unauthorized'
        : response.status === 403 ? 'forbidden'
          : response.status === 404 ? 'not-found'
            : response.status === 429 ? 'rate-limited'
              : response.status >= 500 ? 'server-error' : 'network'
      throw new SourceCheckFailure(category, response.status >= 500 ? '5xx' : '4xx',
        redirects ? 'same-host' : 'none', subrequests)
    }
    const family = mimeFamily(response.headers.get('content-type'))
    if (family === 'other') {
      await response.body?.cancel()
      throw new SourceCheckFailure('unsupported-mime', '4xx', redirects ? 'same-host' : 'none', subrequests)
    }
    let bytes: Uint8Array
    try {
      bytes = monitor.check_mode === 'availability-metadata'
        ? (await response.body?.cancel(), new Uint8Array())
        : await readBoundedBody(response, monitor.maximum_response_bytes)
    } catch (error) {
      if (error instanceof SourceCheckFailure) {
        throw new SourceCheckFailure(error.category, error.statusClass,
          redirects ? 'same-host' : error.redirectOutcome, subrequests, error.byteCount)
      }
      throw error
    }
    if ((family === 'html' || family === 'text') && bytes.length > 0) {
      const sample = new TextDecoder().decode(bytes.slice(0, 2_048)).toLowerCase()
      if (sample.includes('cf-chl-') || sample.includes('attention required! | cloudflare')) {
        throw new SourceCheckFailure('challenge', '4xx', redirects ? 'same-host' : 'none', subrequests, bytes.length)
      }
    }
    return { statusClass: '2xx', redirectOutcome: redirects ? 'same-host' : 'none',
      mimeFamily: family, bytes, etag: safeValidator(response.headers.get('etag'), 256),
      lastModified: safeValidator(response.headers.get('last-modified'), 128),
      redirectFingerprint, subrequests }
  }
}

async function runListingLifecycle(
  dependencies: MaintenanceDependencies,
  runId: string,
  job: JobRow,
  now: string,
) {
  const rows = await dependencies.db.prepare(`SELECT outpost_id, state, next_verification_due_at, grace_ends_at
    FROM outpost_lifecycle
    WHERE state IN ('verified', 'grace')
      AND ((state = 'verified' AND next_verification_due_at <= ?) OR grace_ends_at < ?)
    ORDER BY CASE WHEN grace_ends_at < ? THEN grace_ends_at ELSE next_verification_due_at END, outpost_id
    LIMIT ?`).bind(now, now, now, job.batch_size).all<ListingLifecycleRow>()
  let applied = 0
  for (const row of rows.results) {
    const expires = row.grace_ends_at < now
    const nextState = expires ? 'verification-expired' : 'grace'
    if (row.state === nextState) continue
    const action = expires ? 'listing-verification-expired' : 'listing-entered-grace'
    const boundary = expires ? row.grace_ends_at : row.next_verification_due_at
    const idempotencyKey = `${job.rule_version}:${row.outpost_id}:${action}:${boundary}`
    const reason = expires
      ? 'The persisted 30-day Listing Verification grace period ended.'
      : 'The persisted annual Listing Verification due time was reached.'
    const actorLabel = `${SYSTEM_LABEL_PREFIX}${job.rule_version}`
    await dependencies.db.batch([
      dependencies.db.prepare(`UPDATE outpost_lifecycle SET state = ?, version = version + 1, updated_at = ?
        WHERE outpost_id = ? AND state IN ('verified', 'grace')
          AND NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(nextState, now, row.outpost_id, idempotencyKey),
      dependencies.db.prepare(`INSERT INTO content_audit_events
        (content_id, stable_scope_id, action, actor_label, before_json, after_json, reason, created_at,
         automation_run_id, automation_rule_version)
        SELECT ?, ?, ?, ?, json_object('state', ?), json_object('state', ?), ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(row.outpost_id, row.outpost_id,
          expires ? 'Listing Verification expired' : 'Listing Verification entered grace', actorLabel,
          row.state, nextState, reason, now, runId, job.rule_version, idempotencyKey),
      dependencies.db.prepare(`INSERT OR IGNORE INTO system_maintenance_events
        (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
         action, reason, before_state_json, after_state_json, actor_label, created_at)
        VALUES (?, ?, ?, ?, ?, 'outpost', ?, ?, ?, json_object('state', ?), json_object('state', ?), ?, ?)`)
        .bind(dependencies.createId(), runId, job.job_key, job.rule_version, idempotencyKey,
          row.outpost_id, action, reason, row.state, nextState, actorLabel, now),
    ])
    applied += 1
  }
  return applied
}

async function runProposalRetention(
  dependencies: MaintenanceDependencies,
  runId: string,
  job: JobRow,
  now: string,
) {
  const rows = await dependencies.db.prepare(`SELECT id, state, retention_deadline,
      CASE WHEN reply_email IS NULL THEN 0 ELSE 1 END had_reply_email,
      CASE WHEN private_notes IS NULL THEN 0 ELSE 1 END had_private_notes
    FROM directory_submissions
    WHERE pii_scrubbed_at IS NULL AND retention_deadline <= ?
      AND state NOT IN ('duplicate', 'converted', 'rejected', 'withdrawn', 'pii-scrubbed')
    ORDER BY retention_deadline, id LIMIT ?`).bind(now, job.batch_size).all<ProposalRetentionRow>()
  let applied = 0
  for (const row of rows.results) {
    const idempotencyKey = `${job.rule_version}:${row.id}:pii-scrubbed:${row.retention_deadline}`
    const reason = 'The six-month private proposal retention deadline was reached.'
    const actorLabel = `${SYSTEM_LABEL_PREFIX}${job.rule_version}`
    const before = JSON.stringify({
      state: row.state,
      hadReplyEmail: row.had_reply_email === 1,
      hadPrivateNotes: row.had_private_notes === 1,
    })
    const after = JSON.stringify({ state: 'pii-scrubbed', personalDataRetained: false })
    await dependencies.db.batch([
      dependencies.db.prepare(`UPDATE directory_submissions SET reply_email = NULL, private_notes = NULL,
        state = 'pii-scrubbed', disposed_at = ?, pii_scrubbed_at = ?, updated_at = ?
        WHERE id = ? AND pii_scrubbed_at IS NULL AND retention_deadline <= ?
          AND NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(now, now, now, row.id, now, idempotencyKey),
      dependencies.db.prepare(`INSERT OR IGNORE INTO system_maintenance_events
        (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
         action, reason, before_state_json, after_state_json, actor_label, created_at)
        VALUES (?, ?, ?, ?, ?, 'directory-submission', ?, 'proposal-personal-data-scrubbed',
          ?, ?, ?, ?, ?)`)
        .bind(dependencies.createId(), runId, job.job_key, job.rule_version, idempotencyKey,
          row.id, reason, before, after, actorLabel, now),
    ])
    applied += 1
  }
  return applied
}

function localDateTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? ''
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}:${part('second')}` }
}

function eventEndedAt(row: EventCompletionRow, now: Date) {
  const local = localDateTime(now, row.time_zone)
  const endDate = row.end_date ?? row.start_date
  if (local.date !== endDate) return local.date > endDate
  if (row.all_day === 1 || row.end_time === null) return false
  return local.time >= `${row.end_time}:00`
}

async function runEventCompletion(
  dependencies: MaintenanceDependencies,
  runId: string,
  job: JobRow,
  nowDate: Date,
) {
  const now = nowDate.toISOString()
  const tomorrow = new Date(nowDate.valueOf() + 24 * 60 * 60 * 1_000).toISOString().slice(0, 10)
  const rows = await dependencies.db.prepare(`SELECT occurrence.content_id, content.version,
      occurrence.lifecycle_status, occurrence.start_date, occurrence.end_date, occurrence.end_time,
      occurrence.time_zone, occurrence.all_day
    FROM event_occurrences occurrence JOIN content_records content ON content.id = occurrence.content_id
    WHERE content.status = 'published'
      AND occurrence.lifecycle_status IN ('scheduled', 'accepting-registration', 'confirmed', 'full')
      AND COALESCE(occurrence.end_date, occurrence.start_date) <= ?
    ORDER BY COALESCE(occurrence.end_date, occurrence.start_date), occurrence.content_id
    LIMIT ?`).bind(tomorrow, job.batch_size).all<EventCompletionRow>()
  let applied = 0
  for (const row of rows.results) {
    if (!eventEndedAt(row, nowDate)) continue
    const endDate = row.end_date ?? row.start_date
    const boundary = `${endDate}:${row.all_day === 1 || row.end_time === null ? 'end-of-day' : row.end_time}:${row.time_zone}`
    const idempotencyKey = `${job.rule_version}:${row.content_id}:completed:${boundary}`
    const actorLabel = `${SYSTEM_LABEL_PREFIX}${job.rule_version}`
    const reason = 'The stored organizer-local Event end boundary passed.'
    const nextVersion = row.version + 1
    await dependencies.db.batch([
      dependencies.db.prepare(`UPDATE event_occurrences SET lifecycle_status = 'completed'
        WHERE content_id = ? AND lifecycle_status IN ('scheduled', 'accepting-registration', 'confirmed', 'full')
          AND NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(row.content_id, idempotencyKey),
      dependencies.db.prepare(`UPDATE content_records SET version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
          AND NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(now, row.content_id, row.version, idempotencyKey),
      dependencies.db.prepare(`INSERT INTO content_revisions
        (id, content_id, version, status, snapshot_json, actor_label, reason, created_at,
         automation_run_id, automation_rule_version)
        SELECT ?, ?, ?, 'published',
          json_set(revision.snapshot_json, '$.details.lifecycleStatus', 'completed', '$.updatedAt', ?, '$.version', ?),
          ?, ?, ?, ?, ? FROM content_revisions revision
        WHERE revision.content_id = ? AND revision.version = ?
          AND NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(`${row.content_id}:${nextVersion}`, row.content_id, nextVersion, now, nextVersion,
          actorLabel, reason, now, runId, job.rule_version, row.content_id, row.version, idempotencyKey),
      dependencies.db.prepare(`INSERT INTO content_audit_events
        (content_id, stable_scope_id, action, actor_label, before_json, after_json, reason, created_at,
         automation_run_id, automation_rule_version)
        SELECT ?, ?, 'Event completed', ?, json_object('lifecycleStatus', ?),
          json_object('lifecycleStatus', 'completed'), ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(row.content_id, row.content_id, actorLabel, row.lifecycle_status, reason, now,
          runId, job.rule_version, idempotencyKey),
      dependencies.db.prepare(`INSERT OR IGNORE INTO system_maintenance_events
        (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
         action, reason, before_state_json, after_state_json, actor_label, created_at)
        VALUES (?, ?, ?, ?, ?, 'event', ?, 'event-completed', ?, json_object('lifecycleStatus', ?),
          json_object('lifecycleStatus', 'completed'), ?, ?)`)
        .bind(dependencies.createId(), runId, job.job_key, job.rule_version, idempotencyKey,
          row.content_id, reason, row.lifecycle_status, actorLabel, now),
    ])
    applied += 1
  }
  return applied
}

async function runSecurityIntentCleanup(
  dependencies: MaintenanceDependencies,
  runId: string,
  job: JobRow,
  now: string,
) {
  const transfers = await dependencies.db.prepare(`SELECT id, predecessor_tenure_number, expires_at
    FROM operator_transfers WHERE state = 'pending' AND expires_at <= ?
    ORDER BY expires_at, id LIMIT ?`).bind(now, job.batch_size).all<ExpiredTransferRow>()
  let applied = 0
  const actorLabel = `${SYSTEM_LABEL_PREFIX}${job.rule_version}`
  for (const transfer of transfers.results) {
    const idempotencyKey = `${job.rule_version}:transfer:${transfer.id}:expired:${transfer.expires_at}`
    const reason = 'The pending Operator Transfer acceptance window ended.'
    await dependencies.db.batch([
      dependencies.db.prepare(`UPDATE operator_transfers SET state = 'expired', successor_display_name = NULL,
        successor_email = NULL, successor_current_outpost_id = NULL, acceptance_token_hash = NULL,
        expired_at = ? WHERE id = ? AND state = 'pending' AND expires_at <= ?
          AND NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(now, transfer.id, now, idempotencyKey),
      dependencies.db.prepare(`INSERT OR IGNORE INTO system_maintenance_events
        (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
         action, reason, before_state_json, after_state_json, actor_label, created_at)
        VALUES (?, ?, ?, ?, ?, 'operator-transfer', ?, 'operator-transfer-expired', ?,
          json_object('state', 'pending'), json_object('state', 'expired', 'privateAcceptanceDataRetained', 0), ?, ?)`)
        .bind(dependencies.createId(), runId, job.job_key, job.rule_version, idempotencyKey,
          transfer.id, reason, actorLabel, now),
    ])
    applied += 1
  }

  const remaining = Math.max(job.batch_size - transfers.results.length, 0)
  if (remaining === 0) return applied
  const intents = await dependencies.db.prepare(`SELECT token_hash, tenure_number, intended_action, created_at, expires_at
    FROM operator_reauthentication_intents WHERE consumed_at IS NULL AND expires_at <= ?
    ORDER BY expires_at, tenure_number, intended_action LIMIT ?`)
    .bind(now, remaining).all<ExpiredReauthenticationRow>()
  for (const intent of intents.results) {
    const targetId = `tenure-${intent.tenure_number}:${intent.intended_action}:${intent.created_at}`
    const idempotencyKey = `${job.rule_version}:reauthentication:${targetId}:expired:${intent.expires_at}`
    const reason = 'The short-lived Operator reauthentication intent expired.'
    await dependencies.db.batch([
      dependencies.db.prepare(`DELETE FROM operator_reauthentication_intents WHERE token_hash = ?
        AND consumed_at IS NULL AND expires_at <= ?
        AND NOT EXISTS (SELECT 1 FROM system_maintenance_events WHERE idempotency_key = ?)`)
        .bind(intent.token_hash, now, idempotencyKey),
      dependencies.db.prepare(`INSERT OR IGNORE INTO system_maintenance_events
        (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
         action, reason, before_state_json, after_state_json, actor_label, created_at)
        VALUES (?, ?, ?, ?, ?, 'reauthentication-intent', ?, 'reauthentication-intent-expired', ?,
          json_object('state', 'pending'), json_object('state', 'expired', 'credentialRetained', 0), ?, ?)`)
        .bind(dependencies.createId(), runId, job.job_key, job.rule_version, idempotencyKey,
          targetId, reason, actorLabel, now),
    ])
    applied += 1
  }
  return applied
}

function sourceJitterSeconds(sourceDocumentId: string, intervalSeconds: number) {
  const spread = Math.max(Math.floor(intervalSeconds * 0.05), 1)
  return [...sourceDocumentId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % spread
}

function nestedValue(value: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => (
    current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : null
  ), value)
}

async function affectedSourceValues(db: D1Database, sourceDocumentId: string) {
  const [rows, count] = await Promise.all([
    db.prepare(`SELECT provenance.content_id, provenance.field_path,
        content.title, content.summary, content.status, content.verified_at, content.details_json
      FROM field_provenance provenance JOIN content_records content ON content.id = provenance.content_id
      WHERE provenance.source_document_id = ?
      ORDER BY provenance.content_id, provenance.field_path LIMIT 100`)
      .bind(sourceDocumentId).all<{
        content_id: string; field_path: string; title: string; summary: string
        status: string; verified_at: string | null; details_json: string
      }>(),
    db.prepare('SELECT COUNT(*) count FROM field_provenance WHERE source_document_id = ?')
      .bind(sourceDocumentId).first<{ count: number }>(),
  ])
  const affectedFields: Array<{ contentId: string; fieldPath: string }> = []
  const priorValues: Array<{ contentId: string; fieldPath: string; value: unknown }> = []
  for (const row of rows.results) {
    const details = JSON.parse(row.details_json) as Record<string, unknown>
    const common = {
      title: row.title, summary: row.summary, status: row.status, verifiedAt: row.verified_at, details,
    }
    const value = row.status !== 'published' ? null
      : row.field_path === 'record' ? common
        : row.field_path in common ? common[row.field_path as keyof typeof common]
          : nestedValue(details, row.field_path.replace(/^details\./, ''))
    const nextPriorValue = { contentId: row.content_id, fieldPath: row.field_path, value: value ?? null }
    if (JSON.stringify([...priorValues, nextPriorValue]).length > 30_000) break
    affectedFields.push({ contentId: row.content_id, fieldPath: row.field_path })
    priorValues.push(nextPriorValue)
  }
  const affectedFieldCount = Number(count?.count ?? 0)
  return { affectedFields, priorValues, affectedFieldCount,
    truncated: affectedFieldCount > affectedFields.length }
}

async function recordSourceAlert(
  dependencies: MaintenanceDependencies,
  runId: string,
  job: JobRow,
  monitor: SourceMonitorRow,
  now: string,
  category: SourceFailureCategory,
) {
  await recordAutomationAlert(dependencies, {
    runId, job, alertType: 'repeated-failure', severity: 'warning',
    sourceDocumentId: monitor.source_document_id,
    coalescingKey: `source-monitor-failure:${monitor.source_document_id}`,
    summary: `Approved Source Monitor reached the failure threshold (${category}).`, now,
  })
}

async function recordAutomationAlert(
  dependencies: MaintenanceDependencies,
  input: {
    runId: string
    job: Pick<JobRow, 'job_key' | 'rule_version'>
    alertType: 'repeated-failure' | 'scheduler-overdue' | 'circuit-open' | 'invariant-failure' | 'backlog-threshold'
    severity: 'warning' | 'critical'
    sourceDocumentId?: string
    coalescingKey: string
    summary: string
    now: string
  },
) {
  const actorLabel = `${SYSTEM_LABEL_PREFIX}${input.job.rule_version}`
  const existing = await dependencies.db.prepare(`SELECT id FROM automation_alerts
    WHERE coalescing_key = ? AND status IN ('open', 'acknowledged')`)
    .bind(input.coalescingKey).first<{ id: string }>()
  if (existing) {
    await dependencies.db.prepare(`UPDATE automation_alerts SET occurrence_count = occurrence_count + 1,
      last_seen_at = ?, severity = CASE WHEN ? = 'critical' THEN 'critical' ELSE severity END,
      alert_type = CASE WHEN ? = 'critical' AND ? = 'circuit-open' THEN 'circuit-open' ELSE alert_type END,
      summary = CASE WHEN ? = 'critical' AND ? = 'circuit-open' THEN ? ELSE summary END,
      maintenance_run_id = ?, rule_version = ?, actor_label = ?
      WHERE id = ?`).bind(input.now, input.severity, input.severity, input.alertType,
        input.severity, input.alertType, input.summary, input.runId, input.job.rule_version,
        actorLabel, existing.id).run()
    return
  }
  await dependencies.db.prepare(`INSERT INTO automation_alerts
    (id, maintenance_run_id, rule_version, actor_label, alert_type, severity,
     job_key, source_document_id, coalescing_key, summary, status,
     first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`)
    .bind(dependencies.createId(), input.runId, input.job.rule_version, actorLabel,
      input.alertType, input.severity, input.job.job_key,
      input.sourceDocumentId ?? null, input.coalescingKey, input.summary, input.now, input.now).run()
}

async function runMaintenanceHistoryRetention(
  dependencies: MaintenanceDependencies,
  runId: string,
  job: JobRow,
  nowDate: Date,
) {
  const now = nowDate.toISOString()
  const runDetailCutoff = plusSeconds(nowDate, -90 * 86400)
  const observations = await dependencies.db.prepare(`SELECT observation.id,
      substr(observation.observed_at, 1, 10) aggregate_date
    FROM automated_source_observations observation
    WHERE observation.retained_until <= ?
      AND NOT EXISTS (SELECT 1 FROM automated_update_candidates candidate
        WHERE candidate.triggering_observation_id = observation.id)
    ORDER BY observation.retained_until, observation.id LIMIT ?`)
    .bind(now, job.batch_size).all<{ id: string; aggregate_date: string }>()
  const remaining = Math.max(job.batch_size - observations.results.length, 0)
  const oldRuns = remaining === 0 ? { results: [] as Array<{ id: string; aggregate_date: string }> }
    : await dependencies.db.prepare(`SELECT id, substr(started_at, 1, 10) aggregate_date
      FROM maintenance_runs WHERE status <> 'running' AND completed_at < ? AND outcome_json IS NOT NULL
      ORDER BY completed_at, id LIMIT ?`).bind(runDetailCutoff, remaining)
      .all<{ id: string; aggregate_date: string }>()
  if (observations.results.length === 0 && oldRuns.results.length === 0) return 0

  const aggregates = new Map<string, { observations: number; runs: number }>()
  for (const row of observations.results) {
    const value = aggregates.get(row.aggregate_date) ?? { observations: 0, runs: 0 }
    value.observations += 1
    aggregates.set(row.aggregate_date, value)
  }
  for (const row of oldRuns.results) {
    const value = aggregates.get(row.aggregate_date) ?? { observations: 0, runs: 0 }
    value.runs += 1
    aggregates.set(row.aggregate_date, value)
  }
  const statements = [...aggregates].map(([date, counts]) => dependencies.db.prepare(`INSERT INTO maintenance_daily_aggregates
    (aggregate_date, job_key, successful_runs, failed_runs, unchanged_observations,
     pruned_observations, pruned_run_details, updated_at)
    VALUES (?, ?, 0, 0, ?, ?, ?, ?)
    ON CONFLICT(aggregate_date, job_key) DO UPDATE SET
      unchanged_observations = unchanged_observations + excluded.unchanged_observations,
      pruned_observations = pruned_observations + excluded.pruned_observations,
      pruned_run_details = pruned_run_details + excluded.pruned_run_details,
      updated_at = excluded.updated_at`).bind(date, job.job_key, counts.observations,
      counts.observations, counts.runs, now))
  if (observations.results.length > 0) {
    const placeholders = observations.results.map(() => '?').join(', ')
    statements.push(dependencies.db.prepare(`DELETE FROM automated_source_observations
      WHERE id IN (${placeholders})`).bind(...observations.results.map((row) => row.id)))
  }
  if (oldRuns.results.length > 0) {
    const placeholders = oldRuns.results.map(() => '?').join(', ')
    statements.push(dependencies.db.prepare(`UPDATE maintenance_runs SET outcome_json = NULL
      WHERE id IN (${placeholders}) AND status <> 'running'`).bind(...oldRuns.results.map((row) => row.id)))
  }
  const batchFingerprint = await sha256Bytes([
    ...observations.results.map((row) => `observation:${row.id}`),
    ...oldRuns.results.map((row) => `run:${row.id}`),
  ].join('|'))
  const idempotencyKey = `${job.rule_version}:prune:${batchFingerprint}`
  const actorLabel = `${SYSTEM_LABEL_PREFIX}${job.rule_version}`
  statements.push(dependencies.db.prepare(`INSERT OR IGNORE INTO system_maintenance_events
    (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
     action, reason, before_state_json, after_state_json, actor_label, created_at)
    VALUES (?, ?, ?, ?, ?, 'maintenance-history', ?, 'routine-maintenance-detail-pruned',
      'The bounded retention window ended for routine maintenance detail.',
      json_object('expiredObservations', ?, 'expiredRunDetails', ?),
      json_object('aggregatedBeforePrune', 1), ?, ?)`)
    .bind(dependencies.createId(), runId, job.job_key, job.rule_version, idempotencyKey,
      batchFingerprint, observations.results.length, oldRuns.results.length, actorLabel, now))
  await dependencies.db.batch(statements)
  return observations.results.length + oldRuns.results.length
}

async function runSourceMonitoring(
  dependencies: MaintenanceDependencies,
  runId: string,
  job: JobRow,
  nowDate: Date,
): Promise<JobExecution> {
  const execution = emptyJobExecution()
  const now = nowDate.toISOString()
  const jobStartedAt = dependencies.now().valueOf()
  const monitors = await dependencies.db.prepare(`SELECT monitor.source_document_id, document.url,
      monitor.canonical_hostname, monitor.source_url_fingerprint, monitor.check_mode,
      monitor.interval_seconds, monitor.maximum_response_bytes, monitor.maximum_redirects,
      monitor.last_success_at, monitor.consecutive_failures, monitor.etag_hash,
      monitor.last_modified_hash, monitor.etag_value, monitor.last_modified_value,
      monitor.content_fingerprint, monitor.redirect_fingerprint
    FROM approved_source_monitors monitor JOIN source_documents document
      ON document.id = monitor.source_document_id
    WHERE monitor.enabled = 1 AND monitor.circuit_state = 'closed' AND monitor.next_due_at <= ?
      AND (monitor.backoff_until IS NULL OR monitor.backoff_until <= ?)
      AND (monitor.lease_expires_at IS NULL OR monitor.lease_expires_at <= ?)
    ORDER BY monitor.next_due_at, monitor.source_document_id LIMIT ?`)
    .bind(now, now, now, Math.min(job.batch_size, 16)).all<SourceMonitorRow>()

  for (const monitor of monitors.results) {
    if (dependencies.now().valueOf() - jobStartedAt >= SOURCE_JOB_TIME_BUDGET_MS
      || execution.outboundSubrequests >= SOURCE_JOB_SUBREQUEST_BUDGET
      || execution.fetchedBytes >= SOURCE_JOB_BYTE_BUDGET) break
    const claimed = await dependencies.db.prepare(`UPDATE approved_source_monitors
      SET lease_owner = ?, lease_expires_at = ?, last_attempt_at = ?, updated_at = ?
      WHERE source_document_id = ? AND enabled = 1 AND circuit_state = 'closed' AND next_due_at <= ?
        AND (backoff_until IS NULL OR backoff_until <= ?)
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`)
      .bind(runId, plusSeconds(nowDate, SOURCE_LEASE_SECONDS), now, now, monitor.source_document_id, now, now, now).run()
    if (Number(claimed.meta.changes ?? 0) !== 1) continue
    const observationId = dependencies.createId()
    const startedAt = dependencies.now().valueOf()
    try {
      if (await sha256Bytes(monitor.url) !== monitor.source_url_fingerprint) {
        throw new SourceCheckFailure('redirect-blocked', 'network', 'blocked-invalid', 0)
      }
      const fetched = await fetchApprovedSource(dependencies, monitor)
      execution.outboundSubrequests += fetched.subrequests
      execution.fetchedBytes += fetched.bytes.length
      const etagHash = fetched.etag ? await sha256Bytes(fetched.etag) : null
      const lastModifiedHash = fetched.lastModified ? await sha256Bytes(fetched.lastModified) : null
      const contentFingerprint = fetched.statusClass === 'not-modified'
        ? monitor.content_fingerprint
        : monitor.check_mode === 'bounded-fingerprint' ? await sha256Bytes(fetched.bytes) : null
      const currentFingerprint = await sha256Bytes([
        contentFingerprint ?? '', etagHash ?? '', lastModifiedHash ?? '', fetched.redirectFingerprint ?? '',
      ].join(':'))
      const baseline = monitor.last_success_at === null
      const changed = !baseline && (
        contentFingerprint !== monitor.content_fingerprint || etagHash !== monitor.etag_hash
        || lastModifiedHash !== monitor.last_modified_hash
        || fetched.redirectFingerprint !== monitor.redirect_fingerprint
      )
      const outcome = baseline ? 'baseline' : changed ? 'changed' : 'unchanged'
      const retainedUntil = plusSeconds(nowDate, changed ? 365 * 86400 : 90 * 86400)
      const nextDueAt = plusSeconds(nowDate,
        monitor.interval_seconds + sourceJitterSeconds(monitor.source_document_id, monitor.interval_seconds))
      const actorLabel = `${SYSTEM_LABEL_PREFIX}${job.rule_version}`
      const successStatements: D1PreparedStatement[] = [dependencies.db.prepare(`INSERT INTO automated_source_observations
        (id, source_document_id, maintenance_run_id, observed_at, status_class, redirect_outcome,
         mime_family, bounded_byte_count, etag_hash, last_modified_hash, content_fingerprint,
         redirect_fingerprint, duration_bucket, error_category, outcome, retained_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
        .bind(observationId, monitor.source_document_id, runId, now, fetched.statusClass,
          fetched.redirectOutcome, fetched.mimeFamily, fetched.bytes.length, etagHash,
          lastModifiedHash, contentFingerprint, fetched.redirectFingerprint,
          sourceDurationBucket(dependencies.now().valueOf() - startedAt), outcome, retainedUntil)]

      if (changed) {
        const values = await affectedSourceValues(dependencies.db, monitor.source_document_id)
        successStatements.push(dependencies.db.prepare(`INSERT OR IGNORE INTO automated_update_candidates
          (id, source_document_id, triggering_observation_id, triggering_run_id, current_fingerprint,
           affected_fields_json, affected_field_count, affected_fields_truncated,
           prior_public_values_json, proposed_values_json, adapter_version,
           state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'review-only-v1', 'open', ?, ?)`)
          .bind(dependencies.createId(), monitor.source_document_id, observationId, runId, currentFingerprint,
            JSON.stringify(values.affectedFields), values.affectedFieldCount, values.truncated ? 1 : 0,
            JSON.stringify(values.priorValues), now, now))
      }
      successStatements.push(dependencies.db.prepare(`UPDATE approved_source_monitors SET next_due_at = ?, last_success_at = ?,
        consecutive_failures = 0, backoff_until = NULL, circuit_state = 'closed', etag_hash = ?,
        last_modified_hash = ?, etag_value = ?, last_modified_value = ?, content_fingerprint = ?,
        redirect_fingerprint = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE source_document_id = ? AND lease_owner = ?`)
        .bind(nextDueAt, now, etagHash, lastModifiedHash, fetched.etag,
          fetched.lastModified, contentFingerprint, fetched.redirectFingerprint, now,
          monitor.source_document_id, runId))
      successStatements.push(dependencies.db.prepare(`INSERT OR IGNORE INTO system_maintenance_events
        (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
         action, reason, before_state_json, after_state_json, actor_label, created_at)
        VALUES (?, ?, ?, ?, ?, 'source-monitor', ?, 'source-monitor-technical-check-succeeded',
          'A bounded approved source check recorded technical state without factual reverification.',
          json_object('consecutiveFailures', ?, 'lastSuccessAt', ?, 'circuitState', 'closed'),
          json_object('consecutiveFailures', 0, 'lastSuccessAt', ?, 'circuitState', 'closed',
            'technicalOutcome', ?, 'nextDueAt', ?), ?, ?)`)
        .bind(dependencies.createId(), runId, job.job_key, job.rule_version,
          `${job.rule_version}:${monitor.source_document_id}:technical-check:${observationId}`,
          monitor.source_document_id, monitor.consecutive_failures, monitor.last_success_at,
          now, outcome, nextDueAt, actorLabel, now))
      await dependencies.db.batch(successStatements)
      execution.actionsApplied += changed ? 2 : 1
    } catch (error) {
      const failure = error instanceof SourceCheckFailure
        ? error : new SourceCheckFailure('network', 'network', 'none', 0)
      execution.outboundSubrequests += failure.subrequests
      execution.fetchedBytes += failure.byteCount
      execution.failedTasks += 1
      const nextFailure = monitor.consecutive_failures + 1
      const opensCircuit = nextFailure >= SOURCE_FAILURE_THRESHOLD
      const delay = Math.min(300 * (2 ** Math.min(nextFailure - 1, 8)), 86_400)
      const backoffUntil = plusSeconds(nowDate, delay)
      const actorLabel = `${SYSTEM_LABEL_PREFIX}${job.rule_version}`
      await dependencies.db.batch([
        dependencies.db.prepare(`INSERT INTO automated_source_observations
          (id, source_document_id, maintenance_run_id, observed_at, status_class, redirect_outcome,
           mime_family, bounded_byte_count, duration_bucket, error_category, outcome, retained_until)
          VALUES (?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, 'failed', ?)`)
          .bind(observationId, monitor.source_document_id, runId, now, failure.statusClass,
            failure.redirectOutcome, Math.min(failure.byteCount, monitor.maximum_response_bytes),
            failure.category === 'timeout' ? 'timeout' : sourceDurationBucket(dependencies.now().valueOf() - startedAt),
            failure.category, plusSeconds(nowDate, 90 * 86400)),
        dependencies.db.prepare(`UPDATE approved_source_monitors SET consecutive_failures = ?,
          backoff_until = ?, circuit_state = ?, lease_owner = NULL, lease_expires_at = NULL,
          updated_at = ? WHERE source_document_id = ? AND lease_owner = ?`)
          .bind(nextFailure, backoffUntil, opensCircuit ? 'open' : 'closed', now,
            monitor.source_document_id, runId),
        dependencies.db.prepare(`INSERT OR IGNORE INTO system_maintenance_events
          (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
           action, reason, before_state_json, after_state_json, actor_label, created_at)
          VALUES (?, ?, ?, ?, ?, 'source-monitor', ?, 'source-monitor-technical-check-failed',
            ?, json_object('consecutiveFailures', ?, 'lastSuccessAt', ?, 'circuitState', 'closed'),
            json_object('consecutiveFailures', ?, 'lastSuccessAt', ?, 'circuitState', ?,
              'errorCategory', ?, 'backoffUntil', ?), ?, ?)`)
          .bind(dependencies.createId(), runId, job.job_key, job.rule_version,
            `${job.rule_version}:${monitor.source_document_id}:technical-check:${observationId}`,
            monitor.source_document_id,
            `A bounded approved source check failed with sanitized category ${failure.category}.`,
            monitor.consecutive_failures, monitor.last_success_at, nextFailure, monitor.last_success_at,
            opensCircuit ? 'open' : 'closed', failure.category, backoffUntil, actorLabel, now),
      ])
      execution.actionsApplied += 1
      if (opensCircuit) await recordSourceAlert(dependencies, runId, job, monitor, now, failure.category)
    }
  }
  return execution
}

async function executeJob(
  dependencies: MaintenanceDependencies,
  runId: string,
  job: JobRow,
  now: string,
) : Promise<JobExecution> {
  if (job.job_key === 'listing-lifecycle') {
    return { ...emptyJobExecution(), actionsApplied: await runListingLifecycle(dependencies, runId, job, now) }
  }
  if (job.job_key === 'proposal-retention') {
    return { ...emptyJobExecution(), actionsApplied: await runProposalRetention(dependencies, runId, job, now) }
  }
  if (job.job_key === 'event-completion') {
    return { ...emptyJobExecution(), actionsApplied: await runEventCompletion(dependencies, runId, job, new Date(now)) }
  }
  if (job.job_key === 'security-intent-cleanup') {
    return { ...emptyJobExecution(), actionsApplied: await runSecurityIntentCleanup(dependencies, runId, job, now) }
  }
  if (job.job_key === 'source-monitoring') {
    return runSourceMonitoring(dependencies, runId, job, new Date(now))
  }
  if (job.job_key === 'maintenance-history-retention') {
    return { ...emptyJobExecution(), actionsApplied: await runMaintenanceHistoryRetention(
      dependencies, runId, job, new Date(now),
    ) }
  }
  if (job.job_key === 'ordinary-account-lifecycle') {
    return runOrdinaryAccountLifecycleMaintenance(dependencies, runId, job, now)
  }
  return emptyJobExecution()
}

export async function runMaintenance(
  dependencies: MaintenanceDependencies,
  options: MaintenanceOptions,
): Promise<MaintenanceOutcome> {
  const started = dependencies.now()
  const now = started.toISOString()
  const runId = dependencies.createId()
  const operatorTenureId = options.trigger === 'operator-run-now' ? options.operatorTenureId ?? null : null
  if (options.trigger === 'operator-run-now' && operatorTenureId === null) {
    throw new Error('Operator Run now requires an active Operator tenure.')
  }
  await dependencies.db.prepare(`INSERT INTO maintenance_runs
    (id, trigger_type, dispatcher_rule_version, status, started_at, operator_tenure_id)
    VALUES (?, ?, ?, 'running', ?, ?)`).bind(
    runId, options.trigger, DISPATCHER_RULE_VERSION, now, operatorTenureId,
  ).run()

  const outcome: MaintenanceOutcome = {
    runId,
    status: 'succeeded',
    jobsClaimed: 0,
    actionsApplied: 0,
    failedTasks: 0,
    outboundSubrequests: 0,
    fetchedBytes: 0,
  }
  try {
    const maximumJobs = Math.min(Math.max(options.maximumJobs ?? 7, 1), 7)
    const jobs = await dependencies.db.prepare(`SELECT job_key, rule_version, interval_seconds, batch_size, next_due_at
    FROM maintenance_jobs WHERE enabled = 1 AND circuit_state = 'closed' AND next_due_at <= ?
      AND (backoff_until IS NULL OR backoff_until <= ?)
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
    ORDER BY next_due_at, job_key LIMIT ?`).bind(now, now, now, maximumJobs).all<JobRow>()

    for (const job of jobs.results) {
      if (started.valueOf() - Date.parse(job.next_due_at) > job.interval_seconds * 2_000) {
        await recordAutomationAlert(dependencies, {
          runId, job, alertType: 'scheduler-overdue', severity: 'warning',
          coalescingKey: `scheduler-overdue:${job.job_key}`,
          summary: 'A maintenance job began after its documented overdue window.', now,
        })
      }
      const claim = await dependencies.db.prepare(`UPDATE maintenance_jobs SET lease_owner = ?, lease_expires_at = ?,
      last_started_at = ?, updated_at = ? WHERE job_key = ? AND enabled = 1 AND circuit_state = 'closed'
      AND next_due_at <= ? AND (backoff_until IS NULL OR backoff_until <= ?)
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`)
        .bind(runId, plusSeconds(started, JOB_LEASE_SECONDS), now, now, job.job_key, now, now, now).run()
      if (Number(claim.meta.changes ?? 0) !== 1) continue
      outcome.jobsClaimed += 1
      try {
        const execution = await executeJob(dependencies, runId, job, now)
        outcome.actionsApplied += execution.actionsApplied
        outcome.failedTasks += execution.failedTasks
        outcome.outboundSubrequests += execution.outboundSubrequests
        outcome.fetchedBytes += execution.fetchedBytes
        const normalDueAt = plusSeconds(started, job.interval_seconds)
        const nextDueAt = execution.nextDueAt && execution.nextDueAt < normalDueAt
          ? execution.nextDueAt
          : normalDueAt
        await dependencies.db.prepare(`UPDATE maintenance_jobs SET next_due_at = ?, last_success_at = ?,
        consecutive_failures = 0, backoff_until = NULL, lease_owner = NULL, lease_expires_at = NULL,
        checkpoint = ?, updated_at = ? WHERE job_key = ? AND lease_owner = ?`)
          .bind(nextDueAt, now, now, now, job.job_key, runId).run()
        if (execution.actionsApplied >= job.batch_size) {
          await recordAutomationAlert(dependencies, {
            runId, job, alertType: 'backlog-threshold', severity: 'warning',
            coalescingKey: `backlog-threshold:${job.job_key}`,
            summary: 'A bounded maintenance batch reached its configured work limit.', now,
          })
        }
      } catch {
        outcome.failedTasks += 1
        const failures = await dependencies.db.prepare('SELECT consecutive_failures FROM maintenance_jobs WHERE job_key = ?')
          .bind(job.job_key).first<{ consecutive_failures: number }>()
        const nextFailure = (failures?.consecutive_failures ?? 0) + 1
        const delay = Math.min(300 * (2 ** Math.min(nextFailure - 1, 6)), 21_600)
        await dependencies.db.prepare(`UPDATE maintenance_jobs SET consecutive_failures = ?, backoff_until = ?,
        circuit_state = CASE WHEN ? >= 5 THEN 'open' ELSE circuit_state END,
        lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE job_key = ? AND lease_owner = ?`)
          .bind(nextFailure, plusSeconds(started, delay), nextFailure, now, job.job_key, runId).run()
        await recordAutomationAlert(dependencies, {
          runId, job,
          alertType: nextFailure >= 5 ? 'circuit-open' : 'invariant-failure',
          severity: nextFailure >= 5 ? 'critical' : 'warning',
          coalescingKey: `job-failure:${job.job_key}`,
          summary: nextFailure >= 5
            ? 'A maintenance job circuit opened after repeated bounded failures.'
            : 'A maintenance job failed safely; unrelated jobs may continue.', now,
        })
      }
    }
  } catch {
    outcome.failedTasks += 1
  }

  outcome.status = outcome.failedTasks === 0 ? 'succeeded'
    : outcome.failedTasks < outcome.jobsClaimed ? 'partial' : 'failed'
  const completedAt = dependencies.now().toISOString()
  await dependencies.db.prepare(`UPDATE maintenance_runs SET status = ?, completed_at = ?, jobs_claimed = ?,
    actions_applied = ?, failed_tasks = ?, outbound_subrequests = ?, fetched_bytes = ?, outcome_json = ?
    WHERE id = ? AND status = 'running'`).bind(
    outcome.status, completedAt, outcome.jobsClaimed, outcome.actionsApplied, outcome.failedTasks,
    outcome.outboundSubrequests, outcome.fetchedBytes,
    JSON.stringify({ jobsClaimed: outcome.jobsClaimed, actionsApplied: outcome.actionsApplied, failedTasks: outcome.failedTasks }),
    runId,
  ).run()
  return outcome
}
