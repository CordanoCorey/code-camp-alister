import { validateAdvancementDetails } from '../../shared/advancement'
import { validatePublishedEvent } from '../../shared/events'
import { serializePublicRecord } from '../../shared/public'
import type {
  ContentRecord,
  EventConflict,
  OrganizationDetails,
  OutpostDetails,
  PageDetails,
} from '../../shared/domain'

function commonWarnings(record: ContentRecord) {
  const warnings: string[] = []
  if (!record.title.trim()) warnings.push('A title is required for public presentation.')
  if (!record.summary.trim()) warnings.push('A summary is required for public presentation.')
  if (!record.slug.trim()) warnings.push('A slug is required before publication.')
  if (!record.verifiedAt) warnings.push('This record is not verified.')
  if (record.sources.length === 0) warnings.push('At least one public source is required.')
  if (record.sources.some((source) => !source.fieldName.trim() || !source.label.trim() || !source.url.startsWith('https://') || !source.verifiedAt)) {
    warnings.push('Every displayed source needs a field name, label, HTTPS URL, and verification date.')
  }
  return warnings
}

function detailWarnings(record: ContentRecord) {
  if (record.kind === 'event') {
    return validatePublishedEvent({ ...record, status: 'published' })
  }
  if (record.kind === 'advancement') return validateAdvancementDetails(record.details)
  if (record.kind === 'outpost') {
    const details = record.details as Partial<OutpostDetails>
    return !details.church?.trim() || !details.countryCode?.trim() || !details.countryName?.trim() || !details.jurisdiction?.trim()
      ? ['An outpost preview needs a church name, ISO country, country name, and civil location.']
      : []
  }
  if (record.kind === 'organization') {
    const details = record.details as Partial<OrganizationDetails>
    return !details.organizationType || !details.scope
      ? ['An organization preview needs a type and scope.']
      : []
  }
  const details = record.details as Partial<PageDetails>
  return !details.section || !Array.isArray(details.body) || !Array.isArray(details.links)
    ? ['An informational-page preview needs a section, body list, and links list.']
    : []
}

export function preparePublicPreview(record: ContentRecord, conflicts: EventConflict[]) {
  const warnings = [...new Set([...commonWarnings(record), ...detailWarnings(record)])]
  try {
    const publicCandidate = serializePublicRecord({ ...record, status: 'published' }, conflicts)
    if (!publicCandidate) {
      warnings.push('This record would be omitted publicly until the required conflict is resolved.')
      return { record: null, warnings }
    }
    return {
      record: { ...publicCandidate, status: record.status, publishedAt: record.publishedAt },
      warnings,
    }
  } catch {
    warnings.push('This draft cannot use the public presentation until its required fields are valid.')
    return { record: null, warnings }
  }
}
