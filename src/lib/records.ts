import type { ContentRecord, OutpostDetails } from '../../shared/domain'

export type FcfFilter = '' | 'yes' | 'no' | 'not-verified'

export type OutpostFilters = {
  query: string
  jurisdiction: string
  affiliation: string
  program: string
  fcf: FcfFilter
}

export function recordText(record: ContentRecord) {
  return `${record.title} ${record.summary} ${JSON.stringify(record.details)}`.toLocaleLowerCase()
}

export function filterRecords(records: ContentRecord[], query: string) {
  const terms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length === 0) return records
  return records.filter((record) => {
    const haystack = recordText(record)
    return terms.every((term) => haystack.includes(term))
  })
}

export function filterOutposts(records: ContentRecord[], filters: OutpostFilters) {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return records.filter((record) => {
    if (!isOutpost(record)) return false
    const details = outpostDetails(record)
    const nameCityNumber = [
      details.church,
      details.city,
      [details.outpostNumber, details.campusSuffix].filter(Boolean).join(''),
    ].filter(Boolean).join(' ').toLocaleLowerCase()
    if (terms.some((term) => !nameCityNumber.includes(term))) return false
    if (filters.jurisdiction && details.jurisdiction !== filters.jurisdiction) return false
    if (filters.affiliation) {
      const [affiliationField, affiliationValue] = filters.affiliation.split('|', 2)
      const typedAffiliations: Record<string, string> = {
        district: details.district,
        region: details.region,
        languageOverlay: details.languageOverlay,
        fcfTerritory: details.fcfTerritory,
      }
      if (affiliationValue) {
        if (typedAffiliations[affiliationField] !== affiliationValue) return false
      } else if (!Object.values(typedAffiliations).includes(filters.affiliation)) return false
    }
    if (filters.program && !details.programs.includes(filters.program)) return false
    if (filters.fcf === 'yes' && details.activeFcf !== true) return false
    if (filters.fcf === 'no' && details.activeFcf !== false) return false
    if (filters.fcf === 'not-verified' && details.activeFcf !== null) return false
    return true
  })
}

export function isOutpost(record: ContentRecord) {
  return record.kind === 'outpost'
}

export function outpostDetails(record: ContentRecord) {
  return record.details as OutpostDetails
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

export function fcfLabel(value: boolean | null) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return 'Not verified'
}


export function outpostMapUrl(record: ContentRecord) {
  const details = outpostDetails(record)
  const addressFields = ['streetAddress', 'city', 'jurisdiction', 'postalCode']
  const hasVerifiedAddress = addressFields.every((fieldName) =>
    record.sources.some((source) => source.fieldName === fieldName),
  )
  if (!hasVerifiedAddress || !details.streetAddress || !details.postalCode) return null
  const address = [
    details.streetAddress,
    details.city,
    details.jurisdiction,
    details.postalCode,
  ].join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
