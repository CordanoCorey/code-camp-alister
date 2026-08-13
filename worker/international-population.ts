import type { OutpostDetails } from '../shared/domain'
import { internationalManifestChecksum, parseInternationalManifest } from '../shared/international-outpost-manifest'
import type { OperatorPrincipal } from './operator-lifecycle-repository'
import { saveNormalizedRecord, type EditableRecord } from './content-writes'
import { getOperatorRecord } from './content-repository'

export async function stageInternationalManifest(db: D1Database, raw: unknown, actor: OperatorPrincipal, now: string) {
  const manifest = parseInternationalManifest(raw)
  const checksum = await internationalManifestChecksum(manifest)
  const existing = await db.prepare('SELECT id FROM international_population_batches WHERE manifest_checksum = ?').bind(checksum).first<{ id: string }>()
  if (existing) return { batchId: existing.id, checksum, candidateCount: manifest.candidates.length, idempotent: true }
  const reusedKey = await db.prepare('SELECT manifest_checksum FROM international_population_batches WHERE batch_key = ?').bind(manifest.batchKey).first<{ manifest_checksum: string }>()
  if (reusedKey) throw new Error('Batch key was already used for different international facts.')
  const batchId = `intl-batch-${checksum.slice(0, 20)}`
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO international_population_batches
    (id, batch_key, source_register, manifest_checksum, reviewed_at, country_code, coverage_state,
     candidate_count, operator_tenure_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(batchId, manifest.batchKey, manifest.sourceRegister, checksum, manifest.reviewedAt,
      manifest.coverage.countryCode, manifest.coverage.state, manifest.candidates.length, actor.tenureNumber, now)]
  for (const candidate of manifest.candidates) {
    const id = `${batchId}:${candidate.candidateKey}`
    statements.push(db.prepare(`INSERT INTO staged_international_candidates
      (id, batch_id, stable_candidate_key, country_code, country_name, national_program_id,
       national_program_name, rri_grouping, local_unit_label, identifier_raw, display_name_raw,
       church, subdivision_label, subdivision_name, city, street_address, public_contact_url,
       affiliations_json, fcf_availability, active_fcf, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, batchId, candidate.candidateKey, candidate.countryCode, candidate.countryName,
        candidate.nationalProgramId, candidate.nationalProgramName, candidate.rriGrouping,
        candidate.localUnitLabel, candidate.identifierRaw, candidate.displayNameRaw, candidate.church,
        candidate.civilSubdivision?.label ?? null, candidate.civilSubdivision?.name ?? null,
        candidate.city, candidate.streetAddress, candidate.contactUrl, JSON.stringify(candidate.affiliations),
        candidate.fcfAvailability, candidate.activeFcf === null ? 'not-verified' : candidate.activeFcf ? 'yes' : 'no', now))
    for (const [field, sources] of Object.entries(candidate.fieldSources)) for (const [index, source] of sources.entries()) {
      statements.push(db.prepare(`INSERT INTO staged_international_fields
        (id, candidate_id, field_path, proposed_value, source_url, source_label, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(`${id}:${field}:${index}`, id, field, JSON.stringify(candidate[field as keyof typeof candidate]), source.url, source.label, source.checkedAt))
    }
    if (candidate.identifierRaw) statements.push(db.prepare(`INSERT OR IGNORE INTO staged_international_matches
      (id, candidate_id, outpost_id, match_kind, evidence_summary)
      SELECT ?, ?, outpost.content_id, 'scoped-identifier', 'Country, National Program, and source-native identifier match'
      FROM outposts outpost JOIN national_programs program ON program.id = outpost.national_program_id
      WHERE program.country_code = ? AND program.id = ? AND outpost.identifier_raw = ? LIMIT 1`)
      .bind(`${id}:identifier`, id, candidate.countryCode, candidate.nationalProgramId, candidate.identifierRaw))
    if (candidate.church && candidate.city) statements.push(db.prepare(`INSERT OR IGNORE INTO staged_international_matches
      (id, candidate_id, outpost_id, match_kind, evidence_summary)
      SELECT ?, ?, outpost.content_id, 'church-location', 'Country-scoped church and city match'
      FROM outposts outpost JOIN national_programs program ON program.id = outpost.national_program_id
      WHERE program.country_code = ? AND lower(outpost.church) = lower(?) AND lower(outpost.city) = lower(?) LIMIT 1`)
      .bind(`${id}:church`, id, candidate.countryCode, candidate.church, candidate.city))
    statements.push(db.prepare(`UPDATE staged_international_candidates SET state = 'duplicate-review'
      WHERE id = ? AND EXISTS (SELECT 1 FROM staged_international_matches WHERE candidate_id = ? AND state = 'candidate')`).bind(id, id))
  }
  await db.batch(statements)
  return { batchId, checksum, candidateCount: manifest.candidates.length, idempotent: false }
}

export async function listInternationalCandidates(db: D1Database, params: URLSearchParams) {
  const state = params.get('state'); const country = params.get('country')?.toUpperCase()
  const rows = await db.prepare(`SELECT candidate.*, batch.coverage_state FROM staged_international_candidates candidate
    JOIN international_population_batches batch ON batch.id = candidate.batch_id
    WHERE (? IS NULL OR candidate.state = ?) AND (? IS NULL OR candidate.country_code = ?)
    ORDER BY candidate.country_code, candidate.created_at, candidate.id LIMIT 101`).bind(state, state, country, country).all<Record<string, unknown>>()
  const page = rows.results.slice(0, 100)
  const ids = page.map((row) => String(row.id))
  const fields = ids.length ? await db.prepare(`SELECT candidate_id, field_path, source_url, source_label, checked_at FROM staged_international_fields WHERE candidate_id IN (${ids.map(() => '?').join(',')}) ORDER BY candidate_id, field_path`).bind(...ids).all<{ candidate_id: string; field_path: string; source_url: string; source_label: string; checked_at: string }>() : { results: [] }
  const matches = ids.length ? await db.prepare(`SELECT id, candidate_id, outpost_id, match_kind, evidence_summary, state FROM staged_international_matches WHERE candidate_id IN (${ids.map(() => '?').join(',')}) ORDER BY candidate_id, id`).bind(...ids).all<{ id: string; candidate_id: string; outpost_id: string; match_kind: string; evidence_summary: string; state: string }>() : { results: [] }
  return { items: page.map((row) => ({ ...row,
    sources: fields.results.filter((field) => field.candidate_id === row.id).map((field) => ({ field: field.field_path, url: field.source_url, label: field.source_label, checkedAt: field.checked_at })),
    matches: matches.results.filter((match) => match.candidate_id === row.id).map((match) => ({ id: match.id, outpostId: match.outpost_id, kind: match.match_kind, evidence: match.evidence_summary, state: match.state })),
  })), truncated: rows.results.length > 100 }
}

export async function applyInternationalCandidate(db: D1Database, input: { candidateId: string; duplicateDecision: 'no-match' | 'confirmed-correction' | null; targetOutpostId: string | null; expectedVersion: number | null; reason: string; actor: OperatorPrincipal; now: string }) {
  if (!input.reason.trim()) throw new Error('Explain the international candidate decision.')
  const candidate = await db.prepare(`SELECT candidate.*, batch.source_register, batch.reviewed_at, batch.coverage_state
    FROM staged_international_candidates candidate JOIN international_population_batches batch ON batch.id = candidate.batch_id
    WHERE candidate.id = ?`).bind(input.candidateId).first<Record<string, string | null>>()
  if (!candidate || !['staged', 'duplicate-review'].includes(candidate.state!)) throw new Error('Only an unapplied international candidate can be converted.')
  const matches = await db.prepare("SELECT outpost_id FROM staged_international_matches WHERE candidate_id = ? AND state = 'candidate'").bind(input.candidateId).all<{ outpost_id: string }>()
  if (matches.results.length && !input.duplicateDecision) throw new Error('Resolve duplicate evidence before conversion.')
  if (!candidate.church?.trim() || !candidate.city?.trim()) throw new Error('Conversion requires a source-supported church and city; leave this candidate private until both are verified.')
  if (input.duplicateDecision === 'confirmed-correction' && (!input.targetOutpostId || !matches.results.some((match) => match.outpost_id === input.targetOutpostId))) throw new Error('Select a country-scoped canonical match for correction.')
  const previous = input.duplicateDecision === 'confirmed-correction' ? await getOperatorRecord(db, input.targetOutpostId!) : null
  if (input.duplicateDecision === 'confirmed-correction' && (!previous || previous.kind !== 'outpost')) throw new Error('The correction target is unavailable.')
  const outpostId = previous?.id ?? crypto.randomUUID()
  const sources = await db.prepare(`SELECT field_path, source_url, source_label, checked_at FROM staged_international_fields WHERE candidate_id = ? ORDER BY id`).bind(input.candidateId).all<{ field_path: string; source_url: string; source_label: string; checked_at: string }>()
  const jurisdiction = candidate.subdivision_name ?? candidate.country_name!
  const details: OutpostDetails = { hubOutpostId: outpostId, countryCode: candidate.country_code!, countryName: candidate.country_name!, localUnitLabel: candidate.local_unit_label!, identifierRaw: candidate.identifier_raw, displayNameRaw: candidate.display_name_raw, outpostNumber: candidate.identifier_raw, campusSuffix: null, church: candidate.church, streetAddress: candidate.street_address, city: candidate.city, jurisdiction, civilSubdivisionLabel: candidate.subdivision_label, postalCode: null, district: '', region: '', languageOverlay: '', fcfTerritory: '', activeFcf: candidate.active_fcf === 'not-verified' ? null : candidate.active_fcf === 'yes', fcfAvailability: candidate.fcf_availability as OutpostDetails['fcfAvailability'], affiliations: JSON.parse(candidate.affiliations_json ?? '[]'), programs: [], meeting: null, contactUrl: candidate.public_contact_url }
  const record: EditableRecord = { kind: 'outpost', slug: previous?.slug ?? `${candidate.stable_candidate_key}-${outpostId.slice(0, 8)}`, title: candidate.display_name_raw ?? `${candidate.local_unit_label} ${candidate.identifier_raw ?? candidate.city}`, summary: `Operator draft for a reviewed ${candidate.national_program_name} local unit.`, status: 'draft', details, verifiedAt: null, sources: sources.results.map((source) => ({ id: '', fieldName: source.field_path, label: source.source_label, url: source.source_url, verifiedAt: source.checked_at })) }
  const head = [
    db.prepare(`INSERT INTO countries(code, name) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET name = excluded.name`).bind(candidate.country_code, candidate.country_name),
    db.prepare(`INSERT INTO civil_geographies(id, geography_type, name, code, country_code, parent_id, display_order, display_label)
      VALUES ('country-' || lower(?), 'country', ?, ?, ?, NULL, 0, NULL) ON CONFLICT(id) DO NOTHING`).bind(candidate.country_code, candidate.country_name, candidate.country_code, candidate.country_code),
    db.prepare(`INSERT INTO national_programs(id, name, country_code, default_language, fcf_availability) VALUES (?, ?, ?, 'und', ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, fcf_availability = excluded.fcf_availability`).bind(candidate.national_program_id, candidate.national_program_name, candidate.country_code, candidate.fcf_availability),
  ]
  const tail = [
    db.prepare(`UPDATE staged_international_candidates SET state = 'converted-to-draft', applied_at = ?, applied_outpost_id = ? WHERE id = ?`).bind(input.now, outpostId, input.candidateId),
    db.prepare(`UPDATE staged_international_matches SET state = ?, resolved_at = ?, operator_tenure_id = ? WHERE candidate_id = ? AND state = 'candidate'`).bind(input.duplicateDecision === 'confirmed-correction' ? 'confirmed-duplicate' : 'dismissed', input.now, input.actor.tenureNumber, input.candidateId),
    db.prepare(`INSERT INTO international_coverage_reviews(country_code, coverage_state, named_local_editors, reviewed_at, source_register, operator_tenure_id)
      VALUES (?, ?, NULL, ?, ?, ?) ON CONFLICT(country_code) DO UPDATE SET coverage_state = excluded.coverage_state, reviewed_at = excluded.reviewed_at, source_register = excluded.source_register, operator_tenure_id = excluded.operator_tenure_id`).bind(candidate.country_code, candidate.coverage_state, candidate.reviewed_at, candidate.source_register, input.actor.tenureNumber),
  ]
  await saveNormalizedRecord(db, outpostId, record, input.actor, input.reason.trim(), previous, previous ? input.expectedVersion : null, tail, head)
  await db.prepare(`UPDATE international_population_batches SET state = CASE WHEN NOT EXISTS
    (SELECT 1 FROM staged_international_candidates WHERE batch_id = ? AND state IN ('staged','duplicate-review')) THEN 'applied' ELSE 'partially-applied' END WHERE id = ?`).bind(candidate.batch_id, candidate.batch_id).run()
  return outpostId
}

export async function getInternationalPopulationReport(db: D1Database) {
  const rows = await db.prepare(`SELECT country_code, rri_grouping, state, COUNT(*) count FROM staged_international_candidates GROUP BY country_code, rri_grouping, state`).all<{ country_code: string; rri_grouping: string | null; state: string; count: number }>()
  const conflicts = await db.prepare("SELECT COUNT(*) count FROM staged_international_matches WHERE state = 'candidate'").first<{ count: number }>()
  const gaps = await db.prepare("SELECT COUNT(*) count FROM international_population_batches WHERE coverage_state <> 'verified-directory-maintained-by-local-editors'").first<{ count: number }>()
  return { rows: rows.results, conflicts: conflicts?.count ?? 0, coverageGaps: gaps?.count ?? 0 }
}
