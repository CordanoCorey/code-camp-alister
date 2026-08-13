import { afterEach, describe, expect, test } from 'vitest'
import { runMaintenance } from './maintenance'
import { approveSourceMonitor, resetMaintenanceJobCircuit, setSourceMonitorState } from './maintenance-operations'
import { createMigratedD1 } from './test-sqlite-d1'

const openDatabases: Array<ReturnType<typeof createMigratedD1>> = []
afterEach(() => { while (openDatabases.length) openDatabases.pop()?.close() })

function database() {
  const migrated = createMigratedD1()
  openDatabases.push(migrated)
  return migrated
}

let dependencyInstance = 0
function dependencies(db: D1Database, now: string, fetchImplementation?: typeof fetch) {
  let id = 0
  const instance = ++dependencyInstance
  return {
    db,
    now: () => new Date(now),
    createId: () => `scheduling-test-${instance}-${++id}`,
    fetch: fetchImplementation ?? (async () => { throw new Error('network must not be used') }) as typeof fetch,
  }
}

function activateOperator(sqlite: ReturnType<typeof database>['sqlite']) {
  sqlite.prepare("INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-01-01T00:00:00.000Z')").run()
  sqlite.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Operator',
    verified_email = 'operator@example.test', active_tenure_number = 1, eligibility_confirmed = 1,
    eligibility_confirmed_at = '2026-01-01T00:00:00.000Z', attestation_version = 'test-v1',
    activated_at = '2026-01-01T00:00:00.000Z', renewal_due_at = '2030-01-01T00:00:00.000Z', version = 1
    WHERE singleton_key = 1`).run()
}

describe('maintenance scheduling and retention', () => {
  test('does not claim a live lease, reclaims an expired lease, and honors the job cap', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    sqlite.prepare(`UPDATE maintenance_jobs SET enabled = CASE
      WHEN job_key IN ('listing-lifecycle', 'event-completion') THEN 1 ELSE 0 END,
      next_due_at = ?, lease_owner = CASE WHEN job_key = 'listing-lifecycle' THEN 'other-run' END,
      lease_expires_at = CASE WHEN job_key = 'listing-lifecycle' THEN '2026-08-13T12:01:00.000Z' END`).run(now)

    const first = await runMaintenance(dependencies(db, now), { trigger: 'local-test', maximumJobs: 1 })
    expect(first.jobsClaimed).toBe(1)
    expect(sqlite.prepare("SELECT lease_owner FROM maintenance_jobs WHERE job_key = 'listing-lifecycle'").get())
      .toEqual({ lease_owner: 'other-run' })

    sqlite.prepare(`UPDATE maintenance_jobs SET next_due_at = ?, lease_expires_at = '2026-08-13T11:59:59.000Z'
      WHERE job_key = 'listing-lifecycle'`).run(now)
    const reclaimed = await runMaintenance(dependencies(db, now), { trigger: 'local-test', maximumJobs: 1 })
    expect(reclaimed.jobsClaimed).toBe(1)
    expect(sqlite.prepare("SELECT lease_owner FROM maintenance_jobs WHERE job_key = 'listing-lifecycle'").get())
      .toEqual({ lease_owner: null })
  })

  test('allows only one genuinely overlapping dispatcher to claim the same due job', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'listing-lifecycle' THEN 1 ELSE 0 END, next_due_at = ?").run(now)
    const [first, second] = await Promise.all([
      runMaintenance(dependencies(db, now), { trigger: 'local-test', maximumJobs: 1 }),
      runMaintenance(dependencies(db, now), { trigger: 'local-test', maximumJobs: 1 }),
    ])
    expect(first.jobsClaimed + second.jobsClaimed).toBe(1)
    expect(sqlite.prepare("SELECT COUNT(*) count FROM maintenance_runs WHERE trigger_type = 'local-test'").get())
      .toEqual({ count: 2 })
  })

  test('expires Listing Verification only after the persisted grace boundary', async () => {
    const { db, sqlite } = database()
    const boundary = '2026-08-13T12:00:00.000Z'
    const outpost = sqlite.prepare("SELECT outpost_id FROM outpost_lifecycle WHERE state = 'verified' ORDER BY outpost_id LIMIT 1")
      .get() as { outpost_id: string }
    sqlite.prepare(`UPDATE outpost_lifecycle SET state = 'grace', next_verification_due_at = '2026-07-14T12:00:00.000Z',
      grace_ends_at = ? WHERE outpost_id = ?`).run(boundary, outpost.outpost_id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'listing-lifecycle' THEN 1 ELSE 0 END, next_due_at = ?")
      .run(boundary)

    await runMaintenance(dependencies(db, boundary), { trigger: 'local-test' })
    expect(sqlite.prepare('SELECT state FROM outpost_lifecycle WHERE outpost_id = ?').get(outpost.outpost_id))
      .toEqual({ state: 'grace' })
    expect(sqlite.prepare('SELECT COUNT(*) count FROM public_eligible_outposts WHERE content_id = ?').get(outpost.outpost_id))
      .toEqual({ count: 1 })

    const after = '2026-08-13T12:00:00.001Z'
    sqlite.prepare("UPDATE maintenance_jobs SET next_due_at = ? WHERE job_key = 'listing-lifecycle'").run(after)
    await runMaintenance(dependencies(db, after), { trigger: 'local-test' })
    expect(sqlite.prepare('SELECT state FROM outpost_lifecycle WHERE outpost_id = ?').get(outpost.outpost_id))
      .toEqual({ state: 'verification-expired' })
    expect(sqlite.prepare('SELECT COUNT(*) count FROM public_eligible_outposts WHERE content_id = ?').get(outpost.outpost_id))
      .toEqual({ count: 0 })
  })

  test('opens and resets a Source Monitor circuit with one coalesced private alert', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    activateOperator(sqlite)
    const source = sqlite.prepare('SELECT id FROM source_documents ORDER BY id LIMIT 1').get() as { id: string }
    sqlite.prepare("UPDATE source_documents SET url = 'https://updates.example.test/source' WHERE id = ?").run(source.id)
    await approveSourceMonitor(db, {
      sourceDocumentId: source.id, mode: 'bounded-fingerprint', intervalSeconds: 86400,
      maximumResponseBytes: 65536, maximumRedirects: 0, reason: 'Safe fixture check.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
    })
    sqlite.prepare('UPDATE approved_source_monitors SET enabled = 1, next_due_at = ? WHERE source_document_id = ?').run(now, source.id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'source-monitoring' THEN 1 ELSE 0 END, next_due_at = ?").run(now)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      sqlite.prepare(`UPDATE maintenance_jobs SET next_due_at = ?, backoff_until = NULL,
        lease_owner = NULL, lease_expires_at = NULL WHERE job_key = 'source-monitoring'`).run(now)
      sqlite.prepare(`UPDATE approved_source_monitors SET next_due_at = ?, backoff_until = NULL,
        lease_owner = NULL, lease_expires_at = NULL WHERE source_document_id = ?`).run(now, source.id)
      await runMaintenance(dependencies(db, now, async () => new Response(null, { status: 503 }) as never), { trigger: 'local-test' })
    }

    expect(sqlite.prepare(`SELECT consecutive_failures, circuit_state FROM approved_source_monitors
      WHERE source_document_id = ?`).get(source.id)).toEqual({ consecutive_failures: 3, circuit_state: 'open' })
    expect(sqlite.prepare('SELECT alert_type, occurrence_count, status FROM automation_alerts').all())
      .toEqual([{ alert_type: 'repeated-failure', occurrence_count: 1, status: 'open' }])

    await setSourceMonitorState(db, {
      sourceDocumentId: source.id, action: 'reset-circuit', reason: 'Operator approved one bounded retry.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
    })
    expect(sqlite.prepare(`SELECT enabled, consecutive_failures, circuit_state, backoff_until
      FROM approved_source_monitors WHERE source_document_id = ?`).get(source.id))
      .toEqual({ enabled: 1, consecutive_failures: 0, circuit_state: 'closed', backoff_until: null })
  })

  test('a successful Source Monitor check resets prior failure and backoff state', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    activateOperator(sqlite)
    const source = sqlite.prepare('SELECT id FROM source_documents ORDER BY id LIMIT 1').get() as { id: string }
    sqlite.prepare("UPDATE source_documents SET url = 'https://updates.example.test/source' WHERE id = ?").run(source.id)
    await approveSourceMonitor(db, {
      sourceDocumentId: source.id, mode: 'bounded-fingerprint', intervalSeconds: 86400,
      maximumResponseBytes: 65536, maximumRedirects: 0, reason: 'Safe fixture check.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
    })
    sqlite.prepare(`UPDATE approved_source_monitors SET enabled = 1, next_due_at = ?,
      consecutive_failures = 2, backoff_until = NULL WHERE source_document_id = ?`).run(now, source.id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'source-monitoring' THEN 1 ELSE 0 END, next_due_at = ?").run(now)
    await runMaintenance(dependencies(db, now, async () => new Response('healthy fixture', {
      status: 200, headers: { 'content-type': 'text/plain' },
    }) as never), { trigger: 'local-test' })
    expect(sqlite.prepare(`SELECT consecutive_failures, backoff_until, circuit_state
      FROM approved_source_monitors WHERE source_document_id = ?`).get(source.id))
      .toEqual({ consecutive_failures: 0, backoff_until: null, circuit_state: 'closed' })
  })

  test('backs off a failing job, opens one coalesced circuit alert, and permits an audited reset', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    activateOperator(sqlite)
    const event = sqlite.prepare(`SELECT occurrence.content_id FROM event_occurrences occurrence
      JOIN content_records content ON content.id = occurrence.content_id
      WHERE content.status = 'published' ORDER BY occurrence.content_id LIMIT 1`)
      .get() as { content_id: string }
    sqlite.prepare(`UPDATE event_occurrences SET lifecycle_status = 'scheduled', start_date = '2026-08-01',
      end_date = '2026-08-01', time_zone = 'Not/A-Time-Zone' WHERE content_id = ?`).run(event.content_id)
    sqlite.prepare(`UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'event-completion' THEN 1 ELSE 0 END,
      next_due_at = ?`).run(now)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      sqlite.prepare(`UPDATE maintenance_jobs SET next_due_at = ?, backoff_until = NULL,
        lease_owner = NULL, lease_expires_at = NULL WHERE job_key = 'event-completion'`).run(now)
      const outcome = await runMaintenance(dependencies(db, now), { trigger: 'local-test' })
      expect(outcome.status).toBe('failed')
      if (attempt === 1) {
        expect(sqlite.prepare(`SELECT consecutive_failures, backoff_until FROM maintenance_jobs
          WHERE job_key = 'event-completion'`).get()).toEqual({
          consecutive_failures: 1, backoff_until: '2026-08-13T12:05:00.000Z',
        })
      }
    }

    expect(sqlite.prepare(`SELECT enabled, consecutive_failures, circuit_state FROM maintenance_jobs
      WHERE job_key = 'event-completion'`).get()).toEqual({
      enabled: 1, consecutive_failures: 5, circuit_state: 'open',
    })
    expect(sqlite.prepare(`SELECT alert_type, severity, occurrence_count, status, summary,
      maintenance_run_id IS NOT NULL attributed_run, rule_version, actor_label FROM automation_alerts
      WHERE coalescing_key = 'job-failure:event-completion'`).get()).toEqual({
      alert_type: 'circuit-open', severity: 'critical', occurrence_count: 5, status: 'open',
      summary: 'A maintenance job circuit opened after repeated bounded failures.',
      attributed_run: 1, rule_version: 'event-completion-v1', actor_label: 'Automation: event-completion-v1',
    })

    await resetMaintenanceJobCircuit(db, {
      jobKey: 'event-completion', reason: 'The invalid organizer time zone was corrected.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
    })
    expect(sqlite.prepare(`SELECT enabled, consecutive_failures, circuit_state, backoff_until, next_due_at
      FROM maintenance_jobs WHERE job_key = 'event-completion'`).get()).toEqual({
      enabled: 1, consecutive_failures: 0, circuit_state: 'closed', backoff_until: null, next_due_at: now,
    })
    expect(sqlite.prepare(`SELECT action, reason, operator_tenure_id FROM content_audit_events
      WHERE stable_scope_id = 'automation-job:event-completion' ORDER BY id DESC LIMIT 1`).get()).toEqual({
      action: 'automation job circuit reset', reason: 'The invalid organizer time zone was corrected.',
      operator_tenure_id: 1,
    })
  })

  test('records scheduler-overdue and backlog alerts from bounded work evidence', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    const outposts = sqlite.prepare("SELECT outpost_id FROM outpost_lifecycle WHERE state = 'verified' ORDER BY outpost_id LIMIT 2")
      .all() as Array<{ outpost_id: string }>
    expect(outposts).toHaveLength(2)
    const setDue = sqlite.prepare(`UPDATE outpost_lifecycle SET next_verification_due_at = '2026-08-01T00:00:00.000Z',
      grace_ends_at = '2026-08-31T00:00:00.000Z' WHERE outpost_id = ?`)
    for (const outpost of outposts) setDue.run(outpost.outpost_id)
    sqlite.prepare(`UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'listing-lifecycle' THEN 1 ELSE 0 END,
      interval_seconds = 3600, batch_size = 1,
      next_due_at = '2026-08-13T09:00:00.000Z'`).run()

    const outcome = await runMaintenance(dependencies(db, now), { trigger: 'local-test' })
    expect(outcome).toMatchObject({ status: 'succeeded', jobsClaimed: 1, actionsApplied: 1 })
    expect(sqlite.prepare(`SELECT alert_type, severity, occurrence_count FROM automation_alerts
      ORDER BY alert_type`).all()).toEqual([
      { alert_type: 'backlog-threshold', severity: 'warning', occurrence_count: 1 },
      { alert_type: 'scheduler-overdue', severity: 'warning', occurrence_count: 1 },
    ])
  })

  test('aggregates and prunes only expired routine detail in bounded batches', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    activateOperator(sqlite)
    const source = sqlite.prepare('SELECT id FROM source_documents ORDER BY id LIMIT 1').get() as { id: string }
    sqlite.prepare("UPDATE source_documents SET url = 'https://updates.example.test/source' WHERE id = ?").run(source.id)
    await approveSourceMonitor(db, {
      sourceDocumentId: source.id, mode: 'bounded-fingerprint', intervalSeconds: 86400,
      maximumResponseBytes: 65536, maximumRedirects: 0, reason: 'Safe fixture check.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
    })
    sqlite.prepare(`INSERT INTO maintenance_runs
      (id, trigger_type, dispatcher_rule_version, status, started_at, completed_at, outcome_json)
      VALUES ('old-run', 'local-test', 'maintenance-dispatcher-v1', 'succeeded',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z', '{"jobsClaimed":1}')`).run()
    sqlite.prepare(`INSERT INTO automated_source_observations
      (id, source_document_id, maintenance_run_id, observed_at, status_class, redirect_outcome,
       mime_family, bounded_byte_count, duration_bucket, outcome, retained_until)
      VALUES ('old-observation', ?, 'old-run', '2026-01-01T00:00:00.000Z', '2xx', 'none',
        'text', 10, 'under-250ms', 'unchanged', '2026-04-01T00:00:00.000Z')`).run(source.id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'maintenance-history-retention' THEN 1 ELSE 0 END, next_due_at = ?, batch_size = 10")
      .run(now)

    const outcome = await runMaintenance(dependencies(db, now), { trigger: 'local-test' })
    expect(outcome.actionsApplied).toBeGreaterThan(0)
    expect(sqlite.prepare("SELECT COUNT(*) count FROM automated_source_observations WHERE id = 'old-observation'").get())
      .toEqual({ count: 0 })
    expect(sqlite.prepare("SELECT outcome_json FROM maintenance_runs WHERE id = 'old-run'").get())
      .toEqual({ outcome_json: null })
    expect(sqlite.prepare(`SELECT SUM(pruned_observations) observations, SUM(pruned_run_details) runs
      FROM maintenance_daily_aggregates`).get()).toEqual({ observations: 1, runs: 1 })
    expect(sqlite.prepare(`SELECT action, actor_label FROM system_maintenance_events
      WHERE target_type = 'maintenance-history'`).get()).toEqual({
      action: 'routine-maintenance-detail-pruned', actor_label: 'Automation: maintenance-history-retention-v1',
    })
  })
})
