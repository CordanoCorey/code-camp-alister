import type {
  AdvancementDetails,
  ContentRecord,
  EventDetails,
  OrganizationDetails,
  OutpostDetails,
  PageDetails,
} from '../shared/domain'
import type { OperatorPrincipal } from './operator-lifecycle-repository'
import { listingVerificationSchedule } from '../shared/us-directory'

export type EditableRecord = Pick<
  ContentRecord,
  'kind' | 'slug' | 'title' | 'summary' | 'status' | 'details' | 'verifiedAt' | 'sources'
>

function deleteAndInsertFacts(db: D1Database, id: string, input: EditableRecord) {
  const statements: D1PreparedStatement[] = []
  if (input.kind === 'outpost') {
    const details = input.details as OutpostDetails
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO civil_geographies
        (id, geography_type, name, code, country_code, parent_id, display_order, display_label)
        SELECT ?, 'municipality', ?, NULL, ?, 'country-' || lower(?), 1000, ?
        WHERE ? <> (SELECT name FROM countries WHERE code = ?)
          AND NOT EXISTS (SELECT 1 FROM civil_geographies WHERE country_code = ? AND name = ?)`)
        .bind(`civil-${(details.countryCode ?? 'US').toLowerCase()}-${details.jurisdiction.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`,
          details.jurisdiction, details.countryCode ?? 'US', details.countryCode ?? 'US', details.civilSubdivisionLabel ?? null,
          details.jurisdiction, details.countryCode ?? 'US', details.countryCode ?? 'US', details.jurisdiction),
      db.prepare(`INSERT INTO outposts
        (content_id, hub_outpost_id, national_program_id, external_number, campus_suffix, church,
         street_address, city, civil_geography_id, postal_code, meeting_information, public_contact_url,
         fcf_activity_status, local_unit_label, identifier_raw, display_name_raw)
        SELECT ?, ?, program.id, ?, ?, ?, ?, ?, geography.id, ?, ?, ?, ?, ?, ?, ?
        FROM national_programs program
        JOIN civil_geographies geography ON geography.country_code = program.country_code
          AND geography.name = ?
        WHERE program.country_code = ?
        ON CONFLICT(content_id) DO UPDATE SET national_program_id = excluded.national_program_id,
          external_number = excluded.external_number,
          campus_suffix = excluded.campus_suffix, church = excluded.church,
          street_address = excluded.street_address, city = excluded.city,
          civil_geography_id = excluded.civil_geography_id, postal_code = excluded.postal_code,
          meeting_information = excluded.meeting_information, public_contact_url = excluded.public_contact_url,
          fcf_activity_status = excluded.fcf_activity_status, local_unit_label = excluded.local_unit_label,
          identifier_raw = excluded.identifier_raw, display_name_raw = excluded.display_name_raw`)
        .bind(id, id, details.outpostNumber, details.campusSuffix, details.church.trim(), details.streetAddress,
          details.city.trim(), details.postalCode, details.meeting, details.contactUrl,
          details.activeFcf === null ? 'not-verified' : details.activeFcf ? 'yes' : 'no', details.localUnitLabel ?? 'Outpost',
          details.identifierRaw ?? details.outpostNumber ?? null, details.displayNameRaw ?? null, details.jurisdiction,
          details.countryCode || 'US'),
      db.prepare('DELETE FROM outpost_affiliations WHERE outpost_id = ?').bind(id),
      db.prepare('DELETE FROM outpost_program_groups WHERE outpost_id = ?').bind(id),
    )
    const affiliationFacts: Array<[string, string]> = [
      ['geographic-district', details.district],
      ['geographic-region', details.region],
      ['language-overlay', details.languageOverlay],
      ['fcf-territory', details.fcfTerritory],
      ...(details.affiliations ?? []).map((item) => [item.scope === 'language' ? 'language-overlay' : item.scope === 'fcf' ? 'fcf-territory' : 'other', item.name] as [string, string]),
    ]
    for (const [type, name] of new Map(affiliationFacts.filter(([, name]) => name).map((item) => [`${item[0]}|${item[1]}`, item])).values()) {
      if (name) statements.push(db.prepare(`INSERT INTO outpost_affiliations (outpost_id, organization_id, affiliation_type)
        SELECT ?, id, ? FROM organization_units WHERE name = ? AND national_program_id = (
          SELECT id FROM national_programs WHERE country_code = ?
        )`).bind(id, type, name, details.countryCode || 'US'))
    }
    details.programs.forEach((name, order) => statements.push(
      db.prepare(`INSERT INTO outpost_program_groups (outpost_id, program_group_id, display_order)
        SELECT ?, item.content_id, ? FROM advancement_items item JOIN content_records content ON content.id = item.content_id
        WHERE item.subtype = 'program-group' AND content.title = ?`).bind(id, order, name),
    ))
  } else if (input.kind === 'event') {
    const details = input.details as EventDetails
    if (details.series) statements.push(db.prepare(`INSERT INTO event_series (id, name) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name`).bind(details.series.id, details.series.name))
    statements.push(
      db.prepare(`INSERT INTO event_occurrences
        (content_id, occurrence_id, series_id, category, host, scope, start_date, end_date, start_time,
         end_time, time_zone, all_day, location_status, location, registration_status, registration_url,
         registration_deadline, deadline_exception_note, cost_status, cost_note, lifecycle_status, official_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(content_id) DO UPDATE SET occurrence_id = excluded.occurrence_id,
          series_id = excluded.series_id, category = excluded.category, host = excluded.host,
          scope = excluded.scope, start_date = excluded.start_date, end_date = excluded.end_date,
          start_time = excluded.start_time, end_time = excluded.end_time, time_zone = excluded.time_zone,
          all_day = excluded.all_day, location_status = excluded.location_status, location = excluded.location,
          registration_status = excluded.registration_status, registration_url = excluded.registration_url,
          registration_deadline = excluded.registration_deadline,
          deadline_exception_note = excluded.deadline_exception_note, cost_status = excluded.cost_status,
          cost_note = excluded.cost_note, lifecycle_status = excluded.lifecycle_status,
          official_url = excluded.official_url`).bind(
        id, details.occurrenceId, details.series?.id ?? null, details.category, details.host, details.scope,
        details.startDate, details.endDate, details.startTime, details.endTime, details.timeZone,
        details.allDay ? 1 : 0, details.locationStatus, details.location, details.registrationStatus,
        details.registrationUrl, details.registrationDeadline, details.deadlineExceptionNote,
        details.costStatus, details.costNote, details.lifecycleStatus, details.officialUrl,
      ),
      db.prepare('DELETE FROM event_organization_relations WHERE occurrence_id = ?').bind(id),
      db.prepare('DELETE FROM event_audiences WHERE occurrence_id = ?').bind(id),
    )
    details.relatedOrganizations.forEach((organization, order) => statements.push(
      db.prepare(`INSERT INTO event_organization_relations
        (occurrence_id, referenced_id, organization_id, display_name, display_order)
        VALUES (?, ?, (SELECT id FROM organization_units WHERE id = ?), ?, ?)`)
        .bind(id, organization.id, organization.id, organization.name, order),
    ))
    details.audience.forEach((audience, order) => statements.push(
      db.prepare('INSERT INTO event_audiences (occurrence_id, audience, display_order) VALUES (?, ?, ?)')
        .bind(id, audience, order),
    ))
  } else if (input.kind === 'advancement') {
    const details = input.details as AdvancementDetails
    statements.push(
      db.prepare(`INSERT INTO advancement_items
        (content_id, subtype, grade_range, official_url, content_status, accent, merit_category,
         award_level, publisher, item_number, edition, revision, publication_year, availability)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(content_id) DO UPDATE SET subtype = excluded.subtype, grade_range = excluded.grade_range,
          official_url = excluded.official_url, content_status = excluded.content_status,
          accent = excluded.accent, merit_category = excluded.merit_category,
          award_level = excluded.award_level, publisher = excluded.publisher,
          item_number = excluded.item_number, edition = excluded.edition, revision = excluded.revision,
          publication_year = excluded.publication_year, availability = excluded.availability`).bind(
        id, details.subtype, details.gradeRange, details.officialUrl, details.contentStatus,
        details.subtype === 'program-group' ? details.accent : null,
        details.subtype === 'merit' ? details.meritCategory : null,
        details.subtype === 'award' ? details.awardLevel : null,
        details.subtype === 'handbook' ? details.publisher : null,
        details.subtype === 'handbook' ? details.itemNumber : null,
        details.subtype === 'handbook' ? details.edition : null,
        details.subtype === 'handbook' ? details.revision : null,
        details.subtype === 'handbook' ? details.publicationYear : null,
        details.subtype === 'handbook' ? details.availability : null,
      ),
      db.prepare('DELETE FROM advancement_program_groups WHERE advancement_id = ?').bind(id),
      db.prepare('DELETE FROM advancement_audiences WHERE advancement_id = ?').bind(id),
      db.prepare('DELETE FROM advancement_merit_colors WHERE advancement_id = ?').bind(id),
      db.prepare('DELETE FROM advancement_relationships WHERE source_id = ?').bind(id),
      db.prepare('DELETE FROM advancement_highlights WHERE advancement_id = ?').bind(id),
      db.prepare('DELETE FROM handbook_formats WHERE advancement_id = ?').bind(id),
      db.prepare('DELETE FROM handbook_purchase_links WHERE advancement_id = ?').bind(id),
    )
    details.programGroups.forEach((name, order) => statements.push(
      db.prepare(`INSERT INTO advancement_program_groups (advancement_id, program_group_id, display_order)
        SELECT ?, item.content_id, ? FROM advancement_items item JOIN content_records content ON content.id = item.content_id
        WHERE item.subtype = 'program-group' AND content.title = ?`).bind(id, order, name),
    ))
    details.audiences.forEach((audience, order) => statements.push(
      db.prepare('INSERT INTO advancement_audiences (advancement_id, audience, display_order) VALUES (?, ?, ?)')
        .bind(id, audience, order),
    ))
    if (details.subtype === 'merit') details.colors.forEach((color, order) => statements.push(
      db.prepare('INSERT INTO advancement_merit_colors (advancement_id, color, display_order) VALUES (?, ?, ?)')
        .bind(id, color, order),
    ))
    details.references.forEach((reference, order) => statements.push(
      db.prepare(`INSERT INTO advancement_relationships
        (source_id, target_id, target_subtype, relationship_label, display_order) VALUES (?, ?, ?, ?, ?)`)
        .bind(id, reference.targetId, reference.targetSubtype, reference.relationship, order),
    ))
    if (details.subtype === 'program-group') details.highlights.forEach((highlight, order) => statements.push(
      db.prepare('INSERT INTO advancement_highlights (advancement_id, display_order, text) VALUES (?, ?, ?)')
        .bind(id, order, highlight),
    ))
    if (details.subtype === 'handbook') {
      details.formats.forEach((format, order) => statements.push(
        db.prepare('INSERT INTO handbook_formats (advancement_id, format, display_order) VALUES (?, ?, ?)')
          .bind(id, format, order),
      ))
      details.purchaseUrls.forEach((link, order) => statements.push(
        db.prepare(`INSERT INTO handbook_purchase_links
          (advancement_id, display_order, label, format, url) VALUES (?, ?, ?, ?, ?)`)
          .bind(id, order, link.label, link.format, link.url),
      ))
    }
  } else if (input.kind === 'organization') {
    const details = input.details as OrganizationDetails
    statements.push(
      db.prepare(`INSERT INTO organization_units (id, unit_type, scope, name, national_program_id, display_label)
        SELECT ?, ?, ?, ?, id, ? FROM national_programs WHERE country_code = ?
        ON CONFLICT(id) DO UPDATE SET unit_type = excluded.unit_type,
          scope = excluded.scope, name = excluded.name, national_program_id = excluded.national_program_id,
          display_label = excluded.display_label`).bind(id, details.organizationType, details.scope, input.title.trim(), details.unitLabel, details.countryCode),
      db.prepare('DELETE FROM organization_unit_relationships WHERE subject_id = ?').bind(id),
      db.prepare('DELETE FROM organization_civil_coverage WHERE organization_id = ?').bind(id),
    )
    if (details.parent) {
      statements.push(details.parent === 'Royal Rangers USA'
        ? db.prepare(`INSERT INTO organization_unit_relationships
          (subject_id, relationship_type, related_national_program_id, display_order)
          SELECT ?, 'part-of', id, 0 FROM national_programs WHERE country_code = ?`).bind(id, details.countryCode)
        : db.prepare(`INSERT INTO organization_unit_relationships
          (subject_id, relationship_type, related_unit_id, display_order)
          SELECT ?, 'part-of', id, 0 FROM organization_units WHERE name = ?`).bind(id, details.parent))
    }
    details.affiliations.forEach((name, order) => statements.push(
      db.prepare(`INSERT INTO organization_unit_relationships
        (subject_id, relationship_type, related_unit_id, display_order)
        SELECT ?, 'paired-with', id, ? FROM organization_units WHERE name = ?`).bind(id, order, name),
    ))
    details.jurisdictions.forEach((label) => statements.push(
      db.prepare(`INSERT INTO organization_civil_coverage
        (organization_id, civil_geography_id, coverage_type, display_label)
        SELECT ?, id, ?, ? FROM civil_geographies WHERE country_code = ? AND name = ?`)
        .bind(id, label.includes(' (') ? 'partial' : 'source-described', label, details.countryCode, label.split(' (')[0]),
    ))
  } else {
    const details = input.details as PageDetails
    statements.push(
      db.prepare(`INSERT INTO information_pages (content_id, section) VALUES (?, ?)
        ON CONFLICT(content_id) DO UPDATE SET section = excluded.section`).bind(id, details.section),
      db.prepare('DELETE FROM information_page_body_sections WHERE page_id = ?').bind(id),
      db.prepare('DELETE FROM information_page_links WHERE page_id = ?').bind(id),
    )
    details.body.forEach((body, order) => statements.push(
      db.prepare('INSERT INTO information_page_body_sections (page_id, display_order, body_text) VALUES (?, ?, ?)')
        .bind(id, order, body),
    ))
    details.links.forEach((link, order) => statements.push(
      db.prepare('INSERT INTO information_page_links (page_id, display_order, label, url) VALUES (?, ?, ?, ?)')
        .bind(id, order, link.label, link.url),
    ))
  }
  return statements
}

function safeSearchText(input: EditableRecord) {
  if (input.kind === 'outpost') {
    const details = input.details as OutpostDetails
    return [details.church, details.city, details.jurisdiction, details.countryName, details.outpostNumber,
      ...(details.affiliations ?? []).flatMap((item) => [item.label, item.name])].filter(Boolean).join(' ')
  }
  if (input.kind === 'event') {
    const details = input.details as EventDetails
    return [details.host, details.scope, details.category, details.location, details.series?.name].filter(Boolean).join(' ')
  }
  if (input.kind === 'advancement') {
    const details = input.details as AdvancementDetails
    return [details.subtype, details.gradeRange, details.subtype === 'handbook' ? details.publisher : null].filter(Boolean).join(' ')
  }
  if (input.kind === 'organization') {
    const details = input.details as OrganizationDetails
    return `${details.scope} ${details.organizationType} ${input.title}`
  }
  return (input.details as PageDetails).body.join(' ')
}

function refreshProjections(db: D1Database, id: string, input: EditableRecord) {
  const statements = [
    db.prepare('DELETE FROM public_outpost_directory WHERE content_id = ?').bind(id),
    db.prepare('DELETE FROM public_advancement_directory WHERE content_id = ?').bind(id),
    db.prepare('DELETE FROM public_search_documents WHERE content_id = ?').bind(id),
  ]
  if (input.kind === 'outpost' && input.status === 'published') statements.push(
    db.prepare(`INSERT INTO public_outpost_directory
      (content_id, title_sort, church_sort, national_program_id, external_number, campus_suffix,
       city, civil_geography_id, fcf_activity_status, verified_at)
      SELECT outpost.content_id, lower(content.title), lower(outpost.church), outpost.national_program_id,
        outpost.external_number, outpost.campus_suffix, outpost.city, outpost.civil_geography_id,
        outpost.fcf_activity_status, content.verified_at FROM outposts outpost
      JOIN content_records content ON content.id = outpost.content_id WHERE outpost.content_id = ?`).bind(id),
  )
  if (input.kind === 'advancement' && input.status === 'published') statements.push(
    db.prepare(`INSERT INTO public_advancement_directory
      (content_id, group_order, subtype_order, title_sort, subtype, content_status, merit_category)
      SELECT item.content_id,
        COALESCE((SELECT MIN(CASE group_content.title WHEN 'Ranger Kids' THEN 0 WHEN 'Discovery Rangers' THEN 1
          WHEN 'Adventure Rangers' THEN 2 WHEN 'Expedition Rangers' THEN 3 ELSE 4 END)
          FROM advancement_program_groups relation JOIN content_records group_content ON group_content.id = relation.program_group_id
          WHERE relation.advancement_id = item.content_id), 4),
        CASE item.subtype WHEN 'program-group' THEN 0 WHEN 'achievement-trail' THEN 1 WHEN 'merit' THEN 2 WHEN 'award' THEN 3 ELSE 4 END,
        lower(content.title), item.subtype, item.content_status, item.merit_category
      FROM advancement_items item JOIN content_records content ON content.id = item.content_id
      WHERE item.content_id = ?`).bind(id),
  )
  if (input.status === 'published') statements.push(
    db.prepare(`INSERT INTO public_search_documents (content_id, kind, title, summary, safe_text)
      VALUES (?, ?, ?, ?, ?)`).bind(id, input.kind, input.title.trim(), input.summary.trim(), safeSearchText(input)),
  )
  return statements
}

export async function saveNormalizedRecord(
  db: D1Database,
  id: string,
  input: EditableRecord,
  actor: OperatorPrincipal,
  reason: string,
  previous: ContentRecord | null,
  expectedVersion: number | null,
  transactionTail: D1PreparedStatement[] = [],
  transactionHead: D1PreparedStatement[] = [],
) {
  const isNew = previous === null
  if (!isNew && previous.kind !== input.kind) throw new Error('A record type cannot be changed after creation.')
  if (!isNew && (!Number.isInteger(expectedVersion) || expectedVersion !== previous.version)) {
    throw new Error('This record changed after you opened it. Reload it before saving.')
  }
  const now = new Date().toISOString()
  const publishedAt = input.status === 'published' ? now : null
  const statements: D1PreparedStatement[] = [...transactionHead]
  if (isNew) {
    statements.push(db.prepare(`INSERT INTO content_records
      (id, kind, slug, title, summary, status, details_json, verified_at, published_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).bind(
      id, input.kind, input.slug, input.title.trim(), input.summary.trim(), input.status,
      JSON.stringify(input.details), input.verifiedAt, publishedAt, now,
    ))
  } else {
    statements.push(
      db.prepare(`UPDATE content_records SET slug = ?, title = ?, summary = ?, status = ?,
        verified_at = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END,
        updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`).bind(
        input.slug, input.title.trim(), input.summary.trim(), input.status, input.verifiedAt,
        input.status, publishedAt, now, id, expectedVersion,
      ),
      db.prepare('INSERT INTO content_write_checks (content_id, expected_version) VALUES (?, ?)').bind(id, expectedVersion),
    )
  }
  statements.push(...deleteAndInsertFacts(db, id, input))
  const provenanceIds: string[] = []
  for (const source of input.sources) {
    const documentId = `document-${crypto.randomUUID()}`
    const provenanceId = source.id || crypto.randomUUID()
    provenanceIds.push(provenanceId)
    statements.push(
      db.prepare(`INSERT INTO source_documents (id, url, label, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET label = excluded.label`).bind(documentId, source.url, source.label.trim(), now),
      db.prepare(`INSERT INTO field_provenance
        (id, content_id, field_path, source_document_id, source_label, verified_at)
        SELECT ?, ?, ?, id, ?, ? FROM source_documents WHERE url = ?
        ON CONFLICT(id) DO UPDATE SET content_id = excluded.content_id,
          field_path = excluded.field_path, source_document_id = excluded.source_document_id,
          source_label = excluded.source_label, verified_at = excluded.verified_at`).bind(
        provenanceId, id, source.fieldName, source.label.trim(), source.verifiedAt, source.url,
      ),
    )
  }
  const retainedSources = provenanceIds.map(() => '?').join(', ')
  statements.push(db.prepare(`DELETE FROM field_provenance
    WHERE content_id = ? AND id NOT IN (${retainedSources})`).bind(id, ...provenanceIds))
  if (input.kind === 'outpost') {
    const establishesVerification = input.status === 'published'
      && input.verifiedAt !== null
      && (previous?.status !== 'published' || previous.verifiedAt !== input.verifiedAt)
    if (establishesVerification) {
      const schedule = listingVerificationSchedule(input.verifiedAt as string)
      const cycleId = crypto.randomUUID()
      statements.push(
        db.prepare(`INSERT INTO listing_verification_cycles
          (id, outpost_id, cycle_number, verified_at, next_due_at, grace_ends_at, outcome, reason,
           operator_tenure_id, created_at)
          SELECT ?, ?, COALESCE(MAX(cycle_number), 0) + 1, ?, ?, ?,
            CASE WHEN EXISTS (SELECT 1 FROM outpost_lifecycle WHERE outpost_id = ? AND state = 'archived')
              THEN 'restored-from-archive'
              WHEN EXISTS (SELECT 1 FROM outpost_lifecycle WHERE outpost_id = ? AND state = 'verification-expired')
              THEN 'restored-from-expiry' ELSE 'verified' END,
            ?, ?, ? FROM listing_verification_cycles WHERE outpost_id = ?`)
          .bind(cycleId, id, schedule.lastVerifiedAt, schedule.dueAt, schedule.graceEndsAt,
            id, id, reason, actor.tenureNumber, now, id),
        db.prepare(`INSERT INTO outpost_lifecycle
          (outpost_id, state, last_verified_at, next_verification_due_at, grace_ends_at, version, updated_at)
          VALUES (?, 'verified', ?, ?, ?, 1, ?)
          ON CONFLICT(outpost_id) DO UPDATE SET state = 'verified', last_verified_at = excluded.last_verified_at,
            next_verification_due_at = excluded.next_verification_due_at, grace_ends_at = excluded.grace_ends_at,
            archived_effective_at = NULL, archive_reason = NULL, archive_source_document_id = NULL,
            version = outpost_lifecycle.version + 1, updated_at = excluded.updated_at`)
          .bind(id, schedule.lastVerifiedAt, schedule.dueAt, schedule.graceEndsAt, now),
      )
      provenanceIds.forEach((provenanceId) => statements.push(
        db.prepare(`INSERT INTO listing_verification_provenance
          (verification_cycle_id, provenance_id, source_document_id, field_path, source_label, source_url, verified_at)
          SELECT ?, provenance.id, provenance.source_document_id, provenance.field_path,
            provenance.source_label, document.url, provenance.verified_at
          FROM field_provenance provenance JOIN source_documents document
            ON document.id = provenance.source_document_id WHERE provenance.id = ?`)
          .bind(cycleId, provenanceId),
      ))
    } else if (isNew) {
      statements.push(db.prepare(`INSERT INTO outpost_lifecycle (outpost_id, state, version, updated_at)
        VALUES (?, 'unverified', 1, ?)`).bind(id, now))
    }
  }
  statements.push(...refreshProjections(db, id, input))
  const nextVersion = isNew ? 1 : (expectedVersion as number) + 1
  const after = { ...input, id, version: nextVersion, updatedAt: now, publishedAt }
  statements.push(
    db.prepare(`INSERT INTO content_revisions
      (id, content_id, version, status, snapshot_json, actor_label, reason, created_at, operator_tenure_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      `${id}:${nextVersion}`, id, nextVersion, input.status, JSON.stringify(after), actor.label, reason, now,
      actor.tenureNumber,
    ),
    db.prepare(`INSERT INTO content_audit_events
      (content_id, stable_scope_id, action, actor_label, before_json, after_json, reason, created_at, operator_tenure_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, id, isNew ? 'created' : 'updated', actor.label, previous ? JSON.stringify(previous) : null,
      JSON.stringify(after), reason, now, actor.tenureNumber,
    ),
  )
  statements.push(...transactionTail)
  await db.batch(statements)
}
