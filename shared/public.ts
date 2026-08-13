import { serializePublicEvent } from './events'
import type {
  AdvancementDetails,
  ContentRecord,
  EventConflict,
  EventDetails,
  OrganizationDetails,
  OutpostDetails,
  PageDetails,
  RecordDetails,
  SourceRecord,
} from './domain'

function publicSources(sources: SourceRecord[]) {
  return sources.map((source) => ({
    id: source.id,
    fieldName: source.fieldName,
    label: source.label,
    url: source.url,
    verifiedAt: source.verifiedAt,
  }))
}

function publicOutpostDetails(value: RecordDetails): OutpostDetails {
  const details = value as OutpostDetails
  return {
    hubOutpostId: details.hubOutpostId,
    countryCode: details.countryCode ?? 'US',
    countryName: details.countryName ?? 'United States',
    localUnitLabel: details.localUnitLabel ?? 'Outpost',
    identifierRaw: details.identifierRaw ?? details.outpostNumber,
    displayNameRaw: details.displayNameRaw ?? null,
    outpostNumber: details.outpostNumber,
    campusSuffix: details.campusSuffix,
    church: details.church,
    streetAddress: details.streetAddress,
    city: details.city,
    jurisdiction: details.jurisdiction,
    civilSubdivisionLabel: details.civilSubdivisionLabel,
    postalCode: details.postalCode,
    district: details.district,
    region: details.region,
    languageOverlay: details.languageOverlay,
    fcfTerritory: details.fcfTerritory,
    activeFcf: details.activeFcf,
    fcfAvailability: details.fcfAvailability ?? (details.activeFcf === null ? 'not-verified' : 'available'),
    affiliations: Array.isArray(details.affiliations) ? details.affiliations.map((item) => ({ ...item })) : [],
    programs: Array.isArray(details.programs) ? [...details.programs] : [],
    meeting: details.meeting,
    contactUrl: details.contactUrl,
  }
}

function publicEventDetails(value: RecordDetails): EventDetails {
  const details = value as EventDetails
  return {
    occurrenceId: details.occurrenceId,
    series: details.series ? { id: details.series.id, name: details.series.name } : null,
    category: details.category,
    host: details.host,
    scope: details.scope,
    relatedOrganizations: Array.isArray(details.relatedOrganizations)
      ? details.relatedOrganizations.map((organization) => ({ id: organization.id, name: organization.name }))
      : [],
    startDate: details.startDate,
    endDate: details.endDate,
    startTime: details.startTime,
    endTime: details.endTime,
    timeZone: details.timeZone,
    allDay: details.allDay,
    locationStatus: details.locationStatus,
    location: details.location,
    audience: Array.isArray(details.audience) ? [...details.audience] : [],
    registrationStatus: details.registrationStatus,
    registrationUrl: details.registrationUrl,
    registrationDeadline: details.registrationDeadline,
    deadlineExceptionNote: details.deadlineExceptionNote,
    costStatus: details.costStatus,
    costNote: details.costNote,
    lifecycleStatus: details.lifecycleStatus,
    officialUrl: details.officialUrl,
    ...(Array.isArray(details.verificationWarnings)
      ? { verificationWarnings: [...details.verificationWarnings] }
      : {}),
  }
}

function publicAdvancementDetails(value: RecordDetails): AdvancementDetails {
  const details = value as AdvancementDetails
  const common = {
    subtype: details.subtype,
    programGroups: Array.isArray(details.programGroups) ? [...details.programGroups] : [],
    audiences: Array.isArray(details.audiences) ? [...details.audiences] : [],
    gradeRange: details.gradeRange,
    officialUrl: details.officialUrl,
    contentStatus: details.contentStatus,
    references: Array.isArray(details.references)
      ? details.references.map((reference) => ({
          targetId: reference.targetId,
          targetSubtype: reference.targetSubtype,
          relationship: reference.relationship,
        }))
      : [],
  }
  if (details.subtype === 'program-group') {
    return { ...common, subtype: details.subtype, accent: details.accent, highlights: [...details.highlights] }
  }
  if (details.subtype === 'achievement-trail') return { ...common, subtype: details.subtype }
  if (details.subtype === 'merit') {
    return { ...common, subtype: details.subtype, meritCategory: details.meritCategory, colors: [...details.colors] }
  }
  if (details.subtype === 'award') return { ...common, subtype: details.subtype, awardLevel: details.awardLevel }
  return {
    ...common,
    subtype: details.subtype,
    publisher: details.publisher,
    itemNumber: details.itemNumber,
    edition: details.edition,
    revision: details.revision,
    publicationYear: details.publicationYear,
    availability: details.availability,
    formats: [...details.formats],
    purchaseUrls: details.purchaseUrls.map((link) => ({ label: link.label, format: link.format, url: link.url })),
  }
}

function publicOrganizationDetails(value: RecordDetails): OrganizationDetails {
  const details = value as OrganizationDetails
  return {
    countryCode: details.countryCode ?? 'US',
    unitLabel: details.unitLabel ?? 'Organization unit',
    organizationType: details.organizationType,
    scope: details.scope,
    parent: details.parent,
    affiliations: Array.isArray(details.affiliations) ? [...details.affiliations] : [],
    jurisdictions: Array.isArray(details.jurisdictions) ? [...details.jurisdictions] : [],
  }
}

function publicPageDetails(value: RecordDetails): PageDetails {
  const details = value as PageDetails
  return {
    section: details.section,
    body: Array.isArray(details.body) ? [...details.body] : [],
    links: Array.isArray(details.links)
      ? details.links.map((link) => ({ label: link.label, url: link.url }))
      : [],
  }
}

export function serializePublicRecord(record: ContentRecord, conflicts: EventConflict[] = []) {
  if (record.status !== 'published') return null
  const conflictSafe = record.kind === 'event' ? serializePublicEvent(record, conflicts) : record
  if (!conflictSafe) return null

  let details: RecordDetails
  if (conflictSafe.kind === 'outpost') details = publicOutpostDetails(conflictSafe.details)
  else if (conflictSafe.kind === 'event') details = publicEventDetails(conflictSafe.details)
  else if (conflictSafe.kind === 'advancement') details = publicAdvancementDetails(conflictSafe.details)
  else if (conflictSafe.kind === 'organization') details = publicOrganizationDetails(conflictSafe.details)
  else details = publicPageDetails(conflictSafe.details)

  return {
    id: conflictSafe.id,
    kind: conflictSafe.kind,
    slug: conflictSafe.slug,
    title: conflictSafe.title,
    summary: conflictSafe.summary,
    status: conflictSafe.status,
    details,
    verifiedAt: conflictSafe.verifiedAt,
    publishedAt: conflictSafe.publishedAt,
    updatedAt: conflictSafe.updatedAt,
    sources: publicSources(conflictSafe.sources),
  } satisfies ContentRecord
}
