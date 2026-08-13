import {
  eventCategories,
  eventCostStatuses,
  eventLifecycleStatuses,
  eventLocationStatuses,
  eventRegistrationStatuses,
  eventScopes,
  type BrokenSourceObservation,
  type ContentRecord,
  type CoverageGap,
  type EventConflict,
  type EventDetails,
  type EventLifecycleStatus,
  type FreshnessQueueItem,
} from './domain'

// Beta policy: event facts are rechecked every 60 days and enter the queue 14 days early.
// The queue is deterministic and never writes or publishes on its own.
export const EVENT_FRESHNESS_POLICY = {
  expiresAfterDays: 60,
  approachingWithinDays: 14,
} as const

export type EventView = 'upcoming' | 'past'

export type EventFilters = {
  query: string
  category: string
  scope: string
  lifecycle: string
  registration: string
  audience: string
  year: string
  from: string
  to: string
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function isIsoLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function defaultEventDetails(): EventDetails {
  return {
    occurrenceId: '',
    series: null,
    category: 'other',
    host: '',
    scope: 'district',
    relatedOrganizations: [],
    startDate: '',
    endDate: null,
    startTime: null,
    endTime: null,
    timeZone: 'America/Chicago',
    allDay: true,
    locationStatus: 'not-verified',
    location: null,
    audience: [],
    registrationStatus: 'not-verified',
    registrationUrl: null,
    registrationDeadline: null,
    deadlineExceptionNote: null,
    costStatus: 'not-verified',
    costNote: null,
    lifecycleStatus: 'scheduled',
    officialUrl: '',
  }
}

export function validateEventDetails(value: unknown): string[] {
  if (!isObject(value)) return ['Event details are required.']
  const details = value as Partial<EventDetails>
  const errors: string[] = []

  if (!details.occurrenceId?.trim()) errors.push('Occurrence ID is required.')
  if (details.series !== null && details.series !== undefined) {
    if (!isObject(details.series) || typeof details.series.id !== 'string' || !details.series.id.trim() || typeof details.series.name !== 'string' || !details.series.name.trim()) {
      errors.push('A series needs an ID and name.')
    }
  }
  if (!eventCategories.includes(details.category as EventDetails['category'])) errors.push('Choose a valid event category.')
  if (!details.host?.trim()) errors.push('Host or organizer is required.')
  if (!eventScopes.includes(details.scope as EventDetails['scope'])) errors.push('Choose a valid event scope.')
  if (!Array.isArray(details.relatedOrganizations) || details.relatedOrganizations.some((organization) => !isObject(organization) || typeof organization.id !== 'string' || !organization.id.trim() || typeof organization.name !== 'string' || !organization.name.trim())) {
    errors.push('Related organizations need an ID and name.')
  }
  if (!isIsoLocalDate(details.startDate)) errors.push('Start date must be a valid local ISO date.')
  if (details.endDate !== null && !isIsoLocalDate(details.endDate)) errors.push('End date must be a valid local ISO date or blank.')
  if (isIsoLocalDate(details.startDate) && isIsoLocalDate(details.endDate) && details.endDate < details.startDate) errors.push('End date cannot be before the start date.')
  if (details.startTime !== null && (typeof details.startTime !== 'string' || !timePattern.test(details.startTime))) errors.push('Start time must use HH:MM or be blank.')
  if (details.endTime !== null && (typeof details.endTime !== 'string' || !timePattern.test(details.endTime))) errors.push('End time must use HH:MM or be blank.')
  if (details.allDay && (details.startTime || details.endTime)) errors.push('All-day events cannot include times.')
  if (!details.allDay && !details.startTime) errors.push('Timed events need a start time.')
  if (!details.startTime && details.endTime) errors.push('An end time requires a start time.')
  if (details.startTime && details.endTime && (!details.endDate || details.endDate === details.startDate) && details.endTime <= details.startTime) errors.push('End time must be after the start time.')
  if (!isIanaTimeZone(details.timeZone)) errors.push('Choose a valid IANA time zone.')
  if (!eventLocationStatuses.includes(details.locationStatus as EventDetails['locationStatus'])) errors.push('Choose a valid location status.')
  if (details.locationStatus === 'announced' && !details.location?.trim()) errors.push('An announced location needs verified public location text.')
  if (details.locationStatus !== 'announced' && details.location) errors.push('Public location text is only allowed when the location is announced.')
  if (!isStringArray(details.audience)) errors.push('Audience labels must be a list of non-personal labels.')
  if (!eventRegistrationStatuses.includes(details.registrationStatus as EventDetails['registrationStatus'])) errors.push('Choose a valid registration status.')
  if (details.registrationUrl !== null && !isHttpsUrl(details.registrationUrl)) errors.push('Registration URL must be HTTPS or blank.')
  if (details.registrationDeadline !== null && !isIsoLocalDate(details.registrationDeadline)) errors.push('Registration deadline must be a valid local ISO date or blank.')
  if (isIsoLocalDate(details.registrationDeadline) && isIsoLocalDate(details.startDate) && details.registrationDeadline > details.startDate && !details.deadlineExceptionNote?.trim()) {
    errors.push('A deadline after the event begins needs an exception note.')
  }
  if (!eventCostStatuses.includes(details.costStatus as EventDetails['costStatus'])) errors.push('Choose a valid cost status.')
  if (details.costStatus !== 'not-verified' && !details.costNote?.trim()) errors.push('A verified cost status needs the organizer’s public cost note.')
  if (details.costStatus === 'not-verified' && details.costNote) errors.push('Cost notes require a verified cost status.')
  if (!eventLifecycleStatuses.includes(details.lifecycleStatus as EventDetails['lifecycleStatus'])) errors.push('Choose a valid lifecycle status.')
  if (!isHttpsUrl(details.officialUrl)) errors.push('Official event URL must be HTTPS.')
  return errors
}

export function isEventDetails(value: unknown): value is EventDetails {
  return validateEventDetails(value).length === 0
}

export function isEventRecord(record: ContentRecord): record is ContentRecord & { details: EventDetails } {
  return record.kind === 'event' && isEventDetails(record.details)
}

export function eventDetails(record: ContentRecord) {
  return record.details as EventDetails
}

export function eventPublicFactFields(record: Pick<ContentRecord, 'title' | 'summary' | 'details'>) {
  const details = record.details as EventDetails
  const fields = [
    'title',
    'summary',
    'occurrenceId',
    'category',
    'host',
    'scope',
    'startDate',
    'timeZone',
    'allDay',
    'locationStatus',
    'registrationStatus',
    'costStatus',
    'lifecycleStatus',
    'officialUrl',
  ]
  const optional: Array<[string, unknown]> = [
    ['series', details.series],
    ['relatedOrganizations', details.relatedOrganizations],
    ['endDate', details.endDate],
    ['startTime', details.startTime],
    ['endTime', details.endTime],
    ['location', details.location],
    ['audience', details.audience],
    ['registrationUrl', details.registrationUrl],
    ['registrationDeadline', details.registrationDeadline],
    ['costNote', details.costNote],
  ]
  for (const [field, value] of optional) {
    if (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '') fields.push(field)
  }
  return fields
}

export function validatePublishedEvent(record: Pick<ContentRecord, 'title' | 'summary' | 'status' | 'verifiedAt' | 'details' | 'sources'>) {
  const errors = validateEventDetails(record.details)
  if (record.status !== 'published') return errors
  if (!record.verifiedAt) errors.push('Published events need a record verification date.')
  const sourcedFields = new Set(record.sources.map((source) => source.fieldName))
  const missing = eventPublicFactFields(record).filter((field) => !sourcedFields.has(field))
  if (missing.length > 0) errors.push(`Add a field-level source for: ${missing.join(', ')}.`)
  return errors
}

function parseDateForDisplay(date: string) {
  return new Date(`${date}T12:00:00Z`)
}

export function formatEventLocalDate(date: string, includeYear = true) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(parseDateForDisplay(date))
}

function formatLocalTime(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)))
}

export function formatEventDateRange(details: EventDetails) {
  const start = formatEventLocalDate(details.startDate)
  const dates = details.endDate && details.endDate !== details.startDate
    ? `${start} – ${formatEventLocalDate(details.endDate)}`
    : start
  if (details.allDay || !details.startTime) return `${dates} · All day · ${details.timeZone}`
  const times = details.endTime ? `${formatLocalTime(details.startTime)} – ${formatLocalTime(details.endTime)}` : formatLocalTime(details.startTime)
  return `${dates} · ${times} · ${details.timeZone}`
}

export function displayedEventLifecycle(details: EventDetails, today: string): EventLifecycleStatus {
  if (details.lifecycleStatus === 'cancelled' || details.lifecycleStatus === 'postponed' || details.lifecycleStatus === 'completed') return details.lifecycleStatus
  const eventEnd = details.endDate ?? details.startDate
  return eventEnd < today ? 'completed' : details.lifecycleStatus
}

export function eventViewFor(details: EventDetails, today: string): EventView {
  const eventEnd = details.endDate ?? details.startDate
  return displayedEventLifecycle(details, today) === 'completed' || eventEnd < today ? 'past' : 'upcoming'
}

export function sortEventRecords(records: ContentRecord[], view: EventView, today: string) {
  return records
    .filter(isEventRecord)
    .filter((record) => eventViewFor(record.details, today) === view)
    .sort((left, right) => view === 'upcoming'
      ? left.details.startDate.localeCompare(right.details.startDate)
      : right.details.startDate.localeCompare(left.details.startDate))
}

export function filterEventRecords(records: ContentRecord[], filters: EventFilters, today: string) {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return records.filter((record) => {
    if (!isEventRecord(record)) return false
    const details = record.details
    const text = [record.title, record.summary, details.category, details.host, details.scope, details.location, details.series?.name, ...details.audience, ...details.relatedOrganizations.map((organization) => organization.name)].filter(Boolean).join(' ').toLocaleLowerCase()
    if (terms.some((term) => !text.includes(term))) return false
    if (filters.category && details.category !== filters.category) return false
    if (filters.scope && details.scope !== filters.scope) return false
    if (filters.lifecycle && displayedEventLifecycle(details, today) !== filters.lifecycle) return false
    if (filters.registration && details.registrationStatus !== filters.registration) return false
    if (filters.audience && !details.audience.includes(filters.audience)) return false
    if (filters.year && !details.startDate.startsWith(`${filters.year}-`)) return false
    const eventEnd = details.endDate ?? details.startDate
    if (filters.from && eventEnd < filters.from) return false
    if (filters.to && details.startDate > filters.to) return false
    return true
  })
}

export function isHomeUpcomingEvent(record: ContentRecord, today: string) {
  if (!isEventRecord(record) || record.status !== 'published' || !record.verifiedAt) return false
  if (record.details.verificationWarnings?.length) return false
  if (eventViewFor(record.details, today) !== 'upcoming') return false
  return ['scheduled', 'accepting-registration', 'confirmed'].includes(displayedEventLifecycle(record.details, today))
}

function daysBetween(earlier: string, later: string) {
  return Math.floor((Date.parse(`${later.slice(0, 10)}T00:00:00Z`) - Date.parse(`${earlier.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

export function buildFreshnessQueue(
  records: ContentRecord[],
  conflicts: EventConflict[],
  brokenSources: BrokenSourceObservation[],
  coverageGaps: CoverageGap[],
  today: string,
): FreshnessQueueItem[] {
  const items: FreshnessQueueItem[] = []
  for (const record of records.filter((candidate) => candidate.kind === 'event')) {
    for (const source of record.sources) {
      const age = daysBetween(source.verifiedAt, today)
      if (age >= EVENT_FRESHNESS_POLICY.expiresAfterDays - EVENT_FRESHNESS_POLICY.approachingWithinDays) {
        const stale = age >= EVENT_FRESHNESS_POLICY.expiresAfterDays
        items.push({
          id: `${stale ? 'stale' : 'due'}:${source.id}`,
          type: stale ? 'verification-stale' : 'verification-due',
          severity: stale ? 'overdue' : 'due',
          title: stale ? 'Source verification is stale' : 'Source verification is approaching expiry',
          recordId: record.id,
          fieldName: source.fieldName,
          sourceId: source.id,
          sourceLabel: source.label,
          sourceUrl: source.url,
          lastCheckedAt: source.verifiedAt,
          actionTarget: `record:${record.id}`,
        })
      }
    }
    if (isEventRecord(record)) {
      const displayed = displayedEventLifecycle(record.details, today)
      if (displayed === 'completed') {
        const storedCompleted = record.details.lifecycleStatus === 'completed'
        items.push({
          id: `completion:${record.id}`,
          type: 'completion',
          severity: storedCompleted ? 'info' : 'due',
          title: storedCompleted ? 'Completed occurrence retained in history' : 'Occurrence is eligible to be marked completed',
          recordId: record.id,
          fieldName: 'lifecycleStatus',
          sourceId: null,
          sourceLabel: null,
          sourceUrl: record.details.officialUrl,
          lastCheckedAt: record.verifiedAt,
          actionTarget: `record:${record.id}`,
        })
      }
    }
  }
  for (const observation of brokenSources.filter((candidate) => candidate.clearedAt === null)) {
    const source = records.flatMap((record) => record.sources).find((candidate) => candidate.id === observation.sourceId)
    items.push({
      id: `broken:${observation.id}`,
      type: 'broken-source',
      severity: 'overdue',
      title: 'Source recorded as broken or unreachable',
      recordId: observation.recordId,
      fieldName: source?.fieldName ?? null,
      sourceId: observation.sourceId,
      sourceLabel: source?.label ?? null,
      sourceUrl: source?.url ?? null,
      lastCheckedAt: observation.observedAt,
      actionTarget: `source:${observation.sourceId}`,
    })
  }
  for (const conflict of conflicts.filter((candidate) => candidate.status === 'open')) {
    items.push({
      id: `conflict:${conflict.id}`,
      type: 'event-conflict',
      severity: 'overdue',
      title: 'Event sources disagree',
      recordId: conflict.eventId,
      fieldName: conflict.fieldName,
      sourceId: null,
      sourceLabel: conflict.assertions.map((assertion) => assertion.sourceLabel).join(' / '),
      sourceUrl: null,
      lastCheckedAt: conflict.openedAt,
      actionTarget: `conflict:${conflict.id}`,
    })
  }
  for (const gap of coverageGaps.filter((candidate) => candidate.status === 'open')) {
    items.push({
      id: `gap:${gap.id}`,
      type: 'coverage-gap',
      severity: 'due',
      title: `${gap.scope}: ${gap.description}`,
      recordId: null,
      fieldName: 'scope',
      sourceId: null,
      sourceLabel: gap.scope,
      sourceUrl: gap.sourceUrl,
      lastCheckedAt: gap.lastCheckedAt,
      actionTarget: `gap:${gap.id}`,
    })
  }
  const order = { overdue: 0, due: 1, info: 2 }
  return items.sort((left, right) => order[left.severity] - order[right.severity] || left.title.localeCompare(right.title))
}

const requiredConflictFields = new Set(['title', 'summary', 'occurrenceId', 'category', 'host', 'scope', 'startDate', 'timeZone', 'allDay', 'lifecycleStatus', 'officialUrl'])

export function serializePublicEvent(record: ContentRecord, conflicts: EventConflict[]) {
  if (record.kind !== 'event' || record.status !== 'published') return null
  const openFields = conflicts.filter((conflict) => conflict.eventId === record.id && conflict.status === 'open').map((conflict) => conflict.fieldName)
  if (openFields.some((field) => requiredConflictFields.has(field))) return null
  const details = structuredClone(record.details as EventDetails)
  for (const field of openFields) {
    if (field === 'location' || field === 'locationStatus') {
      details.location = null
      details.locationStatus = 'not-verified'
    } else if (field === 'audience') details.audience = []
    else if (field.startsWith('registration')) {
      details.registrationStatus = 'not-verified'
      details.registrationUrl = null
      details.registrationDeadline = null
    } else if (field === 'costStatus' || field === 'costNote') {
      details.costStatus = 'not-verified'
      details.costNote = null
    } else if (field === 'startTime' || field === 'endTime') {
      details.startTime = null
      details.endTime = null
      details.allDay = true
    } else if (field === 'series') details.series = null
    else if (field === 'relatedOrganizations') details.relatedOrganizations = []
  }
  details.verificationWarnings = [...new Set(openFields)]
  return {
    ...record,
    details,
    sources: record.sources.filter((source) => !openFields.includes(source.fieldName)),
  }
}
