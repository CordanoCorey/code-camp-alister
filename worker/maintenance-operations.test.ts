import { afterEach, describe, expect, test } from 'vitest'
import {
  approveSourceMonitor,
  reviewAutomatedUpdateCandidate,
  reviewAutomationAlert,
  validateApprovedSourceUrl,
} from './maintenance-operations'
import { createMigratedD1 } from './test-sqlite-d1'

const openDatabases: Array<ReturnType<typeof createMigratedD1>> = []
afterEach(() => { while (openDatabases.length) openDatabases.pop()?.close() })

function activeOperatorDatabase() {
  const migrated = createMigratedD1()
  openDatabases.push(migrated)
  migrated.sqlite.prepare("INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-01-01T00:00:00.000Z')").run()
  migrated.sqlite.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Operator',
    verified_email = 'operator@example.test', active_tenure_number = 1, eligibility_confirmed = 1,
    eligibility_confirmed_at = '2026-01-01T00:00:00.000Z', attestation_version = 'test-v1',
    activated_at = '2026-01-01T00:00:00.000Z', renewal_due_at = '2030-01-01T00:00:00.000Z', version = 1
    WHERE singleton_key = 1`).run()
  return migrated
}

describe('Approved Source Monitor operations', () => {
  test.each([
    'http://example.test/source',
    'https://user:password@example.test/source',
    'https://localhost/source',
    'https://127.0.0.1/source',
    'https://[::1]/source',
    'https://source.internal/page',
    'https://example.test:8443/source',
    'https://example.test/source#section',
    'https://example.test/source?token=secret',
    'https://example.test/source?X-Amz-Signature=secret',
  ])('rejects unsafe monitor source %s', async (url) => {
    expect(() => validateApprovedSourceUrl(url)).toThrow()
  })

  test('records exact approval but leaves the Source Monitor disabled', async () => {
    const { db, sqlite } = activeOperatorDatabase()
    sqlite.prepare(`INSERT INTO source_documents (id, url, label, created_at)
      VALUES ('safe-source', 'https://updates.example.test/events?year=2026', 'Safe source',
        '2026-08-13T00:00:00.000Z')`).run()
    await approveSourceMonitor(db, {
      sourceDocumentId: 'safe-source', mode: 'bounded-fingerprint', intervalSeconds: 86400,
      maximumResponseBytes: 131072, maximumRedirects: 1, reason: 'Low-rate technical check approved.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now: '2026-08-13T12:00:00.000Z',
    })
    expect(sqlite.prepare(`SELECT enabled, canonical_hostname, check_mode, adapter_version,
      approved_operator_tenure_id FROM approved_source_monitors WHERE source_document_id = 'safe-source'`).get())
      .toEqual({ enabled: 0, canonical_hostname: 'updates.example.test', check_mode: 'bounded-fingerprint',
        adapter_version: 'review-only-v1', approved_operator_tenure_id: 1 })
  })

  test('preserves tenure-labelled candidate and alert review history', async () => {
    const { db, sqlite } = activeOperatorDatabase()
    const now = '2026-08-13T12:00:00.000Z'
    sqlite.prepare(`INSERT INTO source_documents (id, url, label, created_at)
      VALUES ('review-source', 'https://updates.example.test/review', 'Review source', ?)`).run(now)
    await approveSourceMonitor(db, {
      sourceDocumentId: 'review-source', mode: 'bounded-fingerprint', intervalSeconds: 86400,
      maximumResponseBytes: 65536, maximumRedirects: 0, reason: 'Low-rate technical check approved.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
    })
    sqlite.prepare(`INSERT INTO maintenance_runs
      (id, trigger_type, dispatcher_rule_version, status, started_at, completed_at)
      VALUES ('review-run', 'local-test', 'maintenance-dispatcher-v1', 'succeeded', ?, ?)`).run(now, now)
    sqlite.prepare(`INSERT INTO automated_source_observations
      (id, source_document_id, maintenance_run_id, observed_at, status_class, redirect_outcome,
       mime_family, bounded_byte_count, content_fingerprint, duration_bucket, outcome, retained_until)
      VALUES ('review-observation', 'review-source', 'review-run', ?, '2xx', 'none', 'text', 10,
        ?, 'under-250ms', 'changed', '2027-08-13T12:00:00.000Z')`).run(now, 'a'.repeat(64))
    sqlite.prepare(`INSERT INTO automated_update_candidates
      (id, source_document_id, triggering_observation_id, triggering_run_id, current_fingerprint,
       affected_fields_json, prior_public_values_json, adapter_version, state, created_at, updated_at)
      VALUES ('review-candidate', 'review-source', 'review-observation', 'review-run', ?,
        '[]', '[]', 'review-only-v1', 'open', ?, ?)`).run('b'.repeat(64), now, now)
    sqlite.prepare(`INSERT INTO automation_alerts
      (id, maintenance_run_id, rule_version, actor_label, alert_type, severity,
       job_key, coalescing_key, summary, status, first_seen_at, last_seen_at)
      VALUES ('review-alert', 'review-run', 'listing-lifecycle-v1', 'Automation: listing-lifecycle-v1',
        'scheduler-overdue', 'warning', 'listing-lifecycle',
        'review-alert-key', 'Scheduler is overdue.', 'open', ?, ?)`).run(now, now)
    const actor = { tenureNumber: 1, label: 'Operator tenure 1' }

    await reviewAutomatedUpdateCandidate(db, {
      candidateId: 'review-candidate', action: 'dismiss', reason: 'Operator found no factual change.', actor, now,
    })
    await reviewAutomationAlert(db, {
      alertId: 'review-alert', action: 'acknowledged', reason: 'Operator is investigating.', actor, now,
    })

    expect(sqlite.prepare(`SELECT state, reviewed_operator_tenure_id FROM automated_update_candidates
      WHERE id = 'review-candidate'`).get()).toEqual({ state: 'dismissed', reviewed_operator_tenure_id: 1 })
    expect(sqlite.prepare(`SELECT operator_tenure_id, reason FROM automated_update_candidate_reviews
      WHERE candidate_id = 'review-candidate'`).get()).toEqual({
      operator_tenure_id: 1, reason: 'Operator found no factual change.',
    })
    expect(sqlite.prepare(`SELECT status FROM automation_alerts WHERE id = 'review-alert'`).get())
      .toEqual({ status: 'acknowledged' })
    expect(sqlite.prepare(`SELECT operator_tenure_id, reason FROM automation_alert_reviews
      WHERE alert_id = 'review-alert'`).get()).toEqual({
      operator_tenure_id: 1, reason: 'Operator is investigating.',
    })
  })
})
