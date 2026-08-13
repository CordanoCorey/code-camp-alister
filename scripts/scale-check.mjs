import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { runMaintenance } from '../worker/maintenance.ts'

const temporary = await mkdtemp(join(tmpdir(), 'ranger-outpost-scale-'))
const databasePath = join(temporary, 'scale.sqlite')
const db = new DatabaseSync(databasePath)

function d1Database(sqlite) {
  return {
    prepare(sql) {
      let bindings = []
      const statement = {
        testSql: sql,
        testBindings: bindings,
        bind(...values) { bindings = values; this.testBindings = values; return this },
        async first() { return sqlite.prepare(sql).get(...bindings) ?? null },
        async all() { return { results: sqlite.prepare(sql).all(...bindings) } },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings)
          return { success: true, meta: { changes: Number(result.changes) } }
        },
        testExecute() { sqlite.prepare(sql).run(...bindings) },
      }
      return statement
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        for (const statement of statements) statement.testExecute()
        sqlite.exec('COMMIT')
        return statements.map(() => ({ success: true }))
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function queryPlan(sql, ...bindings) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...bindings).map((row) => String(row.detail))
}

function timed(name, sql, bindings, maximumRows, requiredPlan) {
  const statement = db.prepare(sql)
  for (let index = 0; index < 3; index += 1) statement.all(...bindings)
  const start = performance.now()
  let rows = []
  for (let index = 0; index < 20; index += 1) rows = statement.all(...bindings)
  const averageMilliseconds = (performance.now() - start) / 20
  const plan = queryPlan(sql, ...bindings)
  if (rows.length > maximumRows) throw new Error(`${name} returned ${rows.length} rows; maximum is ${maximumRows}.`)
  if (!plan.some((detail) => detail.includes(requiredPlan))) {
    throw new Error(`${name} did not use ${requiredPlan}: ${plan.join(' | ')}`)
  }
  return {
    name,
    rows: rows.length,
    bytes: Buffer.byteLength(JSON.stringify(rows)),
    averageMilliseconds: Number(averageMilliseconds.toFixed(3)),
    plan,
  }
}

try {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
  for (let number = 1; number <= 12; number += 1) {
    const prefix = String(number).padStart(4, '0')
    const migrationUrl = new URL(`../migrations/${[
      '0001_initial.sql',
      '0002_directory_foundation.sql',
      '0003_outpost_source_freshness.sql',
      '0004_victory_outpost.sql',
      '0005_advancement_library.sql',
      '0006_events_and_freshness.sql',
      '0007_normalized_content_model.sql',
      '0008_operator_lifecycle.sql',
      '0009_us_directory_operations.sql',
      '0010_automated_data_maintenance.sql',
      '0011_ordinary_adult_accounts.sql',
      '0012_ordinary_account_lifecycle.sql',
    ][number - 1]}`, import.meta.url)
    if (!migrationUrl.pathname.includes(prefix)) throw new Error(`Migration ordering failed at ${prefix}.`)
    db.exec(await readFile(migrationUrl, 'utf8'))
  }

  const district = db.prepare("SELECT id FROM organization_units WHERE unit_type = 'district' ORDER BY id LIMIT 1").get().id
  const region = db.prepare("SELECT id FROM organization_units WHERE unit_type = 'region' ORDER BY id LIMIT 1").get().id
  const programGroup = db.prepare("SELECT content_id FROM advancement_items WHERE subtype = 'program-group' ORDER BY content_id LIMIT 1").get().content_id
  const sourceDocument = 'document-scale-000'
  const sourceDocumentInsert = db.prepare(`INSERT INTO source_documents (id, url, label, created_at)
    VALUES (?, ?, ?, '2026-08-12T00:00:00.000Z')`)
  for (let index = 0; index < 400; index += 1) {
    const suffix = String(index).padStart(3, '0')
    sourceDocumentInsert.run(`document-scale-${suffix}`, `https://example.test/scale-directory/${suffix}`,
      `Synthetic deduplicated scale source ${suffix}`)
  }
  db.exec(`INSERT INTO operator_tenures (tenure_number, started_at) VALUES (1, '2026-08-12T00:00:00.000Z');
    INSERT INTO operator_adult_eligibility
      (tenure_number, confirmed, confirmed_at, attestation_version)
      VALUES (1, 1, '2026-08-12T00:00:00.000Z', 'operator-adult-v1');
    UPDATE operator_account SET state = 'active', display_name = 'Synthetic scale Operator',
      verified_email = 'scale-operator@example.test', active_tenure_number = 1,
      eligibility_confirmed = 1, eligibility_confirmed_at = '2026-08-12T00:00:00.000Z',
      attestation_version = 'operator-adult-v1', activated_at = '2026-08-12T00:00:00.000Z',
      renewal_due_at = '2027-08-12T00:00:00.000Z', version = 1 WHERE singleton_key = 1;`)

  const content = db.prepare(`INSERT INTO content_records
    (id, kind, slug, title, summary, status, details_json, verified_at, published_at, updated_at, version)
    VALUES (?, 'outpost', ?, ?, 'Synthetic scale-only outpost.', 'published', '{}', ?, ?, ?, 1)`)
  const outpost = db.prepare(`INSERT INTO outposts
    (content_id, hub_outpost_id, national_program_id, external_number, campus_suffix, church,
     city, civil_geography_id, fcf_activity_status)
    VALUES (?, ?, 'rr-usa', ?, ?, ?, ?, ?, ?)`)
  const affiliation = db.prepare(`INSERT INTO outpost_affiliations
    (outpost_id, organization_id, affiliation_type) VALUES (?, ?, ?)`)
  const program = db.prepare(`INSERT INTO outpost_program_groups
    (outpost_id, program_group_id, display_order) VALUES (?, ?, 0)`)
  const provenance = db.prepare(`INSERT INTO field_provenance
    (id, content_id, field_path, source_document_id, source_label, verified_at)
    VALUES (?, ?, 'church', ?, 'Synthetic scale fixture', ?)`)
  const lifecycle = db.prepare(`INSERT INTO outpost_lifecycle
    (outpost_id, state, last_verified_at, next_verification_due_at, grace_ends_at, version, updated_at)
    VALUES (?, 'verified', ?, '2027-08-12T00:00:00.000Z', '2027-09-11T00:00:00.000Z', 1,
      '2026-08-12T00:00:00.000Z')`)
  const verification = db.prepare(`INSERT INTO listing_verification_cycles
    (id, outpost_id, cycle_number, verified_at, next_due_at, grace_ends_at, outcome, reason,
     operator_tenure_id, created_at)
    VALUES (?, ?, 1, ?, '2027-08-12T00:00:00.000Z', '2027-09-11T00:00:00.000Z',
      'verified', 'Synthetic scale fixture', 1, '2026-08-12T00:00:00.000Z')`)
  const verificationProvenance = db.prepare(`INSERT INTO listing_verification_provenance
    (verification_cycle_id, provenance_id, source_document_id, field_path, source_label, source_url, verified_at)
    VALUES (?, ?, ?, 'church', 'Synthetic scale fixture', 'https://example.test/scale-directory', ?)`)
  const directory = db.prepare(`INSERT INTO public_outpost_directory
    (content_id, title_sort, church_sort, national_program_id, external_number, campus_suffix,
     city, civil_geography_id, fcf_activity_status, verified_at)
    VALUES (?, ?, ?, 'rr-usa', ?, ?, ?, ?, ?, ?)`)
  const search = db.prepare(`INSERT INTO public_search_documents
    (content_id, kind, title, summary, safe_text)
    VALUES (?, 'outpost', ?, 'Synthetic scale-only outpost.', ?)`)

  db.exec('BEGIN IMMEDIATE')
  for (let index = 0; index < 20_000; index += 1) {
    const suffix = String(index).padStart(5, '0')
    const id = `scale-outpost-${suffix}`
    const title = `Synthetic Community ${suffix}`
    const church = `Synthetic Church ${suffix}`
    const city = index % 2 === 0 ? 'Austin' : 'Los Angeles'
    const civil = index % 2 === 0 ? 'us-tx' : 'us-ca'
    const fcf = index % 3 === 0 ? 'yes' : index % 3 === 1 ? 'no' : 'not-verified'
    const verified = index % 5 === 0 ? '2025-01-01T00:00:00.000Z' : '2026-08-12T00:00:00.000Z'
    const externalNumber = String(index % 500)
    const campus = index % 7 === 0 ? 'A' : null
    content.run(id, id, title, verified, verified, verified)
    outpost.run(id, id, externalNumber, campus, church, city, civil, fcf)
    affiliation.run(id, district, 'geographic-district')
    affiliation.run(id, region, 'geographic-region')
    program.run(id, programGroup)
    const provenanceId = `scale-source-${suffix}`
    const cycleId = `scale-cycle-${suffix}`
    const deduplicatedSource = `document-scale-${String(Math.floor(index / 50)).padStart(3, '0')}`
    provenance.run(provenanceId, id, deduplicatedSource, verified)
    lifecycle.run(id, verified)
    verification.run(cycleId, id, verified)
    verificationProvenance.run(cycleId, provenanceId, deduplicatedSource, verified)
    directory.run(id, title.toLowerCase(), church.toLowerCase(), externalNumber, campus, city, civil, fcf, verified)
    search.run(id, title, `${church} ${city} ${externalNumber}`)
  }
  db.exec('COMMIT; PRAGMA optimize;')

  const authUser = db.prepare(`INSERT INTO "user"
    (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
    VALUES (?, ?, ?, 1, NULL, ?, ?)`)
  const authAccount = db.prepare(`INSERT INTO account
    (id, accountId, providerId, userId, password, "createdAt", "updatedAt")
    VALUES (?, ?, 'credential', ?, 'synthetic-not-a-real-password-hash', ?, ?)`)
  const authSession = db.prepare(`INSERT INTO session
    (id, "expiresAt", token, "createdAt", "updatedAt", ipAddress, userAgent, userId)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`)
  const challenge = db.prepare(`INSERT INTO ordinary_account_eligibility_challenges
    (id, secret_hash, confirmed_at, attestation_version, expires_at, reserved_at,
     reserved_request_id, consumed_at, consumed_auth_user_id)
    VALUES (?, ?, ?, 'ordinary-adult-v1', ?, ?, ?, ?, ?)`)
  const eligibility = db.prepare(`INSERT INTO ordinary_adult_eligibility
    (auth_user_id, confirmed, confirmed_at, attestation_version)
    VALUES (?, 1, ?, 'ordinary-adult-v1')`)
  const profile = db.prepare(`INSERT INTO ordinary_account_profiles
    (auth_user_id, activation_state, eligibility_challenge_id, display_name, onboarding_path,
     claimed_position, claimed_position_other, current_outpost_id, outpost_claim,
     usa_jurisdiction_id, country_code, international_subdivision, activated_at,
     created_at, updated_at, version)
    VALUES (?, 'active', ?, ?, ?, 'Adult Leader', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 1)`)
  const accountLifecycleInsert = db.prepare(`INSERT INTO ordinary_account_lifecycles
    (id, auth_user_id, state, activated_at, term_base_at, access_due_at, notice_open_at,
     confirmed_delivery_at, deletion_due_at, expired_at, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
  const accountClock = '2026-08-13T00:00:00.000Z'
  db.exec('BEGIN IMMEDIATE')
  for (let index = 0; index < 50_000; index += 1) {
    const suffix = String(index).padStart(5, '0')
    const userId = `scale-user-${suffix}`
    const challengeId = `scale-eligibility-${suffix}`
    const international = index % 2 === 1
    authUser.run(userId, `Scale Adult ${suffix}`, `scale-adult-${suffix}@example.test`, accountClock, accountClock)
    authAccount.run(`scale-account-${suffix}`, userId, userId, accountClock, accountClock)
    authSession.run(`scale-session-${suffix}`, '2026-08-20T00:00:00.000Z', `scale-token-${suffix}`, accountClock, accountClock, userId)
    challenge.run(challengeId, index.toString(16).padStart(64, '0'), accountClock, '2026-08-13T01:00:00.000Z', accountClock, `scale-request-${suffix}`, accountClock, userId)
    eligibility.run(userId, accountClock)
    profile.run(
      userId, challengeId, `Scale Adult ${suffix}`, international ? 'international' : 'usa',
      `Synthetic Outpost ${index % 500}`, international ? null : 'us-tx',
      international ? 'CA' : null, international ? 'Ontario' : null,
      accountClock, accountClock, accountClock,
    )
    const lifecycleKind = index % 4
    const accessDueAt = lifecycleKind === 0 ? '2027-09-13T00:00:00.000Z'
      : lifecycleKind === 3 ? '2028-08-13T00:00:00.000Z' : '2027-08-13T00:00:00.000Z'
    const noticeOpenAt = lifecycleKind === 0 ? '2027-08-13T00:00:00.000Z'
      : lifecycleKind === 3 ? '2028-07-13T00:00:00.000Z' : '2027-07-13T00:00:00.000Z'
    const expiredLifecycle = lifecycleKind === 2
    accountLifecycleInsert.run(
      `scale-lifecycle-${suffix}`, userId, expiredLifecycle ? 'expired' : 'active',
      accountClock, accountClock, accessDueAt, noticeOpenAt,
      expiredLifecycle ? '2027-02-13T00:00:00.000Z' : null,
      expiredLifecycle ? '2027-08-13T00:00:00.000Z' : null,
      expiredLifecycle ? '2027-08-13T00:00:00.000Z' : null,
      accountClock, accountClock,
    )
  }
  db.exec('COMMIT; PRAGMA optimize;')

  const scaleD1 = d1Database(db)
  const maintenanceNow = '2027-08-13T12:00:00.000Z'
  let maintenanceId = 0
  let fakeFetchCount = 0
  const maintenanceDependencies = {
    db: scaleD1,
    now: () => new Date(maintenanceNow),
    createId: () => `scale-maintenance-${++maintenanceId}`,
    fetch: async () => {
      fakeFetchCount += 1
      return new Response('bounded synthetic source response', {
        status: 200, headers: { 'content-type': 'text/plain', etag: '"scale-v1"' },
      })
    },
  }

  db.prepare(`UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'listing-lifecycle' THEN 1 ELSE 0 END,
    batch_size = CASE WHEN job_key = 'listing-lifecycle' THEN 50 ELSE batch_size END,
    next_due_at = ?, lease_owner = NULL, lease_expires_at = NULL`).run(maintenanceNow)
  const [listingPass, overlappingPass] = await Promise.all([
    runMaintenance(maintenanceDependencies, { trigger: 'local-test', maximumJobs: 1 }),
    runMaintenance(maintenanceDependencies, { trigger: 'local-test', maximumJobs: 1 }),
  ])
  const listingEvents = db.prepare(`SELECT COUNT(*) count, COUNT(DISTINCT idempotency_key) distinct_count
    FROM system_maintenance_events WHERE action = 'listing-entered-grace'`).get()
  const claimedListingPass = listingPass.jobsClaimed === 1 ? listingPass : overlappingPass

  db.prepare(`INSERT INTO approved_source_monitors
    (source_document_id, enabled, canonical_hostname, source_url_fingerprint, check_mode,
     interval_seconds, maximum_response_bytes, maximum_redirects, next_due_at,
     approved_operator_tenure_id, approved_at, approval_reason, created_at, updated_at)
    VALUES (?, 1, 'example.test', ?, 'bounded-fingerprint', 86400, 65536, 0, ?, 1,
      '2026-08-12T00:00:00.000Z', 'Synthetic scale fixture only.',
      '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z')`)
    .run(sourceDocument, await sha256('https://example.test/scale-directory/000'), maintenanceNow)
  db.prepare(`UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'source-monitoring' THEN 1 ELSE 0 END,
    next_due_at = ?, lease_owner = NULL, lease_expires_at = NULL`).run(maintenanceNow)
  const sourcePass = await runMaintenance(maintenanceDependencies, { trigger: 'local-test', maximumJobs: 1 })
  const duplicateSourcePass = await runMaintenance(maintenanceDependencies, { trigger: 'local-test', maximumJobs: 1 })

  db.prepare(`INSERT INTO maintenance_runs
    (id, trigger_type, dispatcher_rule_version, status, started_at, completed_at, outcome_json)
    VALUES ('scale-old-run', 'local-test', 'maintenance-dispatcher-v1', 'succeeded',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z', '{"jobsClaimed":1}')`).run()
  db.prepare(`INSERT INTO automated_source_observations
    (id, source_document_id, maintenance_run_id, observed_at, status_class, redirect_outcome,
     mime_family, bounded_byte_count, duration_bucket, outcome, retained_until)
    VALUES ('scale-old-observation', ?, 'scale-old-run', '2026-01-01T00:00:00.000Z',
      '2xx', 'none', 'text', 10, 'under-250ms', 'unchanged', '2026-04-01T00:00:00.000Z')`).run(sourceDocument)
  db.prepare(`UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'maintenance-history-retention' THEN 1 ELSE 0 END,
    next_due_at = ?, lease_owner = NULL, lease_expires_at = NULL`).run(maintenanceNow)
  const retentionPass = await runMaintenance(maintenanceDependencies, { trigger: 'local-test', maximumJobs: 1 })

  const sourceObservation = db.prepare(`SELECT id, maintenance_run_id, content_fingerprint
    FROM automated_source_observations WHERE source_document_id = ? ORDER BY observed_at DESC LIMIT 1`).get(sourceDocument)
  db.prepare(`INSERT INTO automated_update_candidates
    (id, source_document_id, triggering_observation_id, triggering_run_id, current_fingerprint,
     affected_fields_json, prior_public_values_json, adapter_version, state, created_at, updated_at)
    VALUES ('scale-open-candidate', ?, ?, ?, ?, '[]', '[]', 'review-only-v1', 'open', ?, ?)`)
    .run(sourceDocument, sourceObservation.id, sourceObservation.maintenance_run_id,
      sourceObservation.content_fingerprint, maintenanceNow, maintenanceNow)
  db.prepare(`INSERT INTO automation_alerts
    (id, maintenance_run_id, rule_version, actor_label, alert_type, severity,
     job_key, coalescing_key, summary, status, first_seen_at, last_seen_at)
    VALUES ('scale-open-alert', ?, 'listing-lifecycle-v1', 'Automation: listing-lifecycle-v1',
      'backlog-threshold', 'warning', 'listing-lifecycle',
      'scale-backlog', 'Synthetic scale backlog fixture.', 'open', ?, ?)`).run(
      claimedListingPass.runId, maintenanceNow, maintenanceNow,
    )

  db.prepare(`UPDATE maintenance_jobs SET enabled = CASE WHEN job_key = 'maintenance-history-retention' THEN 1 ELSE 0 END,
    next_due_at = ?, lease_owner = 'other-scale-run', lease_expires_at = '2027-08-13T12:01:00.000Z'
    WHERE job_key = 'maintenance-history-retention'`).run(maintenanceNow)
  const liveLeasePass = await runMaintenance(maintenanceDependencies, { trigger: 'local-test', maximumJobs: 1 })
  db.prepare(`UPDATE maintenance_jobs SET lease_expires_at = '2027-08-13T11:59:59.000Z'
    WHERE job_key = 'maintenance-history-retention'`).run()
  const reclaimedLeasePass = await runMaintenance(maintenanceDependencies, { trigger: 'local-test', maximumJobs: 1 })

  const outpostCount = Number(db.prepare('SELECT COUNT(*) count FROM outposts').get().count)
  const ordinaryAccountCount = Number(db.prepare('SELECT COUNT(*) count FROM ordinary_account_profiles').get().count)
  const foreignKeyProblems = db.prepare('PRAGMA foreign_key_check').all()
  const sourceDocumentSupportingFields = Number(db.prepare(`SELECT COUNT(*) count FROM field_provenance
    WHERE source_document_id = ?`).get(sourceDocument).count)
  const prunedRoutineObservations = Number(db.prepare(`SELECT SUM(pruned_observations) count
    FROM maintenance_daily_aggregates`).get().count ?? 0)
  const retainedSourceObservations = Number(db.prepare(`SELECT COUNT(*) count FROM automated_source_observations
    WHERE source_document_id = ?`).get(sourceDocument).count)
  const oldRun = db.prepare("SELECT outcome_json FROM maintenance_runs WHERE id = 'scale-old-run'").get()
  if (outpostCount < 20_000) throw new Error(`Expected at least 20,000 outposts, found ${outpostCount}.`)
  if (ordinaryAccountCount !== 50_000) throw new Error(`Expected 50,000 isolated ordinary accounts, found ${ordinaryAccountCount}.`)
  if (foreignKeyProblems.length !== 0) throw new Error(`Foreign-key check found ${foreignKeyProblems.length} problem(s).`)
  if (claimedListingPass.actionsApplied !== 50 || listingPass.jobsClaimed + overlappingPass.jobsClaimed !== 1
    || listingEvents.count !== 50 || listingEvents.distinct_count !== 50) {
    throw new Error('Overlapping listing maintenance did not preserve one bounded, idempotent 50-action claim.')
  }
  if (sourcePass.jobsClaimed !== 1 || sourcePass.outboundSubrequests !== 1
    || duplicateSourcePass.jobsClaimed !== 0 || duplicateSourcePass.outboundSubrequests !== 0
    || fakeFetchCount !== 1 || retainedSourceObservations !== 1 || sourceDocumentSupportingFields !== 50) {
    throw new Error('Source-monitor scale invariants failed: one due source must serve many fields with one fetch and no duplicate observation.')
  }
  if (retentionPass.jobsClaimed !== 1 || retentionPass.actionsApplied !== 2
    || prunedRoutineObservations !== 1 || oldRun?.outcome_json !== null) {
    throw new Error('Maintenance retention did not aggregate before pruning bounded routine detail.')
  }
  if (liveLeasePass.jobsClaimed !== 0 || reclaimedLeasePass.jobsClaimed !== 1) {
    throw new Error('Maintenance lease evidence failed: live work must be skipped and expired work reclaimed.')
  }

  const evidence = [
    timed('directory first page', `SELECT content_id, title_sort FROM public_outpost_directory
      ORDER BY title_sort, content_id LIMIT 21`, [], 21, 'public_outposts_title'),
    timed('directory jurisdiction filter', `SELECT content_id, title_sort FROM public_outpost_directory
      WHERE civil_geography_id = ? ORDER BY title_sort, content_id LIMIT 21`, ['us-tx'], 21, 'public_outposts_civil_title'),
    timed('scoped external number lookup', `SELECT content_id FROM public_outpost_directory
      WHERE national_program_id = ? AND external_number = ? ORDER BY campus_suffix, content_id LIMIT 21`, ['rr-usa', '70'], 21, 'public_outposts_number'),
    timed('directory keyset page', `SELECT content_id, title_sort FROM public_outpost_directory
      WHERE (title_sort, content_id) > (?, ?) ORDER BY title_sort, content_id LIMIT 21`, ['synthetic community 09999', 'scale-outpost-09999'], 21, 'public_outposts_title'),
    timed('global public search', `SELECT document.content_id FROM public_search_fts
      JOIN public_search_documents document ON document.content_id = public_search_fts.content_id
      WHERE public_search_fts MATCH ? ORDER BY lower(document.title), document.content_id LIMIT 21`, ['"Synthetic"* "Church"*'], 21, 'VIRTUAL TABLE INDEX'),
    timed('upcoming events', `SELECT event.content_id FROM event_occurrences event
      JOIN content_records content ON content.id = event.content_id
      WHERE content.status = 'published' AND event.start_date >= ?
      ORDER BY event.start_date, event.content_id LIMIT 21`, ['2026-08-12'], 21, 'event_occurrences_'),
    timed('operator record list', `SELECT id, updated_at FROM content_records
      ORDER BY updated_at DESC, id DESC LIMIT 21`, [], 21, 'content_records_operator_updated'),
    timed('freshness queue candidates', `SELECT content_id, id FROM field_provenance
      WHERE verified_at <= ? ORDER BY verified_at, content_id, id LIMIT 51`, ['2025-08-12T00:00:00.000Z'], 51, 'field_provenance_freshness'),
    timed('listing verification queue', `SELECT outpost_id FROM outpost_lifecycle
      WHERE state IN ('verified', 'grace', 'verification-expired') AND next_verification_due_at <= ?
      ORDER BY state, next_verification_due_at, outpost_id LIMIT 51`, ['2027-08-13T00:00:00.000Z'], 51, 'outpost_lifecycle_freshness'),
    timed('private submission queue', `SELECT id FROM directory_submissions
      WHERE state = 'new' AND likely_duplicate = 0 ORDER BY created_at, id LIMIT 51`, [], 51, 'directory_submission_queue'),
    timed('staged population queue', `SELECT id FROM staged_outpost_candidates
      WHERE state = 'staged' ORDER BY batch_id, id LIMIT 51`, [], 51, 'staged_outpost_candidate_queue'),
    timed('maintenance due jobs', `SELECT job_key FROM maintenance_jobs
      WHERE enabled = 1 AND circuit_state = 'closed' AND next_due_at <= ?
      ORDER BY next_due_at, job_key LIMIT 7`, [maintenanceNow], 7, 'maintenance_jobs_due'),
    timed('maintenance expired leases', `SELECT job_key FROM maintenance_jobs
      WHERE lease_expires_at <= ? ORDER BY lease_expires_at, job_key LIMIT 7`, [maintenanceNow], 7, 'maintenance_jobs_lease'),
    timed('source monitor due targets', `SELECT source_document_id FROM approved_source_monitors
      WHERE enabled = 1 AND circuit_state = 'closed' AND next_due_at <= ?
      ORDER BY next_due_at, source_document_id LIMIT 17`, [maintenanceNow], 17, 'approved_source_monitors_due'),
    timed('routine observation retention queue', `SELECT id FROM automated_source_observations
      WHERE retained_until <= ? ORDER BY retained_until, id LIMIT 51`, [maintenanceNow], 51, 'automated_source_observations_retention'),
    timed('open automation candidate queue', `SELECT id FROM automated_update_candidates
      WHERE state IN ('open', 'reviewing') ORDER BY created_at, id LIMIT 51`, [], 51, 'automated_update_candidates_queue'),
    timed('open automation alert queue', `SELECT id FROM automation_alerts
      WHERE status <> 'resolved' ORDER BY severity, last_seen_at DESC, id LIMIT 51`, [], 51, 'automation_alerts_queue'),
    timed('normalized ordinary email lookup', `SELECT id FROM "user"
      WHERE lower(trim(email)) = ? LIMIT 1`, ['scale-adult-49999@example.test'], 1, 'user_normalized_email'),
    timed('ordinary session token lookup', `SELECT id, userId FROM session
      WHERE token = ? LIMIT 1`, ['scale-token-49999'], 1, 'sqlite_autoindex_session'),
    timed('ordinary session expiry queue', `SELECT id FROM session
      WHERE "expiresAt" <= ? ORDER BY "expiresAt", id LIMIT 51`, ['2026-08-21T00:00:00.000Z'], 51, 'session_expiry'),
    timed('current ordinary profile lookup', `SELECT auth_user_id FROM ordinary_account_profiles
      WHERE auth_user_id = ? LIMIT 1`, ['scale-user-49999'], 1, 'sqlite_autoindex_ordinary_account_profiles'),
    timed('ordinary lifecycle notice queue', `SELECT id FROM ordinary_account_lifecycles
      WHERE state = 'active' AND confirmed_delivery_at IS NULL
        AND notice_open_at <= ? AND access_due_at > ?
      ORDER BY notice_open_at, id LIMIT 51`, [maintenanceNow, maintenanceNow], 51, 'ordinary_lifecycle_notice_due'),
    timed('ordinary lifecycle expiration queue', `SELECT auth_user_id FROM ordinary_account_lifecycles
      WHERE state IN ('active', 'renewal-notice') AND access_due_at <= ?
      ORDER BY access_due_at, id LIMIT 51`, [maintenanceNow], 51, 'ordinary_lifecycle_expiration_due'),
    timed('ordinary lifecycle deletion queue', `SELECT auth_user_id FROM ordinary_account_lifecycles
      WHERE state = 'expired' AND deletion_due_at IS NOT NULL AND deletion_due_at <= ?
      ORDER BY deletion_due_at, id LIMIT 51`, [maintenanceNow], 51, 'ordinary_lifecycle_deletion_due'),
    timed('ordinary lifecycle session revocation', `SELECT id FROM session
      WHERE "userId" = ? ORDER BY id LIMIT 51`, ['scale-user-49999'], 51, 'session_userId_idx'),
    timed('USA scoped private outpost claim', `SELECT auth_user_id FROM ordinary_account_profiles
      WHERE onboarding_path = 'usa' AND current_outpost_id IS NULL
        AND usa_jurisdiction_id = ? AND outpost_claim = ? LIMIT 51`, ['us-tx', 'Synthetic Outpost 70'], 51, 'ordinary_profiles_us_claim'),
    timed('international scoped private outpost claim', `SELECT auth_user_id FROM ordinary_account_profiles
      WHERE onboarding_path = 'international' AND current_outpost_id IS NULL
        AND country_code = ? AND outpost_claim = ? LIMIT 51`, ['CA', 'Synthetic Outpost 71'], 51, 'ordinary_profiles_international_claim'),
  ]

  console.log(JSON.stringify({
    schemaMigration: '0012_ordinary_account_lifecycle.sql',
    syntheticOutposts: 20_000,
    syntheticOrdinaryAccounts: ordinaryAccountCount,
    totalOutposts: outpostCount,
    foreignKeyProblems: 0,
    isolatedDatabase: true,
    maintenance: {
      fixedClock: maintenanceNow,
      fakeFetchOnly: true,
      listingPass,
      overlappingPass,
      listingEvents,
      sourcePass,
      duplicateSourcePass,
      fakeFetchCount,
      deduplicatedSourceDocuments: 400,
      sourceDocumentSupportingFields,
      retentionPass,
      prunedRoutineObservations,
      liveLeasePass,
      reclaimedLeasePass,
    },
    evidence,
  }, null, 2))
} finally {
  db.close()
  await rm(temporary, { recursive: true, force: true })
}
