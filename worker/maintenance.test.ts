import { afterEach, describe, expect, test } from 'vitest'
import { runMaintenance } from './maintenance'
import { approveSourceMonitor } from './maintenance-operations'
import { createMigratedD1 } from './test-sqlite-d1'

const openDatabases: Array<ReturnType<typeof createMigratedD1>> = []

afterEach(() => {
  while (openDatabases.length) openDatabases.pop()?.close()
})

function database() {
  const migrated = createMigratedD1()
  openDatabases.push(migrated)
  return migrated
}

describe('maintenance dispatcher', () => {
  test('keeps deterministic rules idle just before their boundary, applies at boundary, and replays safely after', async () => {
    const { db, sqlite } = database()
    const boundary = '2026-08-13T12:00:00.000Z'
    let currentNow = '2026-08-13T11:59:59.999Z'
    const outpost = sqlite.prepare("SELECT outpost_id FROM outpost_lifecycle WHERE state = 'verified' ORDER BY outpost_id LIMIT 1")
      .get() as { outpost_id: string }
    const event = sqlite.prepare(`SELECT occurrence.content_id FROM event_occurrences occurrence
      JOIN content_records content ON content.id = occurrence.content_id
      WHERE content.status = 'published' ORDER BY occurrence.content_id LIMIT 1`).get() as { content_id: string }
    sqlite.prepare('UPDATE outpost_lifecycle SET next_verification_due_at = ?, grace_ends_at = ? WHERE outpost_id = ?')
      .run(boundary, '2026-09-12T12:00:00.000Z', outpost.outpost_id)
    sqlite.prepare(`UPDATE event_occurrences SET start_date = '2026-08-13', end_date = '2026-08-13',
      end_time = '08:00', time_zone = 'America/New_York', all_day = 0, lifecycle_status = 'confirmed'
      WHERE content_id = ?`).run(event.content_id)
    sqlite.prepare(`INSERT INTO directory_submissions
      (id, reference_code, submission_type, church, city, civil_geography_id, program_groups_text,
       source_url, fcf_activity_status, reply_email, private_notes, identity_fingerprint, state,
       retention_deadline, created_at, updated_at)
      VALUES ('boundary-proposal', 'BOUNDARYPROP1', 'new-listing', 'Boundary Church', 'Austin', 'us-tx', '',
        'https://example.test/boundary', 'not-verified', 'private@example.test', 'private', ?, 'new', ?,
        '2026-02-13T12:00:00.000Z', '2026-02-13T12:00:00.000Z')`).run('d'.repeat(64), boundary)
    sqlite.prepare("INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-01-01T00:00:00.000Z')").run()
    sqlite.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Operator',
      verified_email = 'operator@example.test', active_tenure_number = 1, eligibility_confirmed = 1,
      eligibility_confirmed_at = '2026-01-01T00:00:00.000Z', attestation_version = 'test-v1',
      activated_at = '2026-01-01T00:00:00.000Z', renewal_due_at = '2030-01-01T00:00:00.000Z', version = 1
      WHERE singleton_key = 1`).run()
    sqlite.prepare(`INSERT INTO operator_transfers
      (id, predecessor_tenure_number, initiation_kind, successor_display_name, successor_email,
       acceptance_token_hash, created_at, expires_at, state, request_id)
      VALUES ('boundary-transfer', 1, 'operator', 'Successor', 'successor@example.test', ?,
        '2026-08-06T12:00:00.000Z', ?, 'pending', 'boundary-transfer-request')`).run('e'.repeat(64), boundary)
    sqlite.prepare(`INSERT INTO operator_reauthentication_intents
      (token_hash, tenure_number, intended_action, created_at, expires_at)
      VALUES (?, 1, 'settings', '2026-08-13T11:40:00.000Z', ?)`).run('f'.repeat(64), boundary)
    sqlite.prepare(`UPDATE maintenance_jobs SET enabled = CASE WHEN job_key IN
      ('listing-lifecycle', 'proposal-retention', 'event-completion', 'security-intent-cleanup') THEN 1 ELSE 0 END,
      next_due_at = ?`).run(currentNow)
    let id = 0
    const dependencies = {
      db, now: () => new Date(currentNow), createId: () => `boundary-test-${++id}`,
      fetch: async () => { throw new Error('network must not be used') },
    }

    expect((await runMaintenance(dependencies, { trigger: 'local-test' })).actionsApplied).toBe(0)
    expect(sqlite.prepare('SELECT state FROM outpost_lifecycle WHERE outpost_id = ?').get(outpost.outpost_id)).toEqual({ state: 'verified' })
    expect(sqlite.prepare("SELECT state FROM directory_submissions WHERE id = 'boundary-proposal'").get()).toEqual({ state: 'new' })
    expect(sqlite.prepare('SELECT lifecycle_status FROM event_occurrences WHERE content_id = ?').get(event.content_id)).toEqual({ lifecycle_status: 'confirmed' })
    expect(sqlite.prepare("SELECT state FROM operator_transfers WHERE id = 'boundary-transfer'").get()).toEqual({ state: 'pending' })

    currentNow = boundary
    sqlite.prepare('UPDATE maintenance_jobs SET next_due_at = ? WHERE enabled = 1').run(currentNow)
    expect((await runMaintenance(dependencies, { trigger: 'local-test' })).actionsApplied).toBe(5)
    expect(sqlite.prepare('SELECT state FROM outpost_lifecycle WHERE outpost_id = ?').get(outpost.outpost_id)).toEqual({ state: 'grace' })
    expect(sqlite.prepare("SELECT state FROM directory_submissions WHERE id = 'boundary-proposal'").get()).toEqual({ state: 'pii-scrubbed' })
    expect(sqlite.prepare('SELECT lifecycle_status FROM event_occurrences WHERE content_id = ?').get(event.content_id)).toEqual({ lifecycle_status: 'completed' })
    expect(sqlite.prepare("SELECT state FROM operator_transfers WHERE id = 'boundary-transfer'").get()).toEqual({ state: 'expired' })

    currentNow = '2026-08-13T12:00:00.001Z'
    sqlite.prepare('UPDATE maintenance_jobs SET next_due_at = ? WHERE enabled = 1').run(currentNow)
    expect((await runMaintenance(dependencies, { trigger: 'local-test' })).actionsApplied).toBe(0)
    expect(sqlite.prepare(`SELECT COUNT(*) count FROM system_maintenance_events
      WHERE target_id IN (?, 'boundary-proposal', 'boundary-transfer') OR target_id LIKE 'tenure-1:%'`)
      .get(outpost.outpost_id)).toEqual({ count: 4 })
  })

  test('enters Listing Verification grace at the exact due time and is replay-safe', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    const outpost = sqlite.prepare("SELECT outpost_id FROM outpost_lifecycle WHERE state = 'verified' ORDER BY outpost_id LIMIT 1")
      .get() as { outpost_id: string }
    sqlite.prepare(`UPDATE outpost_lifecycle SET next_verification_due_at = ?, grace_ends_at = ?
      WHERE outpost_id = ?`).run(now, '2026-09-12T12:00:00.000Z', outpost.outpost_id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'listing-lifecycle' THEN 1 ELSE 0 END, next_due_at = ?")
      .run(now)

    let id = 0
    const dependencies = {
      db,
      now: () => new Date(now),
      createId: () => `maintenance-test-${++id}`,
      fetch: async () => { throw new Error('network must not be used') },
    }

    const first = await runMaintenance(dependencies, { trigger: 'local-test' })
    expect(first).toMatchObject({ jobsClaimed: 1, actionsApplied: 1, failedTasks: 0 })
    expect(sqlite.prepare('SELECT state FROM outpost_lifecycle WHERE outpost_id = ?').get(outpost.outpost_id))
      .toEqual({ state: 'grace' })
    expect(sqlite.prepare('SELECT COUNT(*) count FROM public_eligible_outposts WHERE content_id = ?').get(outpost.outpost_id))
      .toEqual({ count: 1 })

    sqlite.prepare("UPDATE maintenance_jobs SET next_due_at = ?, lease_owner = NULL, lease_expires_at = NULL WHERE job_key = 'listing-lifecycle'")
      .run(now)
    await runMaintenance(dependencies, { trigger: 'local-test' })
    expect(sqlite.prepare(`SELECT COUNT(*) count FROM system_maintenance_events
      WHERE target_id = ? AND action = 'listing-entered-grace'`).get(outpost.outpost_id))
      .toEqual({ count: 1 })
  })

  test('scrubs proposal PII at the exact retention deadline without audit leakage', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    sqlite.prepare(`INSERT INTO directory_submissions
      (id, reference_code, submission_type, church, city, civil_geography_id,
       program_groups_text, source_url, fcf_activity_status, reply_email, private_notes,
       identity_fingerprint, state, retention_deadline, created_at, updated_at)
      VALUES ('retention-test', 'RETENTIONTEST01', 'new-listing', 'Test Church', 'Test City', 'us-tx',
        '', 'https://example.test/outpost', 'not-verified', 'private@example.test', 'private note',
        ?, 'new', ?, '2026-02-13T12:00:00.000Z', '2026-02-13T12:00:00.000Z')`)
      .run('a'.repeat(64), now)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'proposal-retention' THEN 1 ELSE 0 END, next_due_at = ?")
      .run(now)

    let id = 0
    const result = await runMaintenance({
      db, now: () => new Date(now), createId: () => `proposal-test-${++id}`,
      fetch: async () => { throw new Error('network must not be used') },
    }, { trigger: 'local-test' })

    expect(result.actionsApplied).toBe(1)
    expect(sqlite.prepare(`SELECT state, reply_email, private_notes, pii_scrubbed_at
      FROM directory_submissions WHERE id = 'retention-test'`).get()).toEqual({
      state: 'pii-scrubbed', reply_email: null, private_notes: null, pii_scrubbed_at: now,
    })
    const evidence = sqlite.prepare(`SELECT before_state_json, after_state_json FROM system_maintenance_events
      WHERE target_id = 'retention-test'`).get() as { before_state_json: string; after_state_json: string }
    expect(`${evidence.before_state_json}${evidence.after_state_json}`).not.toContain('private@example.test')
    expect(`${evidence.before_state_json}${evidence.after_state_json}`).not.toContain('private note')
  })

  test('completes an eligible timed Event at its organizer-local end time', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T16:00:00.000Z'
    const event = sqlite.prepare(`SELECT occurrence.content_id, content.version
      FROM event_occurrences occurrence JOIN content_records content ON content.id = occurrence.content_id
      WHERE content.status = 'published' ORDER BY occurrence.content_id LIMIT 1`).get() as {
      content_id: string; version: number
    }
    sqlite.prepare(`UPDATE event_occurrences SET start_date = '2026-08-13', end_date = '2026-08-13',
      start_time = '10:00', end_time = '12:00', time_zone = 'America/New_York', all_day = 0,
      lifecycle_status = 'confirmed' WHERE content_id = ?`).run(event.content_id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'event-completion' THEN 1 ELSE 0 END, next_due_at = ?")
      .run(now)

    let id = 0
    const result = await runMaintenance({
      db, now: () => new Date(now), createId: () => `event-test-${++id}`,
      fetch: async () => { throw new Error('network must not be used') },
    }, { trigger: 'local-test' })

    expect(result.actionsApplied).toBe(1)
    expect(sqlite.prepare('SELECT lifecycle_status FROM event_occurrences WHERE content_id = ?').get(event.content_id))
      .toEqual({ lifecycle_status: 'completed' })
    expect(sqlite.prepare('SELECT status FROM content_records WHERE id = ?').get(event.content_id))
      .toEqual({ status: 'published' })
    expect(sqlite.prepare(`SELECT actor_label, automation_run_id, automation_rule_version
      FROM content_revisions WHERE content_id = ? AND version = ?`).get(event.content_id, event.version + 1))
      .toMatchObject({ actor_label: 'Automation: event-completion-v1', automation_rule_version: 'event-completion-v1' })
  })

  test('completes an all-day Event only when the next organizer-local date begins and preserves cancelled Events', async () => {
    const { db, sqlite } = database()
    let currentNow = '2026-08-14T03:59:59.999Z'
    const events = sqlite.prepare(`SELECT occurrence.content_id FROM event_occurrences occurrence
      JOIN content_records content ON content.id = occurrence.content_id
      WHERE content.status = 'published' ORDER BY occurrence.content_id LIMIT 2`).all() as Array<{ content_id: string }>
    expect(events).toHaveLength(2)
    sqlite.prepare(`UPDATE event_occurrences SET start_date = '2026-08-13', end_date = '2026-08-13',
      start_time = NULL, end_time = NULL, time_zone = 'America/New_York', all_day = 1,
      lifecycle_status = 'scheduled' WHERE content_id = ?`).run(events[0].content_id)
    sqlite.prepare(`UPDATE event_occurrences SET start_date = '2026-08-13', end_date = '2026-08-13',
      start_time = NULL, end_time = NULL, time_zone = 'America/New_York', all_day = 1,
      lifecycle_status = 'cancelled' WHERE content_id = ?`).run(events[1].content_id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'event-completion' THEN 1 ELSE 0 END, next_due_at = ?")
      .run(currentNow)
    let id = 0
    const dependencies = {
      db, now: () => new Date(currentNow), createId: () => `all-day-event-${++id}`,
      fetch: async () => { throw new Error('network must not be used') },
    }

    await runMaintenance(dependencies, { trigger: 'local-test' })
    expect(sqlite.prepare('SELECT lifecycle_status FROM event_occurrences WHERE content_id = ?').get(events[0].content_id))
      .toEqual({ lifecycle_status: 'scheduled' })

    currentNow = '2026-08-14T04:00:00.000Z'
    sqlite.prepare("UPDATE maintenance_jobs SET next_due_at = ? WHERE job_key = 'event-completion'").run(currentNow)
    await runMaintenance(dependencies, { trigger: 'local-test' })
    expect(sqlite.prepare('SELECT lifecycle_status FROM event_occurrences WHERE content_id = ?').get(events[0].content_id))
      .toEqual({ lifecycle_status: 'completed' })
    expect(sqlite.prepare('SELECT lifecycle_status FROM event_occurrences WHERE content_id = ?').get(events[1].content_id))
      .toEqual({ lifecycle_status: 'cancelled' })
  })

  test('expires transfer and reauthentication secrets without changing the active Operator', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    sqlite.prepare("INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-01-01T00:00:00.000Z')").run()
    sqlite.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Operator',
      verified_email = 'operator@example.test', active_tenure_number = 1, eligibility_confirmed = 1,
      eligibility_confirmed_at = '2026-01-01T00:00:00.000Z', attestation_version = 'test-v1',
      activated_at = '2026-01-01T00:00:00.000Z', renewal_due_at = '2030-01-01T00:00:00.000Z', version = 1
      WHERE singleton_key = 1`).run()
    sqlite.prepare(`INSERT INTO operator_transfers
      (id, predecessor_tenure_number, initiation_kind, successor_display_name, successor_email,
       acceptance_token_hash, created_at, expires_at, state, request_id)
      VALUES ('expired-transfer', 1, 'operator', 'Successor', 'successor@example.test', ?,
        '2026-08-06T12:00:00.000Z', ?, 'pending', 'expired-transfer-request')`)
      .run('b'.repeat(64), now)
    sqlite.prepare(`INSERT INTO operator_reauthentication_intents
      (token_hash, tenure_number, intended_action, created_at, expires_at)
      VALUES (?, 1, 'settings', '2026-08-13T11:40:00.000Z', ?)`)
      .run('c'.repeat(64), now)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'security-intent-cleanup' THEN 1 ELSE 0 END, next_due_at = ?")
      .run(now)

    let id = 0
    const result = await runMaintenance({
      db, now: () => new Date(now), createId: () => `security-test-${++id}`,
      fetch: async () => { throw new Error('network must not be used') },
    }, { trigger: 'local-test' })

    expect(result.actionsApplied).toBe(2)
    expect(sqlite.prepare(`SELECT state, successor_display_name, successor_email, acceptance_token_hash
      FROM operator_transfers WHERE id = 'expired-transfer'`).get()).toEqual({
      state: 'expired', successor_display_name: null, successor_email: null, acceptance_token_hash: null,
    })
    expect(sqlite.prepare('SELECT state, active_tenure_number, verified_email FROM operator_account WHERE singleton_key = 1').get())
      .toEqual({ state: 'active', active_tenure_number: 1, verified_email: 'operator@example.test' })
    expect(sqlite.prepare('SELECT COUNT(*) count FROM operator_reauthentication_intents').get()).toEqual({ count: 0 })
    expect(sqlite.prepare('SELECT ended_at FROM operator_tenures WHERE tenure_number = 1').get()).toEqual({ ended_at: null })
  })

  test('records a first source fingerprint as a baseline without reverifying any fact', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    sqlite.prepare("INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-01-01T00:00:00.000Z')").run()
    sqlite.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Operator',
      verified_email = 'operator@example.test', active_tenure_number = 1, eligibility_confirmed = 1,
      eligibility_confirmed_at = '2026-01-01T00:00:00.000Z', attestation_version = 'test-v1',
      activated_at = '2026-01-01T00:00:00.000Z', renewal_due_at = '2030-01-01T00:00:00.000Z', version = 1
      WHERE singleton_key = 1`).run()
    const provenance = sqlite.prepare(`SELECT provenance.id, provenance.source_document_id, provenance.verified_at
      FROM field_provenance provenance ORDER BY provenance.id LIMIT 1`).get() as {
      id: string; source_document_id: string; verified_at: string
    }
    sqlite.prepare("UPDATE source_documents SET url = 'https://updates.example.test/source' WHERE id = ?")
      .run(provenance.source_document_id)
    await approveSourceMonitor(db, {
      sourceDocumentId: provenance.source_document_id, mode: 'bounded-fingerprint', intervalSeconds: 86400,
      maximumResponseBytes: 65536, maximumRedirects: 1, reason: 'Fixture source is safe for a low-rate check.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
    })
    sqlite.prepare('UPDATE approved_source_monitors SET enabled = 1, next_due_at = ? WHERE source_document_id = ?')
      .run(now, provenance.source_document_id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'source-monitoring' THEN 1 ELSE 0 END, next_due_at = ?")
      .run(now)
    const requests: Array<{ url: string; headers: Headers }> = []
    const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) })
      return new Response('first bounded fixture body', {
        status: 200, headers: { 'content-type': 'text/html; charset=utf-8', etag: '"fixture-v1"' },
      })
    }
    let id = 0
    await runMaintenance({
      db, now: () => new Date(now), createId: () => `source-test-${++id}`,
      fetch: fakeFetch as typeof fetch,
    }, { trigger: 'local-test' })

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://updates.example.test/source')
    expect(requests[0].headers.has('authorization')).toBe(false)
    expect(requests[0].headers.has('cookie')).toBe(false)
    expect(sqlite.prepare(`SELECT outcome, bounded_byte_count, error_category
      FROM automated_source_observations WHERE source_document_id = ?`).get(provenance.source_document_id))
      .toEqual({ outcome: 'baseline', bounded_byte_count: 26, error_category: null })
    expect(sqlite.prepare('SELECT verified_at FROM field_provenance WHERE id = ?').get(provenance.id))
      .toEqual({ verified_at: provenance.verified_at })
    expect(sqlite.prepare('SELECT COUNT(*) count FROM automated_update_candidates').get()).toEqual({ count: 0 })
    const stored = JSON.stringify(sqlite.prepare(`SELECT * FROM automated_source_observations
      WHERE source_document_id = ?`).get(provenance.source_document_id))
    expect(stored).not.toContain('first bounded fixture body')
  })

  test('uses conditional requests and coalesces a changed source into one review-only candidate', async () => {
    const { db, sqlite } = database()
    let currentNow = '2026-08-13T12:00:00.000Z'
    sqlite.prepare("INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-01-01T00:00:00.000Z')").run()
    sqlite.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Operator',
      verified_email = 'operator@example.test', active_tenure_number = 1, eligibility_confirmed = 1,
      eligibility_confirmed_at = '2026-01-01T00:00:00.000Z', attestation_version = 'test-v1',
      activated_at = '2026-01-01T00:00:00.000Z', renewal_due_at = '2030-01-01T00:00:00.000Z', version = 1
      WHERE singleton_key = 1`).run()
    const provenance = sqlite.prepare(`SELECT provenance.id, provenance.content_id,
      provenance.source_document_id, provenance.verified_at, content.version
      FROM field_provenance provenance JOIN content_records content ON content.id = provenance.content_id
      ORDER BY provenance.id LIMIT 1`).get() as {
      id: string; content_id: string; source_document_id: string; verified_at: string; version: number
    }
    sqlite.prepare("UPDATE source_documents SET url = 'https://updates.example.test/source' WHERE id = ?")
      .run(provenance.source_document_id)
    await approveSourceMonitor(db, {
      sourceDocumentId: provenance.source_document_id, mode: 'bounded-fingerprint', intervalSeconds: 86400,
      maximumResponseBytes: 65536, maximumRedirects: 1, reason: 'Fixture source is safe for a low-rate check.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now: currentNow,
    })
    sqlite.prepare('UPDATE approved_source_monitors SET enabled = 1, next_due_at = ? WHERE source_document_id = ?')
      .run(currentNow, provenance.source_document_id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'source-monitoring' THEN 1 ELSE 0 END, next_due_at = ?")
      .run(currentNow)
    let requestNumber = 0
    const conditionalHeaders: Array<string | null> = []
    const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestNumber += 1
      conditionalHeaders.push(new Headers(init?.headers).get('if-none-match'))
      if (requestNumber === 2) return new Response(null, { status: 304 })
      const changed = requestNumber >= 3
      return new Response(changed ? 'fixture version two' : 'fixture version one', {
        status: 200, headers: { 'content-type': 'text/plain', etag: changed ? '"fixture-v2"' : '"fixture-v1"' },
      })
    }
    let id = 0
    const run = async () => {
      await runMaintenance({
        db, now: () => new Date(currentNow), createId: () => `change-test-${++id}`,
        fetch: fakeFetch as typeof fetch,
      }, { trigger: 'local-test' })
      currentNow = new Date(Date.parse(currentNow) + 60_000).toISOString()
      sqlite.prepare(`UPDATE maintenance_jobs SET next_due_at = ?, lease_owner = NULL, lease_expires_at = NULL
        WHERE job_key = 'source-monitoring'`).run(currentNow)
      sqlite.prepare(`UPDATE approved_source_monitors SET next_due_at = ?, lease_owner = NULL, lease_expires_at = NULL
        WHERE source_document_id = ?`).run(currentNow, provenance.source_document_id)
    }
    await run(); await run(); await run(); await run()

    expect(conditionalHeaders).toEqual([null, '"fixture-v1"', '"fixture-v1"', '"fixture-v2"'])
    expect(sqlite.prepare(`SELECT group_concat(outcome, ',') outcomes FROM
      (SELECT outcome FROM automated_source_observations ORDER BY observed_at, id)`).get()).toEqual({
      outcomes: 'baseline,unchanged,changed,unchanged',
    })
    expect(sqlite.prepare(`SELECT state, proposed_values_json, adapter_version
      FROM automated_update_candidates WHERE source_document_id = ?`).get(provenance.source_document_id))
      .toEqual({ state: 'open', proposed_values_json: null, adapter_version: 'review-only-v1' })
    expect(sqlite.prepare('SELECT COUNT(*) count FROM automated_update_candidates').get()).toEqual({ count: 1 })
    expect(sqlite.prepare(`SELECT COUNT(*) count FROM system_maintenance_events
      WHERE target_type = 'source-monitor' AND target_id = ?
        AND action = 'source-monitor-technical-check-succeeded'
        AND rule_version = 'source-monitoring-v1'
        AND actor_label = 'Automation: source-monitoring-v1'`).get(provenance.source_document_id))
      .toEqual({ count: 4 })
    const candidateEvidence = sqlite.prepare(`SELECT affected_field_count, affected_fields_truncated,
      prior_public_values_json FROM automated_update_candidates`).get() as {
      affected_field_count: number; affected_fields_truncated: number; prior_public_values_json: string
    }
    expect(candidateEvidence.affected_field_count).toBeGreaterThan(0)
    expect(candidateEvidence.affected_fields_truncated).toBe(0)
    expect(JSON.parse(candidateEvidence.prior_public_values_json)).not.toContainEqual(
      expect.objectContaining({ fieldPath: 'record', value: null }),
    )
    expect(sqlite.prepare('SELECT verified_at FROM field_provenance WHERE id = ?').get(provenance.id))
      .toEqual({ verified_at: provenance.verified_at })
    expect(sqlite.prepare('SELECT version, status FROM content_records WHERE id = ?').get(provenance.content_id))
      .toEqual({ version: provenance.version, status: expect.any(String) })
  })

  test('follows at most one validated same-host redirect and stores no redirect URL', async () => {
    const { db, sqlite } = database()
    const now = '2026-08-13T12:00:00.000Z'
    sqlite.prepare("INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-01-01T00:00:00.000Z')").run()
    sqlite.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Operator',
      verified_email = 'operator@example.test', active_tenure_number = 1, eligibility_confirmed = 1,
      eligibility_confirmed_at = '2026-01-01T00:00:00.000Z', attestation_version = 'test-v1',
      activated_at = '2026-01-01T00:00:00.000Z', renewal_due_at = '2030-01-01T00:00:00.000Z', version = 1
      WHERE singleton_key = 1`).run()
    const source = sqlite.prepare('SELECT id FROM source_documents ORDER BY id LIMIT 1').get() as { id: string }
    sqlite.prepare("UPDATE source_documents SET url = 'https://updates.example.test/source' WHERE id = ?").run(source.id)
    await approveSourceMonitor(db, {
      sourceDocumentId: source.id, mode: 'bounded-fingerprint', intervalSeconds: 86400,
      maximumResponseBytes: 65536, maximumRedirects: 1, reason: 'Safe fixture check.',
      actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
    })
    sqlite.prepare('UPDATE approved_source_monitors SET enabled = 1, next_due_at = ? WHERE source_document_id = ?').run(now, source.id)
    sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'source-monitoring' THEN 1 ELSE 0 END, next_due_at = ?").run(now)
    const targets: string[] = []
    let attempt = 0
    const fakeFetch = async (input: RequestInfo | URL) => {
      targets.push(String(input)); attempt += 1
      return attempt === 1
        ? new Response(null, { status: 302, headers: { location: '/canonical' } })
        : new Response('redirected fixture', { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    let id = 0
    const result = await runMaintenance({
      db, now: () => new Date(now), createId: () => `redirect-test-${++id}`, fetch: fakeFetch as typeof fetch,
    }, { trigger: 'local-test' })
    expect(result.outboundSubrequests).toBe(2)
    expect(targets).toEqual(['https://updates.example.test/source', 'https://updates.example.test/canonical'])
    expect(sqlite.prepare('SELECT redirect_outcome, outcome FROM automated_source_observations').get())
      .toEqual({ redirect_outcome: 'same-host', outcome: 'baseline' })
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM automated_source_observations').get()))
      .not.toContain('/canonical')
  })

  test('sanitizes source failures and never changes public facts', async () => {
    const scenarios: Array<{ category: string; response: () => Promise<Response> }> = [
      { category: 'redirect-blocked', response: async () => new Response(null, { status: 302, headers: { location: 'https://other.example.test/source' } }) },
      { category: 'oversized', response: async () => new Response('discard me', { status: 200, headers: { 'content-type': 'text/plain', 'content-length': '70000' } }) },
      { category: 'unsupported-mime', response: async () => new Response('discard me', { status: 200, headers: { 'content-type': 'application/zip' } }) },
      { category: 'timeout', response: async () => { throw new DOMException('Aborted', 'AbortError') } },
      { category: 'dns', response: async () => { throw new Error('DNS resolution failed') } },
      { category: 'unauthorized', response: async () => new Response('discard me', { status: 401 }) },
      { category: 'forbidden', response: async () => new Response('discard me', { status: 403 }) },
      { category: 'not-found', response: async () => new Response('discard me', { status: 404 }) },
      { category: 'rate-limited', response: async () => new Response('discard me', { status: 429 }) },
      { category: 'server-error', response: async () => new Response('discard me', { status: 503 }) },
    ]
    for (const scenario of scenarios) {
      const { db, sqlite } = database()
      const now = '2026-08-13T12:00:00.000Z'
      sqlite.prepare("INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-01-01T00:00:00.000Z')").run()
      sqlite.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Operator',
        verified_email = 'operator@example.test', active_tenure_number = 1, eligibility_confirmed = 1,
        eligibility_confirmed_at = '2026-01-01T00:00:00.000Z', attestation_version = 'test-v1',
        activated_at = '2026-01-01T00:00:00.000Z', renewal_due_at = '2030-01-01T00:00:00.000Z', version = 1
        WHERE singleton_key = 1`).run()
      const provenance = sqlite.prepare(`SELECT provenance.id, provenance.content_id,
        provenance.source_document_id, provenance.verified_at, content.version, content.status
        FROM field_provenance provenance JOIN content_records content ON content.id = provenance.content_id
        ORDER BY provenance.id LIMIT 1`).get() as {
        id: string; content_id: string; source_document_id: string; verified_at: string
        version: number; status: string
      }
      sqlite.prepare("UPDATE source_documents SET url = 'https://updates.example.test/source' WHERE id = ?")
        .run(provenance.source_document_id)
      await approveSourceMonitor(db, {
        sourceDocumentId: provenance.source_document_id, mode: 'bounded-fingerprint', intervalSeconds: 86400,
        maximumResponseBytes: 65536, maximumRedirects: 1, reason: 'Fixture source is safe for a low-rate check.',
        actor: { tenureNumber: 1, label: 'Operator tenure 1' }, now,
      })
      sqlite.prepare('UPDATE approved_source_monitors SET enabled = 1, next_due_at = ? WHERE source_document_id = ?')
        .run(now, provenance.source_document_id)
      sqlite.prepare("UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'source-monitoring' THEN 1 ELSE 0 END, next_due_at = ?")
        .run(now)
      let id = 0
      const outcome = await runMaintenance({
        db, now: () => new Date(now), createId: () => `${scenario.category}-${++id}`,
        fetch: scenario.response as typeof fetch,
      }, { trigger: 'local-test' })
      expect(outcome.outboundSubrequests, scenario.category).toBe(1)
      expect(sqlite.prepare(`SELECT outcome, error_category FROM automated_source_observations`).get())
        .toEqual({ outcome: 'failed', error_category: scenario.category })
      expect(sqlite.prepare(`SELECT rule_version, actor_label, action FROM system_maintenance_events
        WHERE target_type = 'source-monitor' AND target_id = ?`).get(provenance.source_document_id)).toEqual({
        rule_version: 'source-monitoring-v1', actor_label: 'Automation: source-monitoring-v1',
        action: 'source-monitor-technical-check-failed',
      })
      expect(sqlite.prepare('SELECT verified_at FROM field_provenance WHERE id = ?').get(provenance.id))
        .toEqual({ verified_at: provenance.verified_at })
      expect(sqlite.prepare('SELECT version, status FROM content_records WHERE id = ?').get(provenance.content_id))
        .toEqual({ version: provenance.version, status: provenance.status })
      expect(JSON.stringify(sqlite.prepare('SELECT * FROM automated_source_observations').get())).not.toContain('discard me')
    }
  })
})
