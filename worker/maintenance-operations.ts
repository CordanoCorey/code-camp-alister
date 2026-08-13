import type { OperatorPrincipal } from './operator-lifecycle-repository'
import type {
  ApprovedSourceMonitorSummary,
  AutomatedUpdateCandidateSummary,
  AutomationAlertSummary,
  MaintenanceJobSummary,
  MaintenanceWorkspace,
} from '../shared/domain'
import { maintenanceJobPolicy, sourceMonitorPolicy, validateSourceTarget } from '../shared/maintenance-policy'
import { CursorInputError, decodeCursor, encodeCursor } from './pagination'

export type SourceMonitorMode = 'availability-metadata' | 'bounded-fingerprint'

export function validateApprovedSourceUrl(value: string) {
  try {
    const validated = validateSourceTarget(value)
    return { exactUrl: validated.exactUrl, canonicalHostname: validated.canonicalHostname }
  } catch {
    throw new Error('The Source Document URL does not satisfy the approved public HTTPS policy.')
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function approveSourceMonitor(db: D1Database, input: {
  sourceDocumentId: string
  mode: SourceMonitorMode
  intervalSeconds: number
  maximumResponseBytes: number
  maximumRedirects: number
  reason: string
  actor: OperatorPrincipal
  now: string
}) {
  if (input.mode !== 'availability-metadata' && input.mode !== 'bounded-fingerprint') {
    throw new Error('Choose a supported Source Monitor mode.')
  }
  if (!sourceMonitorPolicy.intervals.includes(input.intervalSeconds as never)) throw new Error('Choose a supported Source Monitor interval.')
  if (!sourceMonitorPolicy.responseCaps.includes(input.maximumResponseBytes as never)) throw new Error('Choose a supported response-size cap.')
  if (!sourceMonitorPolicy.redirectCounts.includes(input.maximumRedirects as never)) {
    throw new Error('Choose zero or one same-host redirect.')
  }
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new Error('Provide a bounded monitoring approval reason.')
  const document = await db.prepare('SELECT url FROM source_documents WHERE id = ?')
    .bind(input.sourceDocumentId).first<{ url: string }>()
  if (!document) throw new Error('Choose an existing canonical Source Document.')
  const validated = validateApprovedSourceUrl(document.url)
  const fingerprint = await sha256(validated.exactUrl)
  await db.prepare(`INSERT INTO approved_source_monitors
    (source_document_id, enabled, canonical_hostname, source_url_fingerprint, check_mode,
     interval_seconds, maximum_response_bytes, maximum_redirects, adapter_version, next_due_at,
     approved_operator_tenure_id, approved_at, approval_reason, created_at, updated_at)
    VALUES (?, 0, ?, ?, ?, ?, ?, ?, 'review-only-v1', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_document_id) DO UPDATE SET enabled = 0,
      canonical_hostname = excluded.canonical_hostname,
      source_url_fingerprint = excluded.source_url_fingerprint, check_mode = excluded.check_mode,
      interval_seconds = excluded.interval_seconds, maximum_response_bytes = excluded.maximum_response_bytes,
      maximum_redirects = excluded.maximum_redirects, adapter_version = 'review-only-v1',
      next_due_at = excluded.next_due_at, consecutive_failures = 0, backoff_until = NULL,
      circuit_state = 'closed', etag_hash = NULL, last_modified_hash = NULL,
      etag_value = NULL, last_modified_value = NULL, content_fingerprint = NULL,
      redirect_fingerprint = NULL, lease_owner = NULL, lease_expires_at = NULL,
      approved_operator_tenure_id = excluded.approved_operator_tenure_id,
      approved_at = excluded.approved_at, approval_reason = excluded.approval_reason,
      disabled_at = NULL, disabled_operator_tenure_id = NULL, updated_at = excluded.updated_at`)
    .bind(input.sourceDocumentId, validated.canonicalHostname, fingerprint, input.mode,
      input.intervalSeconds, input.maximumResponseBytes, input.maximumRedirects, input.now,
      input.actor.tenureNumber, input.now, input.reason.trim(), input.now, input.now).run()
}

type MaintenanceQueue = keyof MaintenanceWorkspace['pagination']

export async function getMaintenanceWorkspace(
  db: D1Database,
  now: string,
  readOnly: boolean,
  page?: { queue: MaintenanceQueue; cursor: string },
): Promise<MaintenanceWorkspace> {
  const afterId = page ? decodeCursor(page.cursor, 1)[0] : null
  if (afterId !== null && typeof afterId !== 'string') throw new CursorInputError('The Automation page cursor is invalid.')
  const cursorFor = (queue: MaintenanceQueue) => page?.queue === queue ? afterId : null
  const pageSize = 20
  const [jobRows, runRows, monitorRows, sourceRows, candidateRows, alertRows, counts] = await Promise.all([
    db.prepare(`SELECT job_key, enabled, rule_version, interval_seconds, batch_size, next_due_at,
      last_success_at, consecutive_failures, circuit_state, lease_expires_at
      FROM maintenance_jobs ORDER BY job_key`).all<{
        job_key: string; enabled: number; rule_version: string; interval_seconds: number; batch_size: number
        next_due_at: string; last_success_at: string | null; consecutive_failures: number
        circuit_state: 'closed' | 'open'; lease_expires_at: string | null
      }>(),
    db.prepare(`SELECT id, trigger_type, status, started_at, completed_at, jobs_claimed,
      actions_applied, failed_tasks, outbound_subrequests, fetched_bytes
      FROM maintenance_runs WHERE status <> 'running' ORDER BY started_at DESC, id DESC LIMIT 12`).all<{
        id: string; trigger_type: MaintenanceWorkspace['recentRuns'][number]['trigger']
        status: MaintenanceWorkspace['recentRuns'][number]['status']; started_at: string; completed_at: string | null
        jobs_claimed: number; actions_applied: number; failed_tasks: number
        outbound_subrequests: number; fetched_bytes: number
      }>(),
    db.prepare(`SELECT monitor.source_document_id, document.label, document.url, monitor.enabled,
      monitor.canonical_hostname, monitor.check_mode, monitor.interval_seconds,
      monitor.maximum_response_bytes, monitor.maximum_redirects, monitor.next_due_at,
      monitor.last_attempt_at, monitor.last_success_at, monitor.consecutive_failures,
      monitor.backoff_until, monitor.circuit_state
      FROM approved_source_monitors monitor JOIN source_documents document
        ON document.id = monitor.source_document_id
      WHERE (? IS NULL OR monitor.source_document_id > ?)
      ORDER BY monitor.source_document_id LIMIT ?`).bind(
        cursorFor('monitors'), cursorFor('monitors'), pageSize + 1,
      ).all<{
        source_document_id: string; label: string; url: string; enabled: number; canonical_hostname: string
        check_mode: ApprovedSourceMonitorSummary['mode']; interval_seconds: number; maximum_response_bytes: number
        maximum_redirects: number; next_due_at: string; last_attempt_at: string | null
        last_success_at: string | null; consecutive_failures: number; backoff_until: string | null
        circuit_state: 'closed' | 'open'
      }>(),
    db.prepare(`SELECT document.id, document.label, document.url FROM source_documents document
      WHERE NOT EXISTS (SELECT 1 FROM approved_source_monitors monitor
        WHERE monitor.source_document_id = document.id)
        AND (? IS NULL OR document.id > ?)
      ORDER BY document.id LIMIT ?`).bind(
        cursorFor('availableSources'), cursorFor('availableSources'), pageSize + 1,
      ).all<{ id: string; label: string; url: string }>(),
    db.prepare(`SELECT candidate.id, candidate.source_document_id, document.label, document.url,
      candidate.state, candidate.affected_fields_json, candidate.affected_field_count,
      candidate.affected_fields_truncated, candidate.prior_public_values_json,
      candidate.proposed_values_json, candidate.adapter_version, candidate.created_at
      FROM automated_update_candidates candidate JOIN source_documents document
        ON document.id = candidate.source_document_id
      WHERE candidate.state IN ('open', 'reviewing')
        AND (? IS NULL OR candidate.id > ?)
      ORDER BY candidate.id LIMIT ?`).bind(
        cursorFor('candidates'), cursorFor('candidates'), pageSize + 1,
      ).all<{
        id: string; source_document_id: string; label: string; url: string
        state: AutomatedUpdateCandidateSummary['state']; affected_fields_json: string
        affected_field_count: number; affected_fields_truncated: number
        prior_public_values_json: string; proposed_values_json: string | null
        adapter_version: string; created_at: string
      }>(),
    db.prepare(`SELECT id, alert_type, severity, summary, status, occurrence_count,
      first_seen_at, last_seen_at FROM automation_alerts WHERE status <> 'resolved'
        AND (? IS NULL OR id > ?)
      ORDER BY id LIMIT ?`).bind(
        cursorFor('alerts'), cursorFor('alerts'), pageSize + 1,
      ).all<{
        id: string; alert_type: AutomationAlertSummary['type']; severity: AutomationAlertSummary['severity']
        summary: string; status: AutomationAlertSummary['status']; occurrence_count: number
        first_seen_at: string; last_seen_at: string
      }>(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM maintenance_jobs WHERE enabled = 1 AND circuit_state = 'closed'
        AND next_due_at <= ? AND (backoff_until IS NULL OR backoff_until <= ?)) due_jobs,
      (SELECT COUNT(*) FROM approved_source_monitors WHERE enabled = 1 AND circuit_state = 'closed'
        AND next_due_at <= ? AND (backoff_until IS NULL OR backoff_until <= ?)) due_sources,
      (SELECT COUNT(*) FROM automation_alerts WHERE status <> 'resolved') open_alerts`)
      .bind(now, now, now, now).first<{ due_jobs: number; due_sources: number; open_alerts: number }>(),
  ])
  const jobs: MaintenanceJobSummary[] = jobRows.results.map((row) => ({
    key: row.job_key, enabled: row.enabled === 1, ruleVersion: row.rule_version,
    intervalSeconds: row.interval_seconds, batchSize: row.batch_size, nextDueAt: row.next_due_at,
    lastSuccessAt: row.last_success_at, consecutiveFailures: row.consecutive_failures,
    circuitState: row.circuit_state, leasedUntil: row.lease_expires_at,
  }))
  const recentRuns = runRows.results.map((row) => ({
    id: row.id, trigger: row.trigger_type, status: row.status, startedAt: row.started_at,
    completedAt: row.completed_at, jobsClaimed: row.jobs_claimed, actionsApplied: row.actions_applied,
    failedTasks: row.failed_tasks, outboundSubrequests: row.outbound_subrequests, fetchedBytes: row.fetched_bytes,
  }))
  return {
    readOnly,
    scheduler: {
      cadence: '7 and 37 minutes past each UTC hour',
      lastRunAt: recentRuns[0]?.startedAt ?? null,
      lastRunStatus: recentRuns[0]?.status ?? null,
      nextDueAt: jobs.filter((job) => job.enabled).map((job) => job.nextDueAt).sort()[0] ?? null,
      dueJobCount: Number(counts?.due_jobs ?? 0), dueSourceCount: Number(counts?.due_sources ?? 0),
      openAlertCount: Number(counts?.open_alerts ?? 0),
    },
    jobs,
    recentRuns,
    monitors: readOnly ? [] : monitorRows.results.slice(0, pageSize).map((row) => ({
      sourceDocumentId: row.source_document_id, sourceLabel: row.label, sourceUrl: row.url,
      enabled: row.enabled === 1, hostname: row.canonical_hostname, mode: row.check_mode,
      intervalSeconds: row.interval_seconds, maximumResponseBytes: row.maximum_response_bytes,
      maximumRedirects: row.maximum_redirects, nextDueAt: row.next_due_at,
      lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at,
      consecutiveFailures: row.consecutive_failures, circuitState: row.circuit_state,
      technicalStatus: row.circuit_state === 'open' ? 'circuit-open'
        : row.backoff_until && row.backoff_until > now ? 'backoff'
          : row.last_success_at ? 'reachable' : 'not-checked',
    })),
    availableSources: readOnly ? [] : sourceRows.results.slice(0, pageSize),
    candidates: readOnly ? [] : candidateRows.results.slice(0, pageSize).map((row) => ({
      id: row.id, sourceDocumentId: row.source_document_id, sourceLabel: row.label,
      sourceUrl: row.url, state: row.state,
      affectedFields: JSON.parse(row.affected_fields_json) as AutomatedUpdateCandidateSummary['affectedFields'],
      affectedFieldCount: row.affected_field_count,
      affectedFieldsTruncated: row.affected_fields_truncated === 1,
      priorPublicValues: JSON.parse(row.prior_public_values_json) as AutomatedUpdateCandidateSummary['priorPublicValues'],
      hasTypedProposal: row.proposed_values_json !== null, adapterVersion: row.adapter_version,
      createdAt: row.created_at,
    })),
    alerts: alertRows.results.slice(0, pageSize).map((row) => ({
      id: row.id, type: row.alert_type, severity: row.severity, summary: row.summary,
      status: row.status, occurrenceCount: row.occurrence_count,
      firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at,
    })),
    pagination: {
      monitors: !readOnly && monitorRows.results.length > pageSize
        ? encodeCursor([monitorRows.results[pageSize - 1].source_document_id]) : null,
      availableSources: !readOnly && sourceRows.results.length > pageSize
        ? encodeCursor([sourceRows.results[pageSize - 1].id]) : null,
      candidates: !readOnly && candidateRows.results.length > pageSize
        ? encodeCursor([candidateRows.results[pageSize - 1].id]) : null,
      alerts: alertRows.results.length > pageSize ? encodeCursor([alertRows.results[pageSize - 1].id]) : null,
    },
  }
}

export async function updateMaintenanceJob(db: D1Database, input: {
  jobKey: string
  enabled: boolean
  batchSize: number
  intervalSeconds: number
  reason: string
  actor: OperatorPrincipal
  now: string
}) {
  const current = await db.prepare('SELECT enabled, batch_size, interval_seconds FROM maintenance_jobs WHERE job_key = ?')
    .bind(input.jobKey).first<{ enabled: number; batch_size: number; interval_seconds: number }>()
  if (!current) throw new Error('Maintenance job not found.')
  const policy = maintenanceJobPolicy(input.jobKey)
  if (!policy.batchSizes.includes(input.batchSize)) throw new Error('Choose a supported maintenance batch size.')
  if (!policy.intervals.includes(input.intervalSeconds)) throw new Error('Choose a supported maintenance cadence.')
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new Error('Explain the maintenance configuration change.')
  await db.batch([
    db.prepare(`UPDATE maintenance_jobs SET enabled = ?, batch_size = ?, interval_seconds = ?,
      next_due_at = CASE WHEN ? = 1 THEN MIN(next_due_at, ?) ELSE next_due_at END,
      updated_at = ? WHERE job_key = ?`)
      .bind(input.enabled ? 1 : 0, input.batchSize, input.intervalSeconds,
        input.enabled ? 1 : 0, input.now, input.now, input.jobKey),
    db.prepare(`INSERT INTO content_audit_events
      (stable_scope_id, action, actor_label, before_json, after_json, reason, created_at, operator_tenure_id)
      VALUES (?, 'automation job configured', ?, json_object('enabled', ?, 'batchSize', ?, 'intervalSeconds', ?),
        json_object('enabled', ?, 'batchSize', ?, 'intervalSeconds', ?), ?, ?, ?)`)
      .bind(`automation-job:${input.jobKey}`, input.actor.label, current.enabled, current.batch_size,
        current.interval_seconds, input.enabled ? 1 : 0, input.batchSize, input.intervalSeconds,
        input.reason.trim(), input.now, input.actor.tenureNumber),
  ])
}

export async function resetMaintenanceJobCircuit(db: D1Database, input: {
  jobKey: string
  reason: string
  actor: OperatorPrincipal
  now: string
}) {
  if (!input.reason.trim() || input.reason.trim().length > 500) {
    throw new Error('Explain why the maintenance job circuit is being reset.')
  }
  const current = await db.prepare(`SELECT enabled, consecutive_failures, circuit_state
    FROM maintenance_jobs WHERE job_key = ?`).bind(input.jobKey).first<{
      enabled: number; consecutive_failures: number; circuit_state: string
    }>()
  if (!current || current.circuit_state !== 'open') throw new Error('Open maintenance job circuit not found.')
  await db.batch([
    db.prepare(`UPDATE maintenance_jobs SET enabled = 1, consecutive_failures = 0,
      circuit_state = 'closed', backoff_until = NULL, next_due_at = ?, lease_owner = NULL,
      lease_expires_at = NULL, updated_at = ? WHERE job_key = ? AND circuit_state = 'open'`)
      .bind(input.now, input.now, input.jobKey),
    db.prepare(`INSERT INTO content_audit_events
      (stable_scope_id, action, actor_label, before_json, after_json, reason, created_at, operator_tenure_id)
      VALUES (?, 'automation job circuit reset', ?,
        json_object('enabled', ?, 'consecutiveFailures', ?, 'circuitState', ?),
        json_object('enabled', 1, 'consecutiveFailures', 0, 'circuitState', 'closed'), ?, ?, ?)`)
      .bind(`automation-job:${input.jobKey}`, input.actor.label, current.enabled,
        current.consecutive_failures, current.circuit_state, input.reason.trim(), input.now,
        input.actor.tenureNumber),
  ])
}

export async function setSourceMonitorState(db: D1Database, input: {
  sourceDocumentId: string
  action: 'enable' | 'disable' | 'reset-circuit'
  reason: string
  actor: OperatorPrincipal
  now: string
}) {
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new Error('Explain the Source Monitor change.')
  const monitor = await db.prepare(`SELECT enabled, circuit_state FROM approved_source_monitors
    WHERE source_document_id = ?`).bind(input.sourceDocumentId).first<{ enabled: number; circuit_state: string }>()
  if (!monitor) throw new Error('Approved Source Monitor not found.')
  const enabled = input.action === 'disable' ? 0 : 1
  await db.batch([
    db.prepare(`UPDATE approved_source_monitors SET enabled = ?,
      circuit_state = CASE WHEN ? = 'reset-circuit' THEN 'closed' ELSE circuit_state END,
      consecutive_failures = CASE WHEN ? = 'reset-circuit' THEN 0 ELSE consecutive_failures END,
      backoff_until = CASE WHEN ? = 'reset-circuit' THEN NULL ELSE backoff_until END,
      next_due_at = CASE WHEN ? IN ('enable', 'reset-circuit') THEN ? ELSE next_due_at END,
      disabled_at = CASE WHEN ? = 'disable' THEN ? ELSE NULL END,
      disabled_operator_tenure_id = CASE WHEN ? = 'disable' THEN ? ELSE NULL END,
      updated_at = ? WHERE source_document_id = ?`)
      .bind(enabled, input.action, input.action, input.action, input.action, input.now,
        input.action, input.now, input.action, input.actor.tenureNumber, input.now, input.sourceDocumentId),
    db.prepare(`INSERT INTO content_audit_events
      (stable_scope_id, action, actor_label, before_json, after_json, reason, created_at, operator_tenure_id)
      VALUES (?, 'Source Monitor configured', ?, json_object('enabled', ?, 'circuitState', ?),
        json_object('action', ?), ?, ?, ?)`)
      .bind(`source-monitor:${input.sourceDocumentId}`, input.actor.label, monitor.enabled,
        monitor.circuit_state, input.action, input.reason.trim(), input.now, input.actor.tenureNumber),
  ])
}

export async function reviewAutomatedUpdateCandidate(db: D1Database, input: {
  candidateId: string
  action: 'review' | 'no-material-change' | 'supersede' | 'dismiss'
  reason: string
  actor: OperatorPrincipal
  now: string
}) {
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new Error('Explain the candidate decision.')
  const candidate = await db.prepare(`SELECT state, proposed_values_json FROM automated_update_candidates WHERE id = ?`)
    .bind(input.candidateId).first<{ state: string; proposed_values_json: string | null }>()
  if (!candidate || !['open', 'reviewing'].includes(candidate.state)) throw new Error('Open Automated Update Draft not found.')
  const nextState = input.action === 'review' ? 'reviewing'
    : input.action === 'no-material-change' ? 'no-material-change'
      : input.action === 'supersede' ? 'superseded' : 'dismissed'
  await db.batch([
    db.prepare(`UPDATE automated_update_candidates SET state = ?, updated_at = ?,
      reviewed_operator_tenure_id = CASE WHEN ? = 'reviewing' THEN NULL ELSE ? END,
      reviewed_at = CASE WHEN ? = 'reviewing' THEN NULL ELSE ? END,
      review_reason = CASE WHEN ? = 'reviewing' THEN NULL ELSE ? END
      WHERE id = ? AND state IN ('open', 'reviewing')`)
      .bind(nextState, input.now, nextState, input.actor.tenureNumber, nextState, input.now,
        nextState, input.reason.trim(), input.candidateId),
    db.prepare(`INSERT INTO automated_update_candidate_reviews
      (candidate_id, from_state, to_state, reason, operator_tenure_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(input.candidateId, candidate.state, nextState, input.reason.trim(), input.actor.tenureNumber, input.now),
  ])
}

export async function reviewAutomationAlert(db: D1Database, input: {
  alertId: string
  action: 'acknowledged' | 'resolved'
  reason: string
  actor: OperatorPrincipal
  now: string
}) {
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new Error('Explain the alert decision.')
  const alert = await db.prepare(`SELECT status FROM automation_alerts WHERE id = ? AND status <> 'resolved'`)
    .bind(input.alertId).first<{ status: string }>()
  if (!alert) throw new Error('Open Automation Alert not found.')
  await db.batch([
    db.prepare(`UPDATE automation_alerts SET status = ?,
      acknowledged_at = CASE WHEN ? = 'acknowledged' THEN ? ELSE acknowledged_at END,
      resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE NULL END,
      last_seen_at = MAX(last_seen_at, ?) WHERE id = ? AND status <> 'resolved'`)
      .bind(input.action, input.action, input.now, input.action, input.now, input.now, input.alertId),
    db.prepare(`INSERT INTO automation_alert_reviews
      (alert_id, action, reason, operator_tenure_id, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(input.alertId, input.action, input.reason.trim(), input.actor.tenureNumber, input.now),
  ])
}
