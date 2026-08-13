import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

const temporary = await mkdtemp(join(tmpdir(), 'ranger-outpost-scale-'))
const databasePath = join(temporary, 'scale.sqlite')
const db = new DatabaseSync(databasePath)

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
  for (let number = 1; number <= 9; number += 1) {
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
    ][number - 1]}`, import.meta.url)
    if (!migrationUrl.pathname.includes(prefix)) throw new Error(`Migration ordering failed at ${prefix}.`)
    db.exec(await readFile(migrationUrl, 'utf8'))
  }

  const district = db.prepare("SELECT id FROM organization_units WHERE unit_type = 'district' ORDER BY id LIMIT 1").get().id
  const region = db.prepare("SELECT id FROM organization_units WHERE unit_type = 'region' ORDER BY id LIMIT 1").get().id
  const programGroup = db.prepare("SELECT content_id FROM advancement_items WHERE subtype = 'program-group' ORDER BY content_id LIMIT 1").get().content_id
  const sourceDocument = 'document-scale-fixture'
  db.prepare(`INSERT INTO source_documents (id, url, label, created_at)
    VALUES (?, 'https://example.test/scale-directory', 'Synthetic scale fixture', '2026-08-12T00:00:00.000Z')`).run(sourceDocument)
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
    provenance.run(provenanceId, id, sourceDocument, verified)
    lifecycle.run(id, verified)
    verification.run(cycleId, id, verified)
    verificationProvenance.run(cycleId, provenanceId, sourceDocument, verified)
    directory.run(id, title.toLowerCase(), church.toLowerCase(), externalNumber, campus, city, civil, fcf, verified)
    search.run(id, title, `${church} ${city} ${externalNumber}`)
  }
  db.exec('COMMIT; PRAGMA optimize;')

  const outpostCount = Number(db.prepare('SELECT COUNT(*) count FROM outposts').get().count)
  const foreignKeyProblems = db.prepare('PRAGMA foreign_key_check').all()
  if (outpostCount < 20_000) throw new Error(`Expected at least 20,000 outposts, found ${outpostCount}.`)
  if (foreignKeyProblems.length !== 0) throw new Error(`Foreign-key check found ${foreignKeyProblems.length} problem(s).`)

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
  ]

  console.log(JSON.stringify({
    schemaMigration: '0009_us_directory_operations.sql',
    syntheticOutposts: 20_000,
    totalOutposts: outpostCount,
    foreignKeyProblems: 0,
    isolatedDatabase: true,
    evidence,
  }, null, 2))
} finally {
  db.close()
  await rm(temporary, { recursive: true, force: true })
}
