import type {
  DirectorySubmissionDetail,
  DirectorySubmissionState,
  DirectorySubmissionSummary,
} from '../shared/domain'
import { listingVerificationSchedule } from '../shared/us-directory'
import type { OperatorPrincipal } from './operator-lifecycle-repository'
import { decodeCursor, encodeCursor, readPageSize } from './pagination'
import { getOperatorRecord } from './content-repository'
import { saveNormalizedRecord, type EditableRecord } from './content-writes'
import type { OutpostDetails } from '../shared/domain'

type SubmissionRow = {
  id: string
  reference_code: string
  submission_type: 'new-listing' | 'correction'
  target_outpost_id: string | null
  church: string
  external_number: string | null
  campus_suffix: string | null
  street_address: string | null
  city: string
  jurisdiction: string
  postal_code: string | null
  district_name: string | null
  language_overlay_name: string | null
  program_groups_text: string
  meeting_information: string | null
  source_url: string
  fcf_activity_status: 'yes' | 'no' | 'not-verified'
  reply_email: string | null
  private_notes: string | null
  state: DirectorySubmissionState
  likely_duplicate: number
  created_at: string
  retention_deadline: string
  pii_scrubbed_at: string | null
}

function summary(row: SubmissionRow): DirectorySubmissionSummary {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    submissionType: row.submission_type,
    targetOutpostId: row.target_outpost_id,
    church: row.church,
    city: row.city,
    jurisdiction: row.jurisdiction,
    state: row.state,
    likelyDuplicate: row.likely_duplicate === 1,
    createdAt: row.created_at,
    retentionDeadline: row.retention_deadline,
    piiScrubbedAt: row.pii_scrubbed_at,
  }
}

const selection = `SELECT submission.id, submission.reference_code, submission.submission_type,
  submission.target_outpost_id, submission.church, submission.external_number, submission.campus_suffix,
  submission.street_address, submission.city, geography.name jurisdiction, submission.postal_code,
  submission.district_name, submission.language_overlay_name, submission.program_groups_text,
  submission.meeting_information, submission.source_url, submission.fcf_activity_status,
  submission.reply_email, submission.private_notes, submission.state, submission.likely_duplicate,
  submission.created_at, submission.retention_deadline, submission.pii_scrubbed_at
  FROM directory_submissions submission
  JOIN civil_geographies geography ON geography.id = submission.civil_geography_id`

export async function listDirectorySubmissions(db: D1Database, params: URLSearchParams) {
  const limit = readPageSize(params)
  const where: string[] = ['1 = 1']
  const bindings: Array<string | number> = []
  const state = params.get('state')
  const jurisdiction = params.get('jurisdiction')
  const type = params.get('type')
  const duplicate = params.get('duplicate')
  const age = params.get('age')
  const cursor = params.get('cursor')
  if (state) { where.push('submission.state = ?'); bindings.push(state) }
  if (jurisdiction) { where.push('geography.name = ?'); bindings.push(jurisdiction) }
  if (type) { where.push('submission.submission_type = ?'); bindings.push(type) }
  if (duplicate === 'yes') where.push('submission.likely_duplicate = 1')
  if (duplicate === 'no') where.push('submission.likely_duplicate = 0')
  if (age === 'older-30-days') where.push("submission.created_at <= datetime('now', '-30 days')")
  else if (age === 'retention-due') where.push("submission.retention_deadline <= datetime('now') AND submission.pii_scrubbed_at IS NULL")
  else if (age) throw new Error('Choose a supported proposal age filter.')
  if (cursor) {
    const [createdAt, id] = decodeCursor(cursor, 2)
    if (typeof createdAt !== 'string' || typeof id !== 'string') throw new Error('The proposal cursor is invalid.')
    where.push('(submission.created_at, submission.id) > (?, ?)')
    bindings.push(createdAt, id)
  }
  const rows = await db.prepare(`${selection} WHERE ${where.join(' AND ')}
    ORDER BY submission.created_at, submission.id LIMIT ?`).bind(...bindings, limit + 1).all<SubmissionRow>()
  const counts = await db.prepare(`SELECT state, COUNT(*) count FROM directory_submissions GROUP BY state`)
    .all<{ state: DirectorySubmissionState; count: number }>()
  return {
    items: rows.results.slice(0, limit).map(summary),
    nextCursor: rows.results.length > limit
      ? encodeCursor([rows.results[limit - 1].created_at, rows.results[limit - 1].id]) : null,
    counts: Object.fromEntries(counts.results.map((row) => [row.state, row.count])),
  }
}

export async function getDirectorySubmission(db: D1Database, id: string): Promise<DirectorySubmissionDetail | null> {
  const row = await db.prepare(`${selection} WHERE submission.id = ?`).bind(id).first<SubmissionRow>()
  if (!row) return null
  const events = await db.prepare(`SELECT id, action, reason, related_outpost_id, operator_tenure_id, created_at
    FROM directory_submission_events WHERE submission_id = ? ORDER BY id`).bind(id).all<{
      id: number; action: string; reason: string | null; related_outpost_id: string | null
      operator_tenure_id: number | null; created_at: string
    }>()
  const matches = await db.prepare(`SELECT id, outpost_id, match_kind, evidence_summary, state
    FROM directory_candidate_matches WHERE submission_id = ? ORDER BY id`).bind(id).all<{
      id: string; outpost_id: string
      match_kind: DirectorySubmissionDetail['matches'][number]['matchKind']
      evidence_summary: string; state: DirectorySubmissionDetail['matches'][number]['state']
    }>()
  return {
    ...summary(row),
    outpostNumber: row.external_number,
    campusSuffix: row.campus_suffix,
    streetAddress: row.street_address,
    postalCode: row.postal_code,
    district: row.district_name,
    languageOverlay: row.language_overlay_name,
    programs: row.program_groups_text ? row.program_groups_text.split('\u001f') : [],
    meeting: row.meeting_information,
    sourceUrl: row.source_url,
    fcfActivityStatus: row.fcf_activity_status,
    replyEmail: row.reply_email,
    notes: row.private_notes,
    matches: matches.results.map((match) => ({
      id: match.id, hubOutpostId: match.outpost_id, matchKind: match.match_kind,
      evidence: match.evidence_summary, state: match.state,
    })),
    events: events.results.map((event) => ({
      id: event.id, action: event.action, reason: event.reason, relatedOutpostId: event.related_outpost_id,
      operatorTenureId: event.operator_tenure_id, createdAt: event.created_at,
    })),
  }
}

const actions: Record<string, { state: DirectorySubmissionState; event: string; terminal: boolean }> = {
  triage: { state: 'triage', event: 'triage-started', terminal: false },
  'needs-information': { state: 'needs-information', event: 'needs-information', terminal: false },
  duplicate: { state: 'duplicate', event: 'marked-duplicate', terminal: true },
  'verified-ready': { state: 'verified-ready', event: 'verified-ready', terminal: false },
  reject: { state: 'rejected', event: 'rejected', terminal: true },
  withdraw: { state: 'withdrawn', event: 'withdrawn', terminal: true },
}

export async function transitionDirectorySubmission(db: D1Database, input: {
  id: string
  action: string
  reason: string
  relatedOutpostId: string | null
  actor: OperatorPrincipal
  now: string
}) {
  const transition = actions[input.action]
  if (!transition) throw new Error('Choose a valid proposal action.')
  if (!input.reason.trim()) throw new Error('Explain the proposal decision.')
  const current = await db.prepare('SELECT state FROM directory_submissions WHERE id = ?')
    .bind(input.id).first<{ state: DirectorySubmissionState }>()
  if (!current) throw new Error('Proposal not found.')
  if (['duplicate', 'converted', 'rejected', 'withdrawn', 'pii-scrubbed'].includes(current.state)) {
    throw new Error('A terminal proposal cannot transition again.')
  }
  if (input.action === 'duplicate') {
    if (!input.relatedOutpostId) throw new Error('Choose the stable Hub Outpost ID for the confirmed duplicate.')
    const target = await db.prepare('SELECT content_id FROM outposts WHERE content_id = ?')
      .bind(input.relatedOutpostId).first<{ content_id: string }>()
    if (!target) throw new Error('Choose an existing stable Hub Outpost ID for the duplicate.')
  }
  const scrub = transition.terminal
  await db.batch([
    db.prepare(`UPDATE directory_submissions SET state = ?, likely_duplicate = CASE WHEN ? = 'duplicate' THEN 1 ELSE likely_duplicate END,
      updated_at = ?, disposed_at = CASE WHEN ? THEN ? ELSE NULL END,
      pii_scrubbed_at = CASE WHEN ? THEN ? ELSE NULL END,
      reply_email = CASE WHEN ? THEN NULL ELSE reply_email END,
      private_notes = CASE WHEN ? THEN NULL ELSE private_notes END
      WHERE id = ? AND state NOT IN ('duplicate', 'converted', 'rejected', 'withdrawn', 'pii-scrubbed')`)
      .bind(transition.state, transition.state, input.now, scrub ? 1 : 0, input.now,
        scrub ? 1 : 0, input.now, scrub ? 1 : 0, scrub ? 1 : 0, input.id),
    db.prepare(`INSERT INTO directory_submission_events
      (submission_id, action, reason, related_outpost_id, operator_tenure_id, created_at)
      SELECT id, ?, ?, (SELECT content_id FROM outposts WHERE content_id = ?), ?, ?
      FROM directory_submissions WHERE id = ? AND state = ?`)
      .bind(transition.event, input.reason.trim(), input.relatedOutpostId, input.actor.tenureNumber,
        input.now, input.id, transition.state),
    db.prepare(`INSERT INTO directory_submission_transition_checks
      (submission_id, expected_state, expected_event, checked_at) VALUES (?, ?, ?, ?)`)
      .bind(input.id, transition.state, transition.event, input.now),
    db.prepare(`UPDATE directory_candidate_matches SET state = CASE
        WHEN ? = 'duplicate' AND outpost_id = ? THEN 'confirmed-duplicate' ELSE 'dismissed' END,
      resolved_at = ?, operator_tenure_id = ? WHERE submission_id = ? AND state = 'candidate'
        AND ? IN ('duplicate', 'reject', 'withdraw')`)
      .bind(input.action, input.relatedOutpostId, input.now, input.actor.tenureNumber, input.id, input.action),
  ])
}

export async function scrubDirectorySubmission(db: D1Database, input: {
  id: string
  reason: string
  actor: OperatorPrincipal
  now: string
}) {
  if (!input.reason.trim()) throw new Error('Explain why personal data is being scrubbed.')
  const current = await db.prepare('SELECT state FROM directory_submissions WHERE id = ?')
    .bind(input.id).first<{ state: DirectorySubmissionState }>()
  if (!current) throw new Error('Proposal not found.')
  if (['duplicate', 'converted', 'rejected', 'withdrawn', 'pii-scrubbed'].includes(current.state)) {
    throw new Error('Proposal personal data is already disposed.')
  }
  await db.batch([
    db.prepare(`UPDATE directory_submissions SET reply_email = NULL, private_notes = NULL,
      state = 'pii-scrubbed', disposed_at = ?, pii_scrubbed_at = ?, updated_at = ?
      WHERE id = ? AND state = ?`)
      .bind(input.now, input.now, input.now, input.id, current.state),
    db.prepare(`INSERT INTO directory_submission_events
      (submission_id, action, reason, operator_tenure_id, created_at)
      SELECT id, 'personal-data-scrubbed', ?, ?, ? FROM directory_submissions WHERE id = ?`)
      .bind(input.reason.trim(), input.actor.tenureNumber, input.now, input.id),
    db.prepare(`INSERT INTO directory_submission_transition_checks
      (submission_id, expected_state, expected_event, checked_at)
      VALUES (?, 'pii-scrubbed', 'personal-data-scrubbed', ?)`)
      .bind(input.id, input.now),
  ])
}

const verifiableFields = [
  'church', 'outpostNumber', 'campusSuffix', 'streetAddress', 'city', 'jurisdiction', 'postalCode',
  'district', 'languageOverlay', 'programs', 'meeting', 'contactUrl', 'activeFcf',
] as const

export async function convertDirectorySubmissionToDraft(db: D1Database, input: {
  submissionId: string
  verifiedFields: string[]
  sourceLabel: string
  checkedAt: string
  reason: string
  expectedVersion: number | null
  actor: OperatorPrincipal
  now: string
}) {
  const submission = await getDirectorySubmission(db, input.submissionId)
  if (!submission || submission.state !== 'verified-ready') throw new Error('Only a verified-ready proposal can be converted.')
  if (!input.sourceLabel.trim() || input.sourceLabel.trim().length > 200) throw new Error('Provide a bounded Source Document label.')
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(input.checkedAt) || Date.parse(input.checkedAt) > Date.parse(input.now)) {
    throw new Error('Provide a valid source check date that is not in the future.')
  }
  if (!input.reason.trim()) throw new Error('Explain the draft conversion.')
  const selected = new Set(input.verifiedFields)
  if (selected.size !== input.verifiedFields.length || [...selected].some((field) => !verifiableFields.includes(field as never))) {
    throw new Error('Choose each supported field at most once.')
  }
  for (const core of ['church', 'city', 'jurisdiction']) {
    if (!selected.has(core)) throw new Error(`Verify the core ${core} field before conversion.`)
  }

  const id = submission.submissionType === 'correction'
    ? submission.targetOutpostId as string
    : crypto.randomUUID()
  const previous = submission.submissionType === 'correction' ? await getOperatorRecord(db, id) : null
  if (submission.submissionType === 'correction' && (!previous || previous.kind !== 'outpost')) {
    throw new Error('The correction target is no longer available.')
  }
  const detail = (field: string, value: unknown, fallback: unknown) => selected.has(field) ? value : fallback
  const details: OutpostDetails = {
    hubOutpostId: id,
    outpostNumber: detail('outpostNumber', submission.outpostNumber, null) as string | null,
    campusSuffix: detail('campusSuffix', submission.campusSuffix, null) as string | null,
    church: submission.church,
    streetAddress: detail('streetAddress', submission.streetAddress, null) as string | null,
    city: submission.city,
    jurisdiction: submission.jurisdiction,
    postalCode: detail('postalCode', submission.postalCode, null) as string | null,
    district: detail('district', submission.district, '') as string,
    region: '',
    languageOverlay: detail('languageOverlay', submission.languageOverlay, '') as string,
    fcfTerritory: '',
    activeFcf: selected.has('activeFcf')
      ? submission.fcfActivityStatus === 'not-verified' ? null : submission.fcfActivityStatus === 'yes'
      : null,
    programs: detail('programs', submission.programs, []) as string[],
    meeting: detail('meeting', submission.meeting, null) as string | null,
    contactUrl: detail('contactUrl', submission.sourceUrl, null) as string | null,
  }
  const sources = [...selected].map((field) => ({
    id: '', fieldName: field, label: input.sourceLabel.trim(), url: submission.sourceUrl, verifiedAt: input.checkedAt,
  }))
  const titleLabel = details.outpostNumber ? `Outpost ${details.outpostNumber}` : 'Royal Rangers Outpost'
  const record: EditableRecord = {
    kind: 'outpost',
    slug: previous?.slug ?? `outpost-${id}`,
    title: `${titleLabel} · ${details.church}`,
    summary: `Operator draft for ${details.church} in ${details.city}, ${details.jurisdiction}.`,
    status: 'draft',
    details,
    verifiedAt: null,
    sources,
  }
  const tail = [
    db.prepare(`UPDATE directory_submissions SET state = 'converted', disposed_at = ?, pii_scrubbed_at = ?,
      reply_email = NULL, private_notes = NULL, updated_at = ? WHERE id = ? AND state = 'verified-ready'`)
      .bind(input.now, input.now, input.now, input.submissionId),
    db.prepare(`INSERT INTO directory_submission_events
      (submission_id, action, reason, related_outpost_id, operator_tenure_id, created_at)
      SELECT id, 'converted-to-draft', ?, ?, ?, ? FROM directory_submissions
      WHERE id = ? AND state = 'converted'`)
      .bind(input.reason.trim(), id, input.actor.tenureNumber, input.now, input.submissionId),
    db.prepare(`INSERT INTO directory_submission_transition_checks
      (submission_id, expected_state, expected_event, checked_at)
      VALUES (?, 'converted', 'converted-to-draft', ?)`)
      .bind(input.submissionId, input.now),
    db.prepare(`UPDATE directory_candidate_matches SET state = CASE WHEN outpost_id = ?
        THEN 'confirmed-duplicate' ELSE 'dismissed' END, resolved_at = ?, operator_tenure_id = ?
      WHERE submission_id = ? AND state = 'candidate'`)
      .bind(submission.submissionType === 'correction' ? id : '', input.now, input.actor.tenureNumber, input.submissionId),
  ]
  await saveNormalizedRecord(db, id, record, input.actor, input.reason.trim(), previous,
    previous ? input.expectedVersion : null, tail)
  return id
}

export async function updateOutpostLifecycle(db: D1Database, input: {
  outpostId: string
  action: 'grace' | 'expire' | 'archive'
  reason: string
  archiveSourceId?: string
  effectiveAt?: string
  actor: OperatorPrincipal
  now: string
}) {
  if (!input.reason.trim()) throw new Error('Explain the lifecycle action.')
  const current = await db.prepare(`SELECT lifecycle.state, lifecycle.next_verification_due_at, lifecycle.grace_ends_at,
    content.version FROM outpost_lifecycle lifecycle JOIN content_records content
    ON content.id = lifecycle.outpost_id WHERE lifecycle.outpost_id = ?`)
    .bind(input.outpostId).first<{
      state: string; next_verification_due_at: string | null; grace_ends_at: string | null; version: number
    }>()
  if (!current) throw new Error('The Outpost lifecycle record was not found.')
  if (input.action === 'grace') {
    if (current.state !== 'verified' || !current.next_verification_due_at || !current.grace_ends_at
      || current.next_verification_due_at > input.now || current.grace_ends_at < input.now) {
      throw new Error('The Listing Verification grace period is not currently open.')
    }
    await db.batch([
      db.prepare(`UPDATE outpost_lifecycle SET state = 'grace', version = version + 1,
        updated_at = ? WHERE outpost_id = ? AND state = 'verified'
        AND next_verification_due_at <= ? AND grace_ends_at >= ?`)
        .bind(input.now, input.outpostId, input.now, input.now),
      db.prepare(`INSERT INTO content_audit_events
        (content_id, stable_scope_id, action, actor_label, reason, created_at, operator_tenure_id)
        SELECT ?, ?, 'Listing Verification entered grace', ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM outpost_lifecycle WHERE outpost_id = ? AND state = 'grace')`)
        .bind(input.outpostId, input.outpostId, input.actor.label, input.reason.trim(), input.now,
          input.actor.tenureNumber, input.outpostId),
    ])
    return
  }
  if (input.action === 'expire') {
    if (!['verified', 'grace'].includes(current.state) || !current.grace_ends_at || current.grace_ends_at >= input.now) {
      throw new Error('The Listing Verification grace period has not ended.')
    }
    await db.batch([
      db.prepare(`UPDATE outpost_lifecycle SET state = 'verification-expired', version = version + 1,
        updated_at = ? WHERE outpost_id = ? AND grace_ends_at < ? AND state IN ('verified', 'grace')`)
        .bind(input.now, input.outpostId, input.now),
      db.prepare(`INSERT INTO content_audit_events
        (content_id, stable_scope_id, action, actor_label, reason, created_at, operator_tenure_id)
        SELECT ?, ?, 'Listing Verification expired', ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM outpost_lifecycle WHERE outpost_id = ? AND state = 'verification-expired')`)
        .bind(input.outpostId, input.outpostId, input.actor.label, input.reason.trim(), input.now,
          input.actor.tenureNumber, input.outpostId),
    ])
    return
  }
  if (!input.archiveSourceId || !input.effectiveAt) throw new Error('Archive requires an effective date and affirmative Source Document.')
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(input.effectiveAt)
    || Number.isNaN(Date.parse(input.effectiveAt)) || Date.parse(input.effectiveAt) > Date.parse(input.now)) {
    throw new Error('Archive effective date must be a valid date that is not in the future.')
  }
  if (current.state === 'archived') throw new Error('The Outpost is already archived.')
  const archiveSource = await db.prepare(`SELECT id FROM source_documents WHERE id = ?
    AND EXISTS (SELECT 1 FROM field_provenance WHERE content_id = ? AND source_document_id = source_documents.id)`)
    .bind(input.archiveSourceId, input.outpostId).first<{ id: string }>()
  if (!archiveSource) throw new Error('Choose an affirmative Source Document already attached to this Outpost.')
  const nextVersion = current.version + 1
  await db.batch([
    db.prepare(`UPDATE outpost_lifecycle SET state = 'archived', archived_effective_at = ?, archive_reason = ?,
      archive_source_document_id = (SELECT id FROM source_documents WHERE id = ?), version = version + 1,
      updated_at = ? WHERE outpost_id = ?`)
      .bind(input.effectiveAt, input.reason.trim(), input.archiveSourceId, input.now, input.outpostId),
    db.prepare(`UPDATE content_records SET status = 'archived', version = version + 1, updated_at = ? WHERE id = ?`)
      .bind(input.now, input.outpostId),
    db.prepare(`INSERT INTO content_revisions
      (id, content_id, version, status, snapshot_json, actor_label, reason, created_at, operator_tenure_id)
      SELECT ?, id, ?, 'archived', json_object(
        'id', id, 'kind', kind, 'slug', slug, 'title', title, 'summary', summary,
        'status', 'archived', 'details', json(details_json), 'verifiedAt', verified_at,
        'publishedAt', published_at, 'updatedAt', ?, 'version', ?), ?, ?, ?, ?
      FROM content_records WHERE id = ? AND version = ?`)
      .bind(`${input.outpostId}:${nextVersion}`, nextVersion, input.now, nextVersion, input.actor.label,
        input.reason.trim(), input.now, input.actor.tenureNumber, input.outpostId, nextVersion),
    db.prepare(`INSERT INTO content_audit_events
      (content_id, stable_scope_id, action, actor_label, after_json, reason, created_at, operator_tenure_id)
      SELECT ?, ?, 'Outpost archived', ?, json_object('effectiveAt', ?, 'sourceId', ?), ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM outpost_lifecycle WHERE outpost_id = ? AND state = 'archived')`)
      .bind(input.outpostId, input.outpostId, input.actor.label, input.effectiveAt, input.archiveSourceId,
        input.reason.trim(), input.now, input.actor.tenureNumber, input.outpostId),
  ])
}

export function verificationScheduleForOperator(verifiedAt: string) {
  return listingVerificationSchedule(verifiedAt)
}
