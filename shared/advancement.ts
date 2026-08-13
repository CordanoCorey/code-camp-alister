import {
  advancementSubtypes,
  programGroups,
  type AdvancementContentStatus,
  type AdvancementDetails,
  type AdvancementSubtype,
  type ContentRecord,
  type HandbookDetails,
  type MeritCategory,
  type MeritColor,
  type ProgramGroup,
} from './domain'

export const advancementSubtypeLabels: Record<AdvancementSubtype, string> = {
  'program-group': 'Program Group',
  'achievement-trail': 'Achievement Trail',
  merit: 'Merit',
  award: 'Award',
  handbook: 'Handbook',
}

export const advancementContentStatuses: AdvancementContentStatus[] = [
  'current',
  'historical',
  'superseded',
  'not-verified',
]

export const meritCategories: MeritCategory[] = ['skill', 'bible', 'leadership']
export const meritColors: MeritColor[] = [
  'blue',
  'green',
  'silver',
  'orange',
  'brown',
  'red',
  'gold',
  'sky-blue',
]

const meritColorsByCategory: Record<MeritCategory, MeritColor[]> = {
  skill: ['blue', 'green', 'silver'],
  bible: ['orange', 'brown'],
  leadership: ['red', 'gold', 'sky-blue'],
}

const subtypeOrder: AdvancementSubtype[] = [
  'program-group',
  'achievement-trail',
  'merit',
  'award',
  'handbook',
]

export type AdvancementFilters = {
  query: string
  programGroup: '' | ProgramGroup
  subtype: '' | AdvancementSubtype
  meritCategory: '' | MeritCategory
  color: '' | MeritColor
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function isAdvancementSubtype(value: unknown): value is AdvancementSubtype {
  return typeof value === 'string' && advancementSubtypes.includes(value as AdvancementSubtype)
}

export function isAdvancementDetails(value: unknown): value is AdvancementDetails {
  return validateAdvancementDetails(value).length === 0
}

export function isAdvancementRecord(record: ContentRecord): record is ContentRecord & { details: AdvancementDetails } {
  return record.kind === 'advancement' && isAdvancementDetails(record.details)
}

export function advancementDetails(record: ContentRecord) {
  if (!isAdvancementRecord(record)) throw new Error(`Invalid advancement details for ${record.id}.`)
  return record.details
}

export function defaultAdvancementDetails(subtype: AdvancementSubtype = 'program-group'): AdvancementDetails {
  const common = {
    programGroups: [] as ProgramGroup[],
    audiences: [] as Array<'Leaders' | 'FCF'>,
    gradeRange: null,
    officialUrl: '',
    contentStatus: 'not-verified' as const,
    references: [],
  }
  if (subtype === 'program-group') return { ...common, subtype, accent: '#187A61', highlights: [] }
  if (subtype === 'achievement-trail') return { ...common, subtype }
  if (subtype === 'merit') return { ...common, subtype, meritCategory: 'skill', colors: [] }
  if (subtype === 'award') return { ...common, subtype, awardLevel: 'program-group' }
  return {
    ...common,
    subtype,
    publisher: null,
    itemNumber: null,
    edition: null,
    revision: null,
    publicationYear: null,
    availability: 'not-verified',
    formats: [],
    purchaseUrls: [],
  }
}

export function changeAdvancementSubtype(
  details: AdvancementDetails,
  subtype: AdvancementSubtype,
): AdvancementDetails {
  const next = defaultAdvancementDetails(subtype)
  return {
    ...next,
    programGroups: [...details.programGroups],
    audiences: [...details.audiences],
    gradeRange: details.gradeRange,
    officialUrl: details.officialUrl,
    contentStatus: details.contentStatus,
    references: details.references.map((reference) => ({ ...reference })),
  } as AdvancementDetails
}

export function validateAdvancementDetails(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['Advancement details are required.']
  const details = value as Record<string, unknown>
  if (!isAdvancementSubtype(details.subtype)) return ['Choose a valid advancement subtype.']

  const errors: string[] = []
  const subtype = details.subtype
  const commonFields = [
    'subtype',
    'programGroups',
    'audiences',
    'gradeRange',
    'officialUrl',
    'contentStatus',
    'references',
  ]
  const subtypeFields: Record<AdvancementSubtype, string[]> = {
    'program-group': ['accent', 'highlights'],
    'achievement-trail': [],
    merit: ['meritCategory', 'colors'],
    award: ['awardLevel'],
    handbook: [
      'publisher',
      'itemNumber',
      'edition',
      'revision',
      'publicationYear',
      'availability',
      'formats',
      'purchaseUrls',
    ],
  }
  const allowedFields = new Set([...commonFields, ...subtypeFields[subtype]])
  const invalidFields = Object.keys(details).filter((field) => !allowedFields.has(field))
  if (invalidFields.length > 0) errors.push(`Remove fields that do not apply to ${subtype}: ${invalidFields.join(', ')}.`)

  if (!Array.isArray(details.programGroups) || !details.programGroups.every((group) => programGroups.includes(group as ProgramGroup))) {
    errors.push('Choose only valid Program Groups.')
  }
  if (!Array.isArray(details.audiences) || !details.audiences.every((audience) => audience === 'Leaders' || audience === 'FCF')) {
    errors.push('Choose only Leaders or FCF as additional audiences.')
  }
  if (
    Array.isArray(details.programGroups) && details.programGroups.length === 0 &&
    Array.isArray(details.audiences) && details.audiences.length === 0
  ) {
    errors.push('Choose at least one applicable Program Group or audience.')
  }
  if (details.gradeRange !== null && typeof details.gradeRange !== 'string') errors.push('Grade range must be text or blank.')
  if (!isHttpsUrl(details.officialUrl)) errors.push('Official URL must be an HTTPS URL.')
  if (!advancementContentStatuses.includes(details.contentStatus as AdvancementContentStatus)) {
    errors.push('Choose a valid current or historical status.')
  }
  if (!Array.isArray(details.references)) {
    errors.push('Advancement relationships must be a list.')
  } else {
    details.references.forEach((reference, index) => {
      if (!reference || typeof reference !== 'object') {
        errors.push(`Relationship ${index + 1} is invalid.`)
        return
      }
      const typed = reference as Record<string, unknown>
      if (!typed.targetId || typeof typed.targetId !== 'string' || !isAdvancementSubtype(typed.targetSubtype) || !typed.relationship || typeof typed.relationship !== 'string') {
        errors.push(`Relationship ${index + 1} needs a target record, subtype, and relationship label.`)
      }
    })
  }

  if (subtype === 'program-group') {
    if (!Array.isArray(details.programGroups) || details.programGroups.length !== 1) {
      errors.push('A Program Group record must name exactly one Program Group.')
    }
    if (typeof details.accent !== 'string' || !/^#[\dA-F]{6}$/i.test(details.accent)) errors.push('Accent must be a six-digit hex color.')
    if (!isStringArray(details.highlights)) errors.push('Program highlights must be a list of text values.')
  }

  if (subtype === 'merit') {
    if (!meritCategories.includes(details.meritCategory as MeritCategory)) {
      errors.push('Choose a valid merit category.')
    }
    if (!Array.isArray(details.colors) || !details.colors.every((color) => meritColors.includes(color as MeritColor))) {
      errors.push('Choose only verified merit colors.')
    } else if (meritCategories.includes(details.meritCategory as MeritCategory)) {
      const allowedColors = meritColorsByCategory[details.meritCategory as MeritCategory]
      if (details.colors.some((color) => !allowedColors.includes(color as MeritColor))) {
        errors.push(`The selected colors do not apply to ${details.meritCategory} merits.`)
      }
    }
  }

  if (subtype === 'award' && !['program-group', 'national', 'junior-leadership', 'fcf'].includes(details.awardLevel as string)) {
    errors.push('Choose a valid award level.')
  }

  if (subtype === 'handbook') validateHandbook(details, errors)
  return errors
}

function validateHandbook(details: Record<string, unknown>, errors: string[]) {
  const nullableTextFields = ['publisher', 'itemNumber', 'edition', 'revision']
  for (const field of nullableTextFields) {
    if (details[field] !== null && typeof details[field] !== 'string') errors.push(`${field} must be text or blank.`)
  }
  if (details.publicationYear !== null && (!Number.isInteger(details.publicationYear) || Number(details.publicationYear) < 1900)) {
    errors.push('Publication year must be a four-digit year or blank.')
  }
  if (!['available', 'unavailable', 'not-verified'].includes(details.availability as string)) {
    errors.push('Choose a valid handbook availability.')
  }
  if (!Array.isArray(details.formats) || !details.formats.every((format) => format === 'print' || format === 'ebook')) {
    errors.push('Handbook formats may include only print and e-book.')
  }
  if (!Array.isArray(details.purchaseUrls)) {
    errors.push('Handbook purchase URLs must be a list.')
    return
  }
  details.purchaseUrls.forEach((link, index) => {
    if (!link || typeof link !== 'object') {
      errors.push(`Purchase link ${index + 1} is invalid.`)
      return
    }
    const typed = link as Record<string, unknown>
    if (typeof typed.label !== 'string' || !typed.label.trim() || !['print', 'ebook'].includes(typed.format as string) || !isHttpsUrl(typed.url)) {
      errors.push(`Purchase link ${index + 1} needs a label, allowed format, and HTTPS URL.`)
    }
  })
}

export function sortAdvancementRecords(records: ContentRecord[]) {
  return records.filter(isAdvancementRecord).sort((left, right) => {
    const leftDetails = left.details
    const rightDetails = right.details
    const leftGroup = Math.min(...leftDetails.programGroups.map((group) => programGroups.indexOf(group)), programGroups.length)
    const rightGroup = Math.min(...rightDetails.programGroups.map((group) => programGroups.indexOf(group)), programGroups.length)
    return leftGroup - rightGroup ||
      subtypeOrder.indexOf(leftDetails.subtype) - subtypeOrder.indexOf(rightDetails.subtype) ||
      left.title.localeCompare(right.title)
  })
}

export function filterAdvancementRecords(records: ContentRecord[], filters: AdvancementFilters) {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return sortAdvancementRecords(records).filter((record) => {
    const details = record.details
    const text = `${record.title} ${record.summary}`.toLocaleLowerCase()
    if (terms.some((term) => !text.includes(term))) return false
    if (filters.programGroup && !details.programGroups.includes(filters.programGroup)) return false
    if (filters.subtype && details.subtype !== filters.subtype) return false
    if (filters.meritCategory && (details.subtype !== 'merit' || details.meritCategory !== filters.meritCategory)) return false
    if (filters.color && (details.subtype !== 'merit' || !details.colors.includes(filters.color))) return false
    return true
  })
}

export function advancementRecordLabel(record: ContentRecord) {
  return isAdvancementRecord(record) ? advancementSubtypeLabels[record.details.subtype] : 'Advancement'
}

export function recordLabel(record: ContentRecord) {
  if (record.kind === 'advancement') return advancementRecordLabel(record)
  if (record.kind === 'outpost') return 'Outpost'
  if (record.kind === 'event') return 'Event'
  if (record.kind === 'organization') {
    const details = record.details as { scope?: unknown }
    return details.scope === 'fcf' ? 'FCF organization' : 'Organization'
  }
  return record.slug === 'frontiersmen-camping-fellowship' ? 'FCF' : 'Information page'
}

export function handbookDetails(record: ContentRecord): HandbookDetails | null {
  return isAdvancementRecord(record) && record.details.subtype === 'handbook' ? record.details : null
}
