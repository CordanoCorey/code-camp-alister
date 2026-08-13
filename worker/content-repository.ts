import type {
  AdvancementDetails,
  ContentRecord,
  CursorPage,
  EventConflict,
  EventConflictAssertion,
  EventDetails,
  FreshnessQueueItem,
  OrganizationDetails,
  OutpostDetails,
  PageDetails,
  PublicBootstrap,
  RecordKind,
  SourceRecord,
} from '../shared/domain'
import { serializePublicRecord } from '../shared/public'
import { decodeCursor, pageFromRows, readPageSize, type CursorValue } from './pagination'

type CommonRow = {
  id: string
  kind: RecordKind
  slug: string
  title: string
  summary: string
  status: ContentRecord['status']
  verified_at: string | null
  published_at: string | null
  updated_at: string
  version: number
}

type IdRow = { id: string; [key: string]: CursorValue }
type DetailRow = { id: string; [key: string]: string | number | null }
type ProvenanceRow = {
  id: string
  content_id: string
  field_path: string
  source_label: string
  url: string
  verified_at: string
}

const PUBLIC_CACHE_SECONDS = 60
export const publicCacheControl = `public, max-age=${PUBLIC_CACHE_SECONDS}, stale-while-revalidate=300`

function placeholders(length: number) {
  if (length < 1 || length > 50) throw new Error('A bounded list of 1 to 50 IDs is required.')
  return Array.from({ length }, () => '?').join(', ')
}

function parseArray<T>(value: string | number | null): T[] {
  if (typeof value !== 'string') return []
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed as T[] : []
}

function text(value: string | number | null) {
  return typeof value === 'string' ? value : ''
}

function nullableText(value: string | number | null) {
  return typeof value === 'string' ? value : null
}

function mapOutpost(row: DetailRow): OutpostDetails {
  const affiliations = parseArray<{ type: string; name: string; label: string; scope: 'geographic' | 'language' | 'fcf' }>(row.affiliations_json)
  const affiliation = (kind: string) => affiliations.find((item) => item.type === kind)?.name ?? ''
  return {
    hubOutpostId: text(row.hub_outpost_id),
    countryCode: text(row.country_code),
    countryName: text(row.country_name),
    localUnitLabel: text(row.local_unit_label),
    identifierRaw: nullableText(row.identifier_raw),
    displayNameRaw: nullableText(row.display_name_raw),
    outpostNumber: nullableText(row.external_number),
    campusSuffix: nullableText(row.campus_suffix),
    church: text(row.church),
    streetAddress: nullableText(row.street_address),
    city: text(row.city),
    jurisdiction: text(row.jurisdiction),
    civilSubdivisionLabel: nullableText(row.civil_subdivision_label),
    postalCode: nullableText(row.postal_code),
    district: affiliation('geographic-district'),
    region: affiliation('geographic-region'),
    languageOverlay: affiliation('language-overlay'),
    fcfTerritory: affiliation('fcf-territory'),
    activeFcf: row.fcf_activity_status === 'not-verified' ? null : row.fcf_activity_status === 'yes',
    fcfAvailability: text(row.fcf_availability || 'not-verified') as OutpostDetails['fcfAvailability'],
    affiliations: affiliations.map((item) => ({
      label: item.label || item.type,
      name: item.name,
      scope: item.scope === 'language' ? 'language' : item.scope === 'fcf' ? 'fcf' : 'ministry',
    })),
    programs: parseArray<string>(row.programs_json),
    meeting: nullableText(row.meeting_information),
    contactUrl: nullableText(row.public_contact_url),
  }
}

function mapEvent(row: DetailRow): EventDetails {
  return {
    occurrenceId: text(row.occurrence_id),
    series: row.series_id ? { id: text(row.series_id), name: text(row.series_name) } : null,
    category: text(row.category) as EventDetails['category'],
    host: text(row.host),
    scope: text(row.scope) as EventDetails['scope'],
    relatedOrganizations: parseArray<{ id: string; name: string }>(row.organizations_json),
    startDate: text(row.start_date),
    endDate: nullableText(row.end_date),
    startTime: nullableText(row.start_time),
    endTime: nullableText(row.end_time),
    timeZone: text(row.time_zone),
    allDay: row.all_day === 1,
    locationStatus: text(row.location_status) as EventDetails['locationStatus'],
    location: nullableText(row.location),
    audience: parseArray<string>(row.audiences_json),
    registrationStatus: text(row.registration_status) as EventDetails['registrationStatus'],
    registrationUrl: nullableText(row.registration_url),
    registrationDeadline: nullableText(row.registration_deadline),
    deadlineExceptionNote: nullableText(row.deadline_exception_note),
    costStatus: text(row.cost_status) as EventDetails['costStatus'],
    costNote: nullableText(row.cost_note),
    lifecycleStatus: text(row.lifecycle_status) as EventDetails['lifecycleStatus'],
    officialUrl: text(row.official_url),
  }
}

function advancementCommon(row: DetailRow) {
  return {
    programGroups: parseArray<string>(row.program_groups_json) as AdvancementDetails['programGroups'],
    audiences: parseArray<string>(row.audiences_json) as AdvancementDetails['audiences'],
    gradeRange: nullableText(row.grade_range),
    officialUrl: text(row.official_url),
    contentStatus: text(row.content_status) as AdvancementDetails['contentStatus'],
    references: parseArray<{ targetId: string; targetSubtype: AdvancementDetails['subtype']; relationship: string }>(row.references_json),
  }
}

function mapAdvancement(row: DetailRow): AdvancementDetails {
  const common = advancementCommon(row)
  const subtype = text(row.subtype) as AdvancementDetails['subtype']
  if (subtype === 'program-group') {
    return { ...common, subtype, accent: text(row.accent), highlights: parseArray<string>(row.highlights_json) }
  }
  if (subtype === 'achievement-trail') return { ...common, subtype }
  if (subtype === 'merit') {
    return {
      ...common,
      subtype,
      meritCategory: text(row.merit_category) as Extract<AdvancementDetails, { subtype: 'merit' }>['meritCategory'],
      colors: parseArray<string>(row.colors_json) as Extract<AdvancementDetails, { subtype: 'merit' }>['colors'],
    }
  }
  if (subtype === 'award') {
    return { ...common, subtype, awardLevel: text(row.award_level) as Extract<AdvancementDetails, { subtype: 'award' }>['awardLevel'] }
  }
  return {
    ...common,
    subtype: 'handbook',
    publisher: nullableText(row.publisher),
    itemNumber: nullableText(row.item_number),
    edition: nullableText(row.edition),
    revision: nullableText(row.revision),
    publicationYear: typeof row.publication_year === 'number' ? row.publication_year : null,
    availability: text(row.availability) as Extract<AdvancementDetails, { subtype: 'handbook' }>['availability'],
    formats: parseArray<string>(row.formats_json) as Extract<AdvancementDetails, { subtype: 'handbook' }>['formats'],
    purchaseUrls: parseArray<{ label: string; format: 'print' | 'ebook'; url: string }>(row.purchase_urls_json),
  }
}

function mapOrganization(row: DetailRow): OrganizationDetails {
  return {
    organizationType: text(row.unit_type) as OrganizationDetails['organizationType'],
    scope: text(row.scope) as OrganizationDetails['scope'],
    countryCode: text(row.country_code || 'US'),
    unitLabel: text(row.display_label || 'Organization unit'),
    parent: nullableText(row.parent_name),
    affiliations: parseArray<string>(row.affiliations_json),
    jurisdictions: parseArray<string>(row.jurisdictions_json),
  }
}

function mapPage(row: DetailRow): PageDetails {
  return {
    section: text(row.section) as PageDetails['section'],
    body: parseArray<string>(row.body_json),
    links: parseArray<{ label: string; url: string }>(row.links_json),
  }
}

async function detailRows(db: D1Database, kind: RecordKind, ids: string[]) {
  const bound = placeholders(ids.length)
  const sql: Record<RecordKind, string> = {
    outpost: `SELECT o.content_id id, o.*, g.name jurisdiction, g.display_label civil_subdivision_label,
      country.code country_code, country.name country_name, program.fcf_availability,
      COALESCE((SELECT json_group_array(json_object('type', a.affiliation_type, 'name', u.name, 'label', u.display_label, 'scope', u.scope)) FROM
        (SELECT * FROM outpost_affiliations WHERE outpost_id = o.content_id ORDER BY affiliation_type, organization_id) a
        JOIN organization_units u ON u.id = a.organization_id), '[]') affiliations_json,
      COALESCE((SELECT json_group_array(title) FROM
        (SELECT c.title FROM outpost_program_groups p JOIN content_records c ON c.id = p.program_group_id
         WHERE p.outpost_id = o.content_id ORDER BY p.display_order, p.program_group_id)), '[]') programs_json
      FROM outposts o JOIN civil_geographies g ON g.id = o.civil_geography_id
      JOIN national_programs program ON program.id = o.national_program_id
      JOIN countries country ON country.code = program.country_code
      WHERE o.content_id IN (${bound})`,
    event: `SELECT e.content_id id, e.*, s.name series_name,
      COALESCE((SELECT json_group_array(json_object('id', referenced_id, 'name', display_name)) FROM
        (SELECT * FROM event_organization_relations WHERE occurrence_id = e.content_id ORDER BY display_order, referenced_id)), '[]') organizations_json,
      COALESCE((SELECT json_group_array(audience) FROM
        (SELECT audience FROM event_audiences WHERE occurrence_id = e.content_id ORDER BY display_order, audience)), '[]') audiences_json
      FROM event_occurrences e LEFT JOIN event_series s ON s.id = e.series_id
      WHERE e.content_id IN (${bound})`,
    advancement: `SELECT a.content_id id, a.*,
      COALESCE((SELECT json_group_array(title) FROM
        (SELECT c.title FROM advancement_program_groups p JOIN content_records c ON c.id = p.program_group_id
         WHERE p.advancement_id = a.content_id ORDER BY p.display_order, p.program_group_id)), '[]') program_groups_json,
      COALESCE((SELECT json_group_array(audience) FROM
        (SELECT audience FROM advancement_audiences WHERE advancement_id = a.content_id ORDER BY display_order, audience)), '[]') audiences_json,
      COALESCE((SELECT json_group_array(json_object('targetId', target_id, 'targetSubtype', target_subtype, 'relationship', relationship_label)) FROM
        (SELECT * FROM advancement_relationships WHERE source_id = a.content_id ORDER BY display_order, target_id)), '[]') references_json,
      COALESCE((SELECT json_group_array(text) FROM
        (SELECT text FROM advancement_highlights WHERE advancement_id = a.content_id ORDER BY display_order)), '[]') highlights_json,
      COALESCE((SELECT json_group_array(color) FROM
        (SELECT color FROM advancement_merit_colors WHERE advancement_id = a.content_id ORDER BY display_order, color)), '[]') colors_json,
      COALESCE((SELECT json_group_array(format) FROM
        (SELECT format FROM handbook_formats WHERE advancement_id = a.content_id ORDER BY display_order, format)), '[]') formats_json,
      COALESCE((SELECT json_group_array(json_object('label', label, 'format', format, 'url', url)) FROM
        (SELECT * FROM handbook_purchase_links WHERE advancement_id = a.content_id ORDER BY display_order, id)), '[]') purchase_urls_json
      FROM advancement_items a WHERE a.content_id IN (${bound})`,
    organization: `SELECT u.id, u.*, program.country_code,
      (SELECT COALESCE(parent.name, program.name) FROM organization_unit_relationships r
       LEFT JOIN organization_units parent ON parent.id = r.related_unit_id
       LEFT JOIN national_programs program ON program.id = r.related_national_program_id
       WHERE r.subject_id = u.id AND r.relationship_type = 'part-of' ORDER BY r.display_order LIMIT 1) parent_name,
      COALESCE((SELECT json_group_array(name) FROM
        (SELECT related.name FROM organization_unit_relationships r JOIN organization_units related ON related.id = r.related_unit_id
         WHERE r.subject_id = u.id AND r.relationship_type IN ('paired-with', 'affiliated-with') ORDER BY r.display_order, related.name)), '[]') affiliations_json,
      COALESCE((SELECT json_group_array(label) FROM
        (SELECT COALESCE(coverage.display_label, geography.name) label FROM organization_civil_coverage coverage
         JOIN civil_geographies geography ON geography.id = coverage.civil_geography_id
         WHERE coverage.organization_id = u.id ORDER BY geography.display_order, geography.id)), '[]') jurisdictions_json
      FROM organization_units u LEFT JOIN national_programs program ON program.id = u.national_program_id
      WHERE u.id IN (${bound})`,
    page: `SELECT p.content_id id, p.*,
      COALESCE((SELECT json_group_array(body_text) FROM
        (SELECT body_text FROM information_page_body_sections WHERE page_id = p.content_id ORDER BY display_order)), '[]') body_json,
      COALESCE((SELECT json_group_array(json_object('label', label, 'url', url)) FROM
        (SELECT label, url FROM information_page_links WHERE page_id = p.content_id ORDER BY display_order)), '[]') links_json
      FROM information_pages p WHERE p.content_id IN (${bound})`,
  }
  return (await db.prepare(sql[kind]).bind(...ids).all<DetailRow>()).results
}

export async function getRecordsByIds(db: D1Database, ids: string[]) {
  if (ids.length === 0) return []
  if (ids.length > 50) throw new Error('Record hydration is limited to 50 records.')
  const bound = placeholders(ids.length)
  const commonResult = await db.prepare(
    `SELECT id, kind, slug, title, summary, status, verified_at, published_at, updated_at, version
     FROM content_records WHERE id IN (${bound})`,
  ).bind(...ids).all<CommonRow>()
  const common = commonResult.results
  const kinds = [...new Set(common.map((row) => row.kind))]
  const [provenanceResult, ...details] = await Promise.all([
    db.prepare(
      `SELECT p.id, p.content_id, p.field_path, p.source_label, d.url, p.verified_at
       FROM field_provenance p JOIN source_documents d ON d.id = p.source_document_id
       WHERE p.content_id IN (${bound}) ORDER BY p.content_id, p.field_path, p.id`,
    ).bind(...ids).all<ProvenanceRow>(),
    ...kinds.map((kind) => detailRows(db, kind, common.filter((row) => row.kind === kind).map((row) => row.id))),
  ])
  const detailsById = new Map(details.flat().map((row) => [row.id, row]))
  const sourcesById = new Map<string, SourceRecord[]>()
  for (const row of provenanceResult.results) {
    const source = {
      id: row.id,
      fieldName: row.field_path,
      label: row.source_label,
      url: row.url,
      verifiedAt: row.verified_at,
    }
    sourcesById.set(row.content_id, [...(sourcesById.get(row.content_id) ?? []), source])
  }
  const mapDetails: Record<RecordKind, (row: DetailRow) => ContentRecord['details']> = {
    outpost: mapOutpost,
    event: mapEvent,
    advancement: mapAdvancement,
    organization: mapOrganization,
    page: mapPage,
  }
  const byId = new Map(common.map((row) => {
    const detail = detailsById.get(row.id)
    if (!detail) throw new Error(`Normalized ${row.kind} facts are missing for ${row.id}.`)
    return [row.id, {
      id: row.id,
      kind: row.kind,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      status: row.status,
      details: mapDetails[row.kind](detail),
      verifiedAt: row.verified_at,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      sources: sourcesById.get(row.id) ?? [],
      version: row.version,
    } satisfies ContentRecord]
  }))
  return ids.flatMap((id) => {
    const record = byId.get(id)
    return record ? [record] : []
  })
}

async function openConflicts(db: D1Database, ids: string[]): Promise<EventConflict[]> {
  if (ids.length === 0) return []
  const bound = placeholders(ids.length)
  const rows = await db.prepare(
    `SELECT conflict.id, conflict.occurrence_id event_id, conflict.field_path field_name,
      conflict.status, conflict.opened_at, conflict.opened_by, conflict.resolved_at, conflict.resolved_by,
      resolution.resolution_note,
      COALESCE((SELECT json_group_array(json_object('sourceId', assertion.provenance_id,
        'sourceLabel', assertion.source_label, 'assertedValue', assertion.asserted_value))
        FROM event_conflict_assertions assertion WHERE assertion.conflict_id = conflict.id), '[]') assertions_json
     FROM normalized_event_conflicts conflict
     LEFT JOIN event_conflict_resolutions resolution ON resolution.conflict_id = conflict.id
     WHERE conflict.occurrence_id IN (${bound}) AND conflict.status = 'open'`,
  ).bind(...ids).all<{
    id: string; event_id: string; field_name: string; status: 'open' | 'resolved'; opened_at: string
    opened_by: string; resolved_at: string | null; resolved_by: string | null
    resolution_note: string | null; assertions_json: string
  }>()
  return rows.results.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    fieldName: row.field_name,
    assertions: parseArray<EventConflictAssertion>(row.assertions_json),
    status: row.status,
    openedAt: row.opened_at,
    openedBy: row.opened_by,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  }))
}

async function publicRecords(db: D1Database, ids: string[]) {
  const [records, conflicts] = await Promise.all([getRecordsByIds(db, ids), openConflicts(db, ids)])
  return records.flatMap((record) => {
    const safe = serializePublicRecord(record, conflicts)
    return safe ? [safe] : []
  })
}

function cursorValues(params: URLSearchParams, arity: number) {
  const value = params.get('cursor')
  if (!value) return null
  return decodeCursor(value, arity)
}

function accepted(params: URLSearchParams, name: string, values: readonly string[]) {
  const value = params.get(name)
  if (!value) return null
  if (!values.includes(value)) throw new Error(`Unsupported ${name} filter.`)
  return value
}

function ftsQuery(value: string | null) {
  if (!value) return ''
  return value.slice(0, 200).match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 10)
    .map((term) => `"${term.replaceAll('"', '""')}"*`).join(' ') ?? ''
}

async function pageFromIds(
  db: D1Database,
  rows: IdRow[],
  limit: number,
  cursorKeys: string[],
  isPublic: boolean,
): Promise<CursorPage<ContentRecord>> {
  const page = pageFromRows(rows, limit, (row) => cursorKeys.map((key) => row[key]))
  return {
    records: isPublic ? await publicRecords(db, page.items.map((row) => row.id)) : await getRecordsByIds(db, page.items.map((row) => row.id)),
    nextCursor: page.nextCursor,
    generatedAt: new Date().toISOString(),
  }
}

export async function listPublicOutposts(db: D1Database, params: URLSearchParams) {
  const limit = readPageSize(params)
  const cursor = cursorValues(params, 2)
  const where = ['1 = 1']
  const bindings: CursorValue[] = []
  const civil = params.get('civil')
  const country = params.get('country')?.trim().toUpperCase()
  const city = params.get('city')?.trim()
  const affiliation = params.get('organization')
  const program = params.get('program')
  const fcf = accepted(params, 'fcf', ['yes', 'no', 'not-verified'])
  const query = ftsQuery(params.get('q')?.trim() ?? null)
  if (country) {
    if (!/^[A-Z]{2}$/.test(country)) throw new Error('Unsupported country filter.')
    where.push('directory.national_program_id IN (SELECT id FROM national_programs WHERE country_code = ?)')
    bindings.push(country)
  }
  if (civil) {
    where.push('directory.civil_geography_id = (SELECT id FROM civil_geographies WHERE country_code = ? AND name = ?)')
    bindings.push(country || 'US', civil)
  }
  if (city) { where.push('directory.city = ? COLLATE NOCASE'); bindings.push(city.slice(0, 100)) }
  if (fcf) { where.push('directory.fcf_activity_status = ?'); bindings.push(fcf) }
  if (affiliation) {
    where.push(`EXISTS (SELECT 1 FROM outpost_affiliations relation
      JOIN organization_units organization ON organization.id = relation.organization_id
      WHERE relation.outpost_id = directory.content_id AND organization.name = ?)`)
    bindings.push(affiliation)
  }
  if (program) {
    where.push(`EXISTS (SELECT 1 FROM outpost_program_groups relation
      JOIN content_records program_group ON program_group.id = relation.program_group_id
      WHERE relation.outpost_id = directory.content_id AND program_group.title = ?)`)
    bindings.push(program)
  }
  if (query) { where.push('public_search_fts MATCH ?'); bindings.push(query) }
  if (cursor) { where.push('(directory.title_sort, directory.content_id) > (?, ?)'); bindings.push(...cursor) }
  const join = query ? 'JOIN public_search_fts ON public_search_fts.content_id = directory.content_id' : ''
  const rows = await db.prepare(
    `SELECT directory.content_id id, directory.title_sort, directory.content_id cursor_id
     FROM public_eligible_outposts directory ${join}
     WHERE ${where.join(' AND ')} ORDER BY directory.title_sort, directory.content_id LIMIT ?`,
  ).bind(...bindings, limit + 1).all<IdRow>()
  return pageFromIds(db, rows.results, limit, ['title_sort', 'cursor_id'], true)
}

export async function listPublicAdvancement(db: D1Database, params: URLSearchParams) {
  const limit = readPageSize(params)
  const cursor = cursorValues(params, 4)
  const where = ['1 = 1']
  const bindings: CursorValue[] = []
  const subtype = accepted(params, 'subtype', ['program-group', 'achievement-trail', 'merit', 'award', 'handbook'])
  const category = accepted(params, 'category', ['skill', 'bible', 'leadership'])
  const status = accepted(params, 'status', ['current', 'historical', 'superseded', 'not-verified'])
  const group = params.get('program')
  const color = accepted(params, 'color', ['blue', 'green', 'silver', 'orange', 'brown', 'red', 'gold', 'sky-blue'])
  const query = ftsQuery(params.get('q')?.trim() ?? null)
  if (subtype) { where.push('directory.subtype = ?'); bindings.push(subtype) }
  if (category) { where.push('directory.merit_category = ?'); bindings.push(category) }
  if (status) { where.push('directory.content_status = ?'); bindings.push(status) }
  if (group) { where.push(`EXISTS (SELECT 1 FROM advancement_program_groups relation
    JOIN content_records program_group ON program_group.id = relation.program_group_id
    WHERE relation.advancement_id = directory.content_id AND program_group.title = ?)`); bindings.push(group) }
  if (color) { where.push('EXISTS (SELECT 1 FROM advancement_merit_colors relation WHERE relation.advancement_id = directory.content_id AND relation.color = ?)'); bindings.push(color) }
  if (query) { where.push('public_search_fts MATCH ?'); bindings.push(query) }
  if (cursor) {
    where.push('(directory.group_order, directory.subtype_order, directory.title_sort, directory.content_id) > (?, ?, ?, ?)')
    bindings.push(...cursor)
  }
  const join = query ? 'JOIN public_search_fts ON public_search_fts.content_id = directory.content_id' : ''
  const rows = await db.prepare(
    `SELECT directory.content_id id, directory.group_order, directory.subtype_order,
      directory.title_sort, directory.content_id cursor_id
     FROM public_advancement_directory directory ${join}
     WHERE ${where.join(' AND ')}
     ORDER BY directory.group_order, directory.subtype_order, directory.title_sort, directory.content_id LIMIT ?`,
  ).bind(...bindings, limit + 1).all<IdRow>()
  return pageFromIds(db, rows.results, limit, ['group_order', 'subtype_order', 'title_sort', 'cursor_id'], true)
}

export async function listPublicEvents(db: D1Database, params: URLSearchParams) {
  const limit = readPageSize(params)
  const cursor = cursorValues(params, 2)
  const direction = accepted(params, 'when', ['upcoming', 'past']) ?? 'upcoming'
  const where = ["content.status = 'published'"]
  const bindings: CursorValue[] = []
  const boundary = new Date().toISOString().slice(0, 10)
  where.push(direction === 'past' ? 'event.start_date < ?' : 'event.start_date >= ?')
  bindings.push(boundary)
  const scope = accepted(params, 'scope', ['outpost', 'district', 'region', 'national', 'fcf', 'other'])
  const category = accepted(params, 'category', ['camp', 'conference', 'fcf', 'pow-wow', 'training', 'other'])
  const organization = params.get('organization')
  const lifecycle = params.get('lifecycle')
  const registration = params.get('registration')
  const audience = params.get('audience')?.slice(0, 100)
  const year = params.get('year')
  const from = params.get('from')
  const to = params.get('to')
  const query = ftsQuery(params.get('q')?.trim() ?? null)
  if (scope) { where.push('event.scope = ?'); bindings.push(scope) }
  if (category) { where.push('event.category = ?'); bindings.push(category) }
  if (lifecycle) {
    if (!['scheduled', 'accepting-registration', 'confirmed', 'full', 'postponed', 'cancelled', 'completed'].includes(lifecycle)) throw new Error('Unsupported lifecycle filter.')
    if (lifecycle === 'completed') where.push("(event.lifecycle_status = 'completed' OR COALESCE(event.end_date, event.start_date) < date('now'))")
    else { where.push('event.lifecycle_status = ?'); bindings.push(lifecycle) }
  }
  if (registration) {
    if (!['not-verified', 'not-open', 'open', 'closed', 'full', 'not-required'].includes(registration)) throw new Error('Unsupported registration filter.')
    where.push('event.registration_status = ?'); bindings.push(registration)
  }
  if (audience) { where.push('EXISTS (SELECT 1 FROM event_audiences relation WHERE relation.occurrence_id = event.content_id AND relation.audience = ?)'); bindings.push(audience) }
  if (year) { if (!/^\d{4}$/.test(year)) throw new Error('Unsupported year filter.'); where.push("substr(event.start_date, 1, 4) = ?"); bindings.push(year) }
  if (from) { where.push('COALESCE(event.end_date, event.start_date) >= ?'); bindings.push(from) }
  if (to) { where.push('event.start_date <= ?'); bindings.push(to) }
  if (query) { where.push('public_search_fts MATCH ?'); bindings.push(query) }
  if (organization) { where.push('EXISTS (SELECT 1 FROM event_organization_relations relation WHERE relation.occurrence_id = event.content_id AND relation.organization_id = ?)'); bindings.push(organization) }
  const comparison = direction === 'past' ? '<' : '>'
  const order = direction === 'past' ? 'DESC' : 'ASC'
  if (cursor) { where.push(`(event.start_date, event.content_id) ${comparison} (?, ?)`); bindings.push(...cursor) }
  const searchJoin = query ? 'JOIN public_search_fts ON public_search_fts.content_id = event.content_id' : ''
  const rows = await db.prepare(
    `SELECT event.content_id id, event.start_date, event.content_id cursor_id
     FROM event_occurrences event JOIN content_records content ON content.id = event.content_id ${searchJoin}
     WHERE ${where.join(' AND ')} ORDER BY event.start_date ${order}, event.content_id ${order} LIMIT ?`,
  ).bind(...bindings, limit + 1).all<IdRow>()
  return pageFromIds(db, rows.results, limit, ['start_date', 'cursor_id'], true)
}

export async function listPublicKind(db: D1Database, kind: 'organization' | 'page', params: URLSearchParams) {
  const limit = readPageSize(params)
  const cursor = cursorValues(params, 2)
  const where = ["status = 'published'", 'kind = ?']
  const bindings: CursorValue[] = [kind]
  if (cursor) { where.push('(lower(title), id) > (?, ?)'); bindings.push(...cursor) }
  const rows = await db.prepare(
    `SELECT id, lower(title) title_sort, id cursor_id FROM content_records
     WHERE ${where.join(' AND ')} ORDER BY lower(title), id LIMIT ?`,
  ).bind(...bindings, limit + 1).all<IdRow>()
  return pageFromIds(db, rows.results, limit, ['title_sort', 'cursor_id'], true)
}

export async function searchPublic(db: D1Database, params: URLSearchParams) {
  const limit = readPageSize(params)
  const cursor = cursorValues(params, 2)
  const query = ftsQuery(params.get('q')?.trim() ?? null)
  if (!query) return { records: [], nextCursor: null, generatedAt: new Date().toISOString() } satisfies CursorPage<ContentRecord>
  const kind = params.get('kind')
  const where = ['public_search_fts MATCH ?']
  const bindings: CursorValue[] = [query]
  if (kind) {
    if (!['outpost', 'event', 'advancement', 'organization', 'page'].includes(kind)) throw new Error('Unsupported kind filter.')
    where.push('document.kind = ?'); bindings.push(kind)
  }
  if (cursor) { where.push('(lower(document.title), document.content_id) > (?, ?)'); bindings.push(...cursor) }
  const rows = await db.prepare(
    `SELECT document.content_id id, lower(document.title) title_sort, document.content_id cursor_id
     FROM public_search_fts JOIN public_search_documents document ON document.content_id = public_search_fts.content_id
     WHERE ${where.join(' AND ')} ORDER BY lower(document.title), document.content_id LIMIT ?`,
  ).bind(...bindings, limit + 1).all<IdRow>()
  return pageFromIds(db, rows.results, limit, ['title_sort', 'cursor_id'], true)
}

export async function getPublicRecordBySlug(db: D1Database, slug: string) {
  const row = await db.prepare(`SELECT content.id FROM content_records content
    WHERE content.slug = ? AND content.status = 'published'
      AND (content.kind <> 'outpost' OR EXISTS (
        SELECT 1 FROM public_eligible_outposts eligible WHERE eligible.content_id = content.id
      )) LIMIT 1`).bind(slug).first<{ id: string }>()
  if (!row) return null
  return (await publicRecords(db, [row.id]))[0] ?? null
}

export async function getPublicBootstrap(db: D1Database): Promise<PublicBootstrap> {
  const [navigationRows, featuredRows, countRows, jurisdictionRows, regionRows] = await Promise.all([
    db.prepare(`SELECT id FROM content_records WHERE status = 'published' AND
      (kind = 'page' OR (kind = 'advancement' AND id IN (SELECT content_id FROM advancement_items WHERE subtype = 'program-group')))
      ORDER BY kind DESC, title LIMIT 12`).all<{ id: string }>(),
    db.prepare(`SELECT id FROM (
      SELECT content.id, 0 section, event.start_date sort_value FROM event_occurrences event
      JOIN content_records content ON content.id = event.content_id
      WHERE content.status = 'published' AND event.start_date >= date('now') ORDER BY event.start_date LIMIT 3
    ) UNION ALL SELECT id FROM (
      SELECT content.id, 1 section, content.updated_at sort_value FROM content_records content
      WHERE content.status = 'published' AND content.kind = 'advancement' ORDER BY content.updated_at DESC LIMIT 4
    ) LIMIT 7`).all<{ id: string }>(),
    db.prepare(`SELECT kind, COUNT(*) count FROM content_records
      WHERE status = 'published' AND kind <> 'outpost' GROUP BY kind
      UNION ALL SELECT 'outpost' kind, COUNT(*) count FROM public_eligible_outposts`).all<{ kind: RecordKind; count: number }>(),
    db.prepare(`SELECT name, code, verified_listing_count count FROM public_jurisdiction_coverage
      ORDER BY name`).all<{ name: string; code: string; count: number }>(),
    db.prepare(`SELECT name, verified_listing_count count FROM public_region_coverage
      ORDER BY name`).all<{ name: string; count: number }>(),
  ])
  const counts = { outpost: 0, event: 0, advancement: 0, organization: 0, page: 0 }
  for (const row of countRows.results) counts[row.kind] = row.count
  const [navigation, featuredRecords] = await Promise.all([
    publicRecords(db, navigationRows.results.map((row) => row.id)),
    publicRecords(db, featuredRows.results.map((row) => row.id)),
  ])
  return {
    navigation,
    featuredRecords,
    counts,
    coverage: {
      jurisdictions: jurisdictionRows.results.map((row) => ({ name: row.name, code: row.code, verifiedListingCount: row.count })),
      regions: regionRows.results.map((row) => ({ name: row.name, verifiedListingCount: row.count })),
    },
    generatedAt: new Date().toISOString(),
  }
}

export async function listOperatorRecords(db: D1Database, params: URLSearchParams) {
  const limit = readPageSize(params)
  const cursor = cursorValues(params, 2)
  const where: string[] = []
  const bindings: CursorValue[] = []
  const kind = params.get('kind')
  const status = params.get('status')
  if (kind) { if (!['outpost', 'event', 'advancement', 'organization', 'page'].includes(kind)) throw new Error('Unsupported kind filter.'); where.push('kind = ?'); bindings.push(kind) }
  if (status) { if (!['draft', 'published', 'archived'].includes(status)) throw new Error('Unsupported status filter.'); where.push('status = ?'); bindings.push(status) }
  if (cursor) { where.push('(updated_at, id) < (?, ?)'); bindings.push(...cursor) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = await db.prepare(
    `SELECT id, updated_at, id cursor_id FROM content_records ${clause}
     ORDER BY updated_at DESC, id DESC LIMIT ?`,
  ).bind(...bindings, limit + 1).all<IdRow>()
  return pageFromIds(db, rows.results, limit, ['updated_at', 'cursor_id'], false)
}

export async function getOperatorRecord(db: D1Database, id: string) {
  return (await getRecordsByIds(db, [id]))[0] ?? null
}

export async function getFreshnessQueue(db: D1Database) {
  const [rows, lifecycleRows, retentionRows] = await Promise.all([
    db.prepare(`SELECT * FROM (
    SELECT CASE WHEN provenance.verified_at <= datetime('now', '-60 days') THEN 'stale:' ELSE 'due:' END || provenance.id id,
      CASE WHEN provenance.verified_at <= datetime('now', '-60 days') THEN 'verification-stale' ELSE 'verification-due' END type,
      CASE WHEN provenance.verified_at <= datetime('now', '-60 days') THEN 'overdue' ELSE 'due' END severity,
      CASE WHEN provenance.verified_at <= datetime('now', '-60 days') THEN 0 ELSE 1 END severity_rank,
      CASE WHEN provenance.verified_at <= datetime('now', '-60 days') THEN 'Source verification is stale' ELSE 'Source verification is approaching expiry' END title,
      provenance.content_id record_id, provenance.field_path field_name, provenance.id source_id,
      provenance.source_label, document.url source_url, provenance.verified_at last_checked_at,
      'record:' || provenance.content_id action_target
    FROM field_provenance provenance
    JOIN event_occurrences event ON event.content_id = provenance.content_id
    JOIN source_documents document ON document.id = provenance.source_document_id
    WHERE provenance.verified_at <= datetime('now', '-46 days')
    UNION ALL
    SELECT 'completion:' || event.content_id, 'completion',
      CASE WHEN event.lifecycle_status = 'completed' THEN 'info' ELSE 'due' END,
      CASE WHEN event.lifecycle_status = 'completed' THEN 2 ELSE 1 END,
      CASE WHEN event.lifecycle_status = 'completed' THEN 'Completed occurrence retained in history' ELSE 'Occurrence is eligible to be marked completed' END,
      event.content_id, 'lifecycleStatus', NULL, NULL, event.official_url, content.verified_at,
      'record:' || event.content_id
    FROM event_occurrences event JOIN content_records content ON content.id = event.content_id
    WHERE COALESCE(event.end_date, event.start_date) < date('now') OR event.lifecycle_status = 'completed'
    UNION ALL
    SELECT 'broken:' || observation.id, 'broken-source', 'overdue', 0,
      'Source recorded as broken or unreachable', observation.content_id, provenance.field_path,
      provenance.id, provenance.source_label, document.url, observation.observed_at,
      'source:' || provenance.id
    FROM source_health_observations observation
    JOIN field_provenance provenance ON provenance.id = observation.provenance_id
    JOIN source_documents document ON document.id = observation.source_document_id
    WHERE observation.cleared_at IS NULL
    UNION ALL
    SELECT 'conflict:' || conflict.id, 'event-conflict', 'overdue', 0,
      'Event sources disagree', conflict.occurrence_id, conflict.field_path, NULL,
      (SELECT group_concat(assertion.source_label, ' / ') FROM event_conflict_assertions assertion WHERE assertion.conflict_id = conflict.id),
      NULL, conflict.opened_at, 'conflict:' || conflict.id
    FROM normalized_event_conflicts conflict WHERE conflict.status = 'open'
    UNION ALL
    SELECT 'gap:' || gap.id, 'coverage-gap', 'due', 1,
      gap.scope_text || ': ' || gap.description, NULL, 'scope', NULL, gap.scope_text,
      document.url, gap.last_checked_at, 'gap:' || gap.id
    FROM normalized_coverage_gaps gap LEFT JOIN source_documents document ON document.id = gap.source_document_id
    WHERE gap.status = 'open'
  ) ORDER BY severity_rank, title, id LIMIT 50`).all<{
    id: string; type: FreshnessQueueItem['type']; severity: FreshnessQueueItem['severity']; title: string
    record_id: string | null; field_name: string | null; source_id: string | null
    source_label: string | null; source_url: string | null; last_checked_at: string | null; action_target: string
  }>(),
    db.prepare(`SELECT 'listing:' || lifecycle.outpost_id id,
      CASE WHEN lifecycle.state = 'archived' THEN 'archived-review'
        WHEN lifecycle.grace_ends_at < datetime('now') THEN 'listing-expired'
        WHEN lifecycle.next_verification_due_at <= datetime('now') THEN 'listing-grace'
        ELSE 'listing-due' END type,
      CASE WHEN lifecycle.state = 'archived' THEN 'info'
        WHEN lifecycle.grace_ends_at < datetime('now') THEN 'overdue' ELSE 'due' END severity,
      CASE WHEN lifecycle.state = 'archived' THEN 'Archived Outpost review'
        WHEN lifecycle.grace_ends_at < datetime('now') THEN 'Listing Verification expired'
        WHEN lifecycle.next_verification_due_at <= datetime('now') THEN 'Listing Verification grace period'
        ELSE 'Annual Listing Verification due soon' END title,
      lifecycle.outpost_id record_id, 'listingVerification' field_name, NULL source_id,
      NULL source_label, NULL source_url, lifecycle.last_verified_at last_checked_at,
      CASE WHEN lifecycle.state = 'verified'
          AND lifecycle.next_verification_due_at <= datetime('now')
          AND lifecycle.grace_ends_at >= datetime('now')
        THEN 'grace:' || lifecycle.outpost_id
        WHEN lifecycle.state IN ('verified', 'grace') AND lifecycle.grace_ends_at < datetime('now')
        THEN 'expire:' || lifecycle.outpost_id
        ELSE 'record:' || lifecycle.outpost_id END action_target
      FROM outpost_lifecycle lifecycle
      WHERE lifecycle.state = 'archived'
        OR (lifecycle.state IN ('verified', 'grace', 'verification-expired')
          AND lifecycle.next_verification_due_at <= datetime('now', '+2 months'))
      ORDER BY lifecycle.state, lifecycle.next_verification_due_at, lifecycle.outpost_id LIMIT 50`).all<{
      id: string; type: FreshnessQueueItem['type']; severity: FreshnessQueueItem['severity']; title: string
      record_id: string | null; field_name: string | null; source_id: string | null
      source_label: string | null; source_url: string | null; last_checked_at: string | null; action_target: string
    }>(),
    db.prepare(`SELECT 'retention:' || submission.id id, 'submission-retention' type,
      'overdue' severity, 'Private proposal personal data reached its retention deadline' title,
      NULL record_id, 'replyEmailAndNotes' field_name, NULL source_id, NULL source_label,
      NULL source_url, submission.created_at last_checked_at, 'submission:' || submission.id action_target
      FROM directory_submissions submission
      WHERE submission.pii_scrubbed_at IS NULL AND submission.retention_deadline <= datetime('now')
      ORDER BY submission.retention_deadline, submission.id LIMIT 50`).all<{
      id: string; type: FreshnessQueueItem['type']; severity: FreshnessQueueItem['severity']; title: string
      record_id: string | null; field_name: string | null; source_id: string | null
      source_label: string | null; source_url: string | null; last_checked_at: string | null; action_target: string
    }>(),
  ])
  const combined = [...rows.results, ...lifecycleRows.results, ...retentionRows.results]
    .sort((left, right) => {
      const rank = { overdue: 0, due: 1, info: 2 }
      return rank[left.severity] - rank[right.severity]
        || left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
    }).slice(0, 50)
  return combined.map((row): FreshnessQueueItem => ({
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    recordId: row.record_id,
    fieldName: row.field_name,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    lastCheckedAt: row.last_checked_at,
    actionTarget: row.action_target,
  }))
}
