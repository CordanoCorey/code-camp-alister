import type { EventConflictAssertion, EventDetails, SourceRecord } from './domain.ts'
import { validatePublishedEvent } from './events.ts'

export type EventCandidate = {
  candidateId: string
  slug: string
  title: string
  summary: string
  checkedAt: string
  details: EventDetails
  sources: SourceRecord[]
  conflicts: Array<{
    fieldName: string
    assertions: EventConflictAssertion[]
    reason: string
  }>
}

export type EventCandidateManifest = {
  version: 1
  batchKey: string
  candidates: EventCandidate[]
}

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  return value.trim()
}

function https(value: unknown, label: string) {
  const result = text(value, label)
  try {
    if (new URL(result).protocol !== 'https:') throw new Error()
  } catch {
    throw new Error(`${label} must be an HTTPS URL.`)
  }
  return result
}

function timestamp(value: unknown, label: string) {
  const result = text(value, label)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || Number.isNaN(Date.parse(result))) {
    throw new Error(`${label} must be an ISO UTC timestamp.`)
  }
  return result
}

function source(value: unknown, candidateId: string, index: number): SourceRecord {
  const input = object(value, `${candidateId}.sources[${index}]`)
  return {
    id: text(input.id, `${candidateId}.sources[${index}].id`),
    fieldName: text(input.fieldName, `${candidateId}.sources[${index}].fieldName`),
    label: text(input.label, `${candidateId}.sources[${index}].label`),
    url: https(input.url, `${candidateId}.sources[${index}].url`),
    verifiedAt: timestamp(input.verifiedAt, `${candidateId}.sources[${index}].verifiedAt`),
  }
}

function conflict(value: unknown, candidateId: string, index: number): EventCandidate['conflicts'][number] {
  const input = object(value, `${candidateId}.conflicts[${index}]`)
  if (!Array.isArray(input.assertions) || input.assertions.length < 2) {
    throw new Error(`${candidateId}.conflicts[${index}] needs at least two assertions.`)
  }
  return {
    fieldName: text(input.fieldName, `${candidateId}.conflicts[${index}].fieldName`),
    reason: text(input.reason, `${candidateId}.conflicts[${index}].reason`),
    assertions: input.assertions.map((value, assertionIndex) => {
      const assertion = object(value, `${candidateId}.conflicts[${index}].assertions[${assertionIndex}]`)
      return {
        sourceId: assertion.sourceId === null ? null : text(assertion.sourceId, 'Conflict source ID'),
        sourceLabel: text(assertion.sourceLabel, 'Conflict source label'),
        assertedValue: text(assertion.assertedValue, 'Conflict asserted value'),
      }
    }),
  }
}

export function parseEventCandidateManifest(value: unknown): EventCandidateManifest {
  const input = object(value, 'Event candidate manifest')
  if (input.version !== 1) throw new Error('Event candidate manifest version must be 1.')
  const batchKey = text(input.batchKey, 'batchKey')
  if (!idPattern.test(batchKey)) throw new Error('batchKey must use lowercase words separated by hyphens.')
  if (!Array.isArray(input.candidates) || input.candidates.length === 0 || input.candidates.length > 50) {
    throw new Error('A manifest needs between 1 and 50 candidates.')
  }

  const candidates = input.candidates.map((value, index): EventCandidate => {
    const candidate = object(value, `candidates[${index}]`)
    const candidateId = text(candidate.candidateId, `candidates[${index}].candidateId`)
    if (!idPattern.test(candidateId)) throw new Error(`${candidateId} must use lowercase words separated by hyphens.`)
    if (!Array.isArray(candidate.sources)) throw new Error(`${candidateId}.sources must be a list.`)
    const sources = candidate.sources.map((item, sourceIndex) => source(item, candidateId, sourceIndex))
    const result: EventCandidate = {
      candidateId,
      slug: text(candidate.slug, `${candidateId}.slug`),
      title: text(candidate.title, `${candidateId}.title`),
      summary: text(candidate.summary, `${candidateId}.summary`),
      checkedAt: timestamp(candidate.checkedAt, `${candidateId}.checkedAt`),
      details: candidate.details as EventDetails,
      sources,
      conflicts: Array.isArray(candidate.conflicts)
        ? candidate.conflicts.map((item, conflictIndex) => conflict(item, candidateId, conflictIndex))
        : [],
    }
    if (!idPattern.test(result.slug)) throw new Error(`${candidateId}.slug must use lowercase words separated by hyphens.`)
    const validation = validatePublishedEvent({
      title: result.title,
      summary: result.summary,
      status: 'published',
      verifiedAt: result.checkedAt,
      details: result.details,
      sources: result.sources,
    })
    if (validation.length) throw new Error(`${candidateId}: ${validation.join(' ')}`)
    if (result.sources.some((item) => item.verifiedAt !== result.checkedAt)) {
      throw new Error(`${candidateId}: every field source must use the candidate checkedAt timestamp.`)
    }
    const sourceIds = new Set(result.sources.map((item) => item.id))
    for (const item of result.conflicts) {
      for (const assertion of item.assertions) {
        if (assertion.sourceId !== null && !sourceIds.has(assertion.sourceId)) {
          throw new Error(`${candidateId}: conflict source ${assertion.sourceId} is not in the candidate sources.`)
        }
      }
    }
    return result
  })

  for (const [label, values] of [
    ['candidate ID', candidates.map((item) => item.candidateId)],
    ['slug', candidates.map((item) => item.slug)],
    ['occurrence ID', candidates.map((item) => item.details.occurrenceId)],
  ] as const) {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} in manifest.`)
  }
  const seriesNames = new Map<string, string>()
  for (const candidate of candidates) {
    if (!candidate.details.series) continue
    const previous = seriesNames.get(candidate.details.series.id)
    if (previous && previous !== candidate.details.series.name) throw new Error(`Series ${candidate.details.series.id} has conflicting names.`)
    seriesNames.set(candidate.details.series.id, candidate.details.series.name)
  }
  return { version: 1, batchKey, candidates }
}

export function candidateDraft(candidate: EventCandidate) {
  return {
    kind: 'event' as const,
    slug: candidate.slug,
    title: candidate.title,
    summary: candidate.summary,
    status: 'draft' as const,
    details: candidate.details,
    verifiedAt: candidate.checkedAt,
    sources: candidate.sources,
  }
}
