import type { OutpostDetails, StagedOutpostCandidate } from '../shared/domain'
import { manifestChecksum, parseOutpostManifest } from '../shared/outpost-manifest'
import { getOperatorRecord } from './content-repository'
import { saveNormalizedRecord, type EditableRecord } from './content-writes'
import type { OperatorPrincipal } from './operator-lifecycle-repository'
import { decodeCursor, encodeCursor, readPageSize } from './pagination'

function valueForField(facts: Record<string, unknown>, field: string) {
  return Object.hasOwn(facts, field) ? JSON.stringify(facts[field]) : null
}

export async function stageOutpostManifest(db: D1Database, rawManifest: unknown, actor: OperatorPrincipal, now: string) {
  const manifest = parseOutpostManifest(rawManifest)
  const checksum = await manifestChecksum(manifest)
  const existing = await db.prepare('SELECT id FROM population_batches WHERE manifest_checksum = ?')
    .bind(checksum).first<{ id: string }>()
  if (existing) return { batchId: existing.id, checksum, candidateCount: manifest.candidates.length, idempotent: true }

  const batchId = `batch-${checksum.slice(0, 24)}`
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO population_batches
      (id, source_register, source_version, manifest_checksum, reviewed_at, candidate_count,
       staged_count, applied_count, state, operator_tenure_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'staged', ?, ?)`)
      .bind(batchId, manifest.sourceRegister, manifest.sourceVersion, checksum, manifest.reviewedAt,
        manifest.candidates.length, manifest.candidates.length, actor.tenureNumber, now),
  ]
  for (const candidate of manifest.candidates) {
    const id = `${batchId}:${candidate.candidateKey}`
    const facts = candidate.publicFacts
    statements.push(
      db.prepare(`INSERT INTO staged_outpost_candidates
        (id, batch_id, stable_candidate_key, target_outpost_id, operation, church, external_number,
         campus_suffix, street_address, city, civil_geography_id, postal_code, district_name,
         region_name, fcf_territory_name, language_overlay_name, program_groups_text,
         meeting_information, public_contact_url, fcf_activity_status, state, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, geography.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', ?
        FROM civil_geographies geography WHERE geography.country_code = 'US' AND geography.name = ?`)
        .bind(id, batchId, candidate.candidateKey, candidate.targetHubOutpostId, candidate.operation,
          facts.church, facts.outpostNumber, facts.campusSuffix, facts.streetAddress ?? null, facts.city,
          facts.postalCode ?? null, facts.district, facts.region, facts.fcfTerritory,
          facts.languageOverlay ?? null, facts.programs.join('\u001f'), facts.meeting ?? null,
          facts.contactUrl ?? null, facts.fcfActivityStatus, now, facts.jurisdiction),
    )
    for (const [field, sources] of Object.entries(candidate.fieldSources)) {
      sources.forEach((source, index) => statements.push(
        db.prepare(`INSERT INTO staged_outpost_fields
          (id, candidate_id, field_path, proposed_value, source_url, source_label, checked_at,
           fact_kind, mapping_source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(`${id}:${field}:${index}`, id, field, valueForField(facts as unknown as Record<string, unknown>, field),
            source.url, source.label, source.checkedAt, source.factKind, source.mappingSourceUrl ?? null),
      ))
    }
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO directory_candidate_matches
        (id, staged_candidate_id, outpost_id, match_kind, evidence_summary, state, created_at)
        SELECT ?, ?, outpost.content_id, 'church-location', 'Normalized church, city, and jurisdiction match',
          'candidate', ? FROM outposts outpost JOIN civil_geographies geography
          ON geography.id = outpost.civil_geography_id
        WHERE lower(trim(outpost.church)) = lower(trim(?)) AND lower(trim(outpost.city)) = lower(trim(?))
          AND geography.name = ? LIMIT 1`)
        .bind(`${id}:church-location`, id, now, facts.church, facts.city, facts.jurisdiction),
      db.prepare(`INSERT OR IGNORE INTO directory_candidate_matches
        (id, staged_candidate_id, outpost_id, match_kind, evidence_summary, state, created_at)
        SELECT ?, ?, outpost.content_id, 'scoped-number', 'Displayed number, district, and campus candidate match',
          'candidate', ? FROM outposts outpost
        WHERE outpost.external_number = ? AND COALESCE(outpost.campus_suffix, '') = COALESCE(?, '')
          AND (? IS NULL OR EXISTS (SELECT 1 FROM outpost_affiliations affiliation
            JOIN organization_units unit ON unit.id = affiliation.organization_id
            WHERE affiliation.outpost_id = outpost.content_id AND unit.name = ?)) LIMIT 1`)
        .bind(`${id}:scoped-number`, id, now, facts.outpostNumber, facts.campusSuffix, facts.district, facts.district),
      db.prepare(`UPDATE staged_outpost_candidates SET state = 'duplicate-review'
        WHERE id = ? AND EXISTS (SELECT 1 FROM directory_candidate_matches match
          WHERE match.staged_candidate_id = ? AND match.state = 'candidate')`).bind(id, id),
    )
  }
  await db.batch(statements)
  return { batchId, checksum, candidateCount: manifest.candidates.length, idempotent: false }
}

export async function getPopulationReport(db: D1Database) {
  const [batchStates, candidateStates, duplicateCount, provenanceGaps, lifecycleStates, coverageGaps] = await Promise.all([
    db.prepare('SELECT state, COUNT(*) count FROM population_batches GROUP BY state').all<{ state: string; count: number }>(),
    db.prepare('SELECT state, COUNT(*) count FROM staged_outpost_candidates GROUP BY state').all<{ state: string; count: number }>(),
    db.prepare("SELECT COUNT(*) count FROM directory_candidate_matches WHERE state = 'candidate'").first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) count FROM staged_outpost_candidates candidate
      WHERE NOT EXISTS (SELECT 1 FROM staged_outpost_fields field WHERE field.candidate_id = candidate.id
        AND field.field_path = 'church') OR NOT EXISTS (SELECT 1 FROM staged_outpost_fields field
          WHERE field.candidate_id = candidate.id AND field.field_path = 'city')`).first<{ count: number }>(),
    db.prepare('SELECT state, COUNT(*) count FROM outpost_lifecycle GROUP BY state').all<{ state: string; count: number }>(),
    db.prepare(`SELECT COUNT(*) count FROM public_jurisdiction_coverage WHERE verified_listing_count = 0`).first<{ count: number }>(),
  ])
  return {
    batches: Object.fromEntries(batchStates.results.map((row) => [row.state, row.count])),
    candidates: Object.fromEntries(candidateStates.results.map((row) => [row.state, row.count])),
    duplicateCandidates: duplicateCount?.count ?? 0,
    provenanceGaps: provenanceGaps?.count ?? 0,
    lifecycle: Object.fromEntries(lifecycleStates.results.map((row) => [row.state, row.count])),
    jurisdictionsWithNoVerifiedListings: coverageGaps?.count ?? 0,
  }
}

type StagedRow = {
  id: string
  batch_id: string
  stable_candidate_key: string
  target_outpost_id: string | null
  operation: 'new-listing' | 'correction'
  church: string
  external_number: string | null
  campus_suffix: string | null
  street_address: string | null
  city: string
  jurisdiction: string
  postal_code: string | null
  district_name: string | null
  region_name: string | null
  fcf_territory_name: string | null
  language_overlay_name: string | null
  program_groups_text: string
  meeting_information: string | null
  public_contact_url: string | null
  fcf_activity_status: 'yes' | 'no' | 'not-verified'
  state: StagedOutpostCandidate['state']
  created_at: string
  applied_outpost_id: string | null
}

type MatchRow = {
  id: string
  staged_candidate_id: string
  outpost_id: string
  match_kind: StagedOutpostCandidate['matches'][number]['matchKind']
  evidence_summary: string
  state: StagedOutpostCandidate['matches'][number]['state']
}

const stagedSelection = `SELECT candidate.id, candidate.batch_id, candidate.stable_candidate_key,
  candidate.target_outpost_id, candidate.operation, candidate.church, candidate.external_number,
  candidate.campus_suffix, candidate.street_address, candidate.city, geography.name jurisdiction,
  candidate.postal_code, candidate.district_name, candidate.region_name, candidate.fcf_territory_name,
  candidate.language_overlay_name, candidate.program_groups_text, candidate.meeting_information,
  candidate.public_contact_url, candidate.fcf_activity_status, candidate.state, candidate.created_at,
  candidate.applied_outpost_id FROM staged_outpost_candidates candidate
  JOIN civil_geographies geography ON geography.id = candidate.civil_geography_id`

type StagedSourceRow = StagedFieldRow & { candidate_id: string }

function stagedSummary(row: StagedRow, matches: MatchRow[], sources: StagedSourceRow[]): StagedOutpostCandidate {
  return {
    id: row.id, batchId: row.batch_id, candidateKey: row.stable_candidate_key,
    operation: row.operation, targetOutpostId: row.target_outpost_id, church: row.church,
    city: row.city, jurisdiction: row.jurisdiction, outpostNumber: row.external_number,
    campusSuffix: row.campus_suffix, state: row.state, createdAt: row.created_at,
    appliedOutpostId: row.applied_outpost_id,
    sources: sources.map((source) => ({
      field: source.field_path, url: source.source_url, label: source.source_label,
      checkedAt: source.checked_at, factKind: source.fact_kind, mappingSourceUrl: source.mapping_source_url,
    })),
    matches: matches.map((match) => ({
      id: match.id, hubOutpostId: match.outpost_id, matchKind: match.match_kind,
      evidence: match.evidence_summary, state: match.state,
    })),
  }
}

export async function listStagedOutpostCandidates(db: D1Database, params: URLSearchParams) {
  const limit = readPageSize(params)
  const conditions = ['1 = 1']
  const bindings: string[] = []
  if (params.get('state')) { conditions.push('candidate.state = ?'); bindings.push(params.get('state') as string) }
  if (params.get('batch')) { conditions.push('candidate.batch_id = ?'); bindings.push(params.get('batch') as string) }
  if (params.get('cursor')) {
    const [createdAt, id] = decodeCursor(params.get('cursor') as string, 2)
    if (typeof createdAt !== 'string' || typeof id !== 'string') throw new Error('The staged-candidate cursor is invalid.')
    conditions.push('(candidate.created_at, candidate.id) > (?, ?)')
    bindings.push(createdAt, id)
  }
  const rows = await db.prepare(`${stagedSelection} WHERE ${conditions.join(' AND ')}
    ORDER BY candidate.created_at, candidate.id LIMIT ?`).bind(...bindings, limit + 1).all<StagedRow>()
  const pageRows = rows.results.slice(0, limit)
  const ids = pageRows.map((row) => row.id)
  const matches = ids.length ? await db.prepare(`SELECT id, staged_candidate_id, outpost_id, match_kind,
    evidence_summary, state FROM directory_candidate_matches WHERE staged_candidate_id IN
    (${ids.map(() => '?').join(', ')}) ORDER BY id`).bind(...ids).all<MatchRow>() : { results: [] as MatchRow[] }
  const sources = ids.length ? await db.prepare(`SELECT candidate_id, field_path, source_url, source_label,
    checked_at, fact_kind, mapping_source_url FROM staged_outpost_fields WHERE candidate_id IN
    (${ids.map(() => '?').join(', ')}) ORDER BY candidate_id, field_path, id`).bind(...ids).all<StagedSourceRow>()
    : { results: [] as StagedSourceRow[] }
  const counts = await db.prepare('SELECT state, COUNT(*) count FROM staged_outpost_candidates GROUP BY state')
    .all<{ state: string; count: number }>()
  return {
    items: pageRows.map((row) => stagedSummary(
      row,
      matches.results.filter((match) => match.staged_candidate_id === row.id),
      sources.results.filter((source) => source.candidate_id === row.id),
    )),
    nextCursor: rows.results.length > limit
      ? encodeCursor([pageRows[pageRows.length - 1].created_at, pageRows[pageRows.length - 1].id]) : null,
    counts: Object.fromEntries(counts.results.map((row) => [row.state, row.count])),
  }
}

type StagedFieldRow = {
  field_path: string
  source_url: string
  source_label: string
  checked_at: string
  fact_kind: 'direct' | 'derived'
  mapping_source_url: string | null
}

export async function applyStagedOutpostCandidate(db: D1Database, input: {
  candidateId: string
  expectedVersion: number | null
  duplicateDecision: 'confirmed-correction' | 'no-match' | null
  reason: string
  actor: OperatorPrincipal
  now: string
}) {
  if (!input.reason.trim()) throw new Error('Explain the staged-candidate decision.')
  const candidate = await db.prepare(`${stagedSelection} WHERE candidate.id = ?`).bind(input.candidateId).first<StagedRow>()
  if (!candidate || !['staged', 'duplicate-review'].includes(candidate.state)) {
    throw new Error('Only an unapplied staged candidate can be converted.')
  }
  if (candidate.state === 'duplicate-review') {
    const correctionConfirmed = candidate.operation === 'correction' && input.duplicateDecision === 'confirmed-correction'
    if (!correctionConfirmed && input.duplicateDecision !== 'no-match') {
      throw new Error('Resolve the duplicate evidence before conversion.')
    }
  }
  const previous = candidate.operation === 'correction'
    ? await getOperatorRecord(db, candidate.target_outpost_id as string) : null
  if (candidate.operation === 'correction' && (!previous || previous.kind !== 'outpost')) {
    throw new Error('The correction target is no longer available.')
  }
  const outpostId = previous?.id ?? crypto.randomUUID()
  const fields = await db.prepare(`SELECT field_path, source_url, source_label, checked_at,
    fact_kind, mapping_source_url FROM staged_outpost_fields WHERE candidate_id = ? ORDER BY id`)
    .bind(candidate.id).all<StagedFieldRow>()
  const sources = fields.results.flatMap((field) => {
    const fieldName = field.field_path === 'fcfActivityStatus' ? 'activeFcf' : field.field_path
    const exact = [{ id: '', fieldName, label: field.source_label, url: field.source_url, verifiedAt: field.checked_at }]
    if (field.fact_kind === 'derived' && field.mapping_source_url) exact.push({
      id: '', fieldName, label: `${field.source_label} — mapping`.slice(0, 200),
      url: field.mapping_source_url, verifiedAt: field.checked_at,
    })
    return exact
  })
  const details: OutpostDetails = {
    hubOutpostId: outpostId,
    outpostNumber: candidate.external_number,
    campusSuffix: candidate.campus_suffix,
    church: candidate.church,
    streetAddress: candidate.street_address,
    city: candidate.city,
    jurisdiction: candidate.jurisdiction,
    postalCode: candidate.postal_code,
    district: candidate.district_name ?? '',
    region: candidate.region_name ?? '',
    languageOverlay: candidate.language_overlay_name ?? '',
    fcfTerritory: candidate.fcf_territory_name ?? '',
    activeFcf: candidate.fcf_activity_status === 'not-verified'
      ? null : candidate.fcf_activity_status === 'yes',
    programs: candidate.program_groups_text ? candidate.program_groups_text.split('\u001f') : [],
    meeting: candidate.meeting_information,
    contactUrl: candidate.public_contact_url,
  }
  const label = details.outpostNumber ? `Outpost ${details.outpostNumber}` : 'Royal Rangers Outpost'
  const record: EditableRecord = {
    kind: 'outpost', slug: previous?.slug ?? `${candidate.stable_candidate_key}-${outpostId.slice(0, 8)}`,
    title: `${label} · ${details.church}`,
    summary: `Operator draft for ${details.church} in ${details.city}, ${details.jurisdiction}.`,
    status: 'draft', details, verifiedAt: null, sources,
  }
  const tail = [
    db.prepare(`UPDATE staged_outpost_candidates SET state = 'converted-to-draft', applied_at = ?,
      applied_outpost_id = ? WHERE id = ? AND state = ?`).bind(input.now, outpostId, candidate.id, candidate.state),
    db.prepare(`UPDATE directory_candidate_matches SET state = ?, resolved_at = ?, operator_tenure_id = ?
      WHERE staged_candidate_id = ? AND state = 'candidate'`).bind(
      input.duplicateDecision === 'confirmed-correction' ? 'confirmed-duplicate' : 'dismissed',
      input.now, input.actor.tenureNumber, candidate.id,
    ),
    db.prepare(`UPDATE population_batches SET applied_count =
      (SELECT COUNT(*) FROM staged_outpost_candidates applied
        WHERE applied.batch_id = population_batches.id AND applied.state = 'converted-to-draft'),
      state = CASE WHEN staged_count = (SELECT COUNT(*) FROM staged_outpost_candidates applied
        WHERE applied.batch_id = population_batches.id AND applied.state = 'converted-to-draft')
        THEN 'applied' ELSE 'partially-applied' END WHERE id = ?`).bind(candidate.batch_id),
    db.prepare(`INSERT INTO population_candidate_apply_checks
      (candidate_id, expected_outpost_id, expected_applied_at) VALUES (?, ?, ?)`)
      .bind(candidate.id, outpostId, input.now),
  ]
  await saveNormalizedRecord(db, outpostId, record, input.actor, input.reason.trim(), previous,
    previous ? input.expectedVersion : null, tail)
  return outpostId
}
