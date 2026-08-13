import { describe, expect, it } from 'vitest'
import type { EventDetails } from './domain'
import { candidateDraft, parseEventCandidateManifest } from './event-candidate-manifest'
import { eventPublicFactFields } from './events'

function manifest() {
  const details: EventDetails = {
    occurrenceId: 'event-test-2027', series: { id: 'series-test', name: 'Test Series' }, category: 'camp',
    host: 'Test District', scope: 'district', relatedOrganizations: [], startDate: '2027-01-02', endDate: null,
    startTime: null, endTime: null, timeZone: 'America/Chicago', allDay: true,
    locationStatus: 'not-verified', location: null, audience: [], registrationStatus: 'not-verified',
    registrationUrl: null, registrationDeadline: null, deadlineExceptionNote: null, costStatus: 'not-verified',
    costNote: null, lifecycleStatus: 'scheduled', officialUrl: 'https://example.org/event',
  }
  const checkedAt = '2026-08-13T00:00:00.000Z'
  const candidate = {
    candidateId: 'event-test-2027', slug: 'test-event-2027', title: 'Test Event 2027', summary: 'A sourced event.',
    checkedAt, details, conflicts: [],
    sources: eventPublicFactFields({ title: 'Test Event 2027', summary: 'A sourced event.', details }).map((fieldName) => ({
      id: `source-test-${fieldName}`, fieldName, label: 'Organizer page', url: 'https://example.org/event', verifiedAt: checkedAt,
    })),
  }
  return { version: 1, batchKey: 'test-events', candidates: [candidate] }
}

describe('event candidate manifests', () => {
  it('validates full field provenance and always produces an unpublished draft', () => {
    const parsed = parseEventCandidateManifest(manifest())
    expect(candidateDraft(parsed.candidates[0]).status).toBe('draft')
  })

  it('rejects duplicate occurrences and missing field provenance', () => {
    const duplicate = manifest()
    duplicate.candidates.push(structuredClone(duplicate.candidates[0]))
    expect(() => parseEventCandidateManifest(duplicate)).toThrow(/Duplicate candidate ID/)
    const missing = manifest()
    missing.candidates[0].sources = missing.candidates[0].sources.filter((source) => source.fieldName !== 'startDate')
    expect(() => parseEventCandidateManifest(missing)).toThrow(/startDate/)
  })

  it('rejects unbounded batches and source check-date drift', () => {
    const tooMany = manifest()
    tooMany.candidates = Array.from({ length: 51 }, (_, index) => ({
      ...structuredClone(tooMany.candidates[0]), candidateId: `event-${index}`, slug: `event-${index}`,
      details: { ...tooMany.candidates[0].details, occurrenceId: `event-${index}` },
    }))
    expect(() => parseEventCandidateManifest(tooMany)).toThrow(/between 1 and 50/)
    const drift = manifest()
    drift.candidates[0].sources[0].verifiedAt = '2026-08-12T00:00:00.000Z'
    expect(() => parseEventCandidateManifest(drift)).toThrow(/checkedAt/)
  })
})
