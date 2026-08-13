import { describe, expect, it } from 'vitest'
import type { ContentRecord, CoverageGap, EventConflict, EventDetails } from './domain'
import {
  buildFreshnessQueue,
  displayedEventLifecycle,
  filterEventRecords,
  formatEventDateRange,
  serializePublicEvent,
  sortEventRecords,
  validateEventDetails,
  validatePublishedEvent,
} from './events'

const details: EventDetails = {
  occurrenceId: 'camporama-2026',
  series: { id: 'camporama', name: 'National Camporama' },
  category: 'camp',
  host: 'Royal Rangers USA',
  scope: 'national',
  relatedOrganizations: [{ id: 'rr-usa', name: 'Royal Rangers USA' }],
  startDate: '2026-07-06',
  endDate: '2026-07-10',
  startTime: null,
  endTime: null,
  timeZone: 'America/Chicago',
  allDay: true,
  locationStatus: 'announced',
  location: 'Eagle Rock, Missouri',
  audience: ['Rangers', 'Leaders'],
  registrationStatus: 'closed',
  registrationUrl: 'https://royalrangers.com/camporama',
  registrationDeadline: '2026-06-01',
  deadlineExceptionNote: null,
  costStatus: 'paid',
  costNote: 'See the organizer page for current participant pricing.',
  lifecycleStatus: 'confirmed',
  officialUrl: 'https://royalrangers.com/camporama',
}

const sourceFields = [
  'title', 'summary', 'occurrenceId', 'series', 'category', 'host', 'scope',
  'relatedOrganizations', 'startDate', 'endDate', 'timeZone', 'allDay',
  'locationStatus', 'location', 'audience', 'registrationStatus', 'registrationUrl',
  'registrationDeadline', 'costStatus', 'costNote', 'lifecycleStatus', 'officialUrl',
]

function event(overrides: Partial<ContentRecord> = {}, detailOverrides: Partial<EventDetails> = {}): ContentRecord {
  return {
    id: 'event-camporama-2026',
    kind: 'event',
    slug: 'camporama-2026',
    title: 'National Camporama 2026',
    summary: 'A national Royal Rangers camp occurrence.',
    status: 'published',
    details: { ...details, ...detailOverrides },
    verifiedAt: '2026-06-01T00:00:00.000Z',
    publishedAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    sources: sourceFields.map((fieldName) => ({
      id: `source-${fieldName}`,
      fieldName,
      label: 'Royal Rangers USA Camporama',
      url: 'https://royalrangers.com/camporama',
      verifiedAt: '2026-06-01T00:00:00.000Z',
    })),
    ...overrides,
  }
}

describe('event validation and local schedule formatting', () => {
  it('validates dates, local times, zones, HTTPS links, and field provenance', () => {
    expect(validatePublishedEvent(event())).toEqual([])
    const invalid = {
      ...details,
      startDate: '2026-02-30',
      endDate: '2026-02-01',
      allDay: false,
      startTime: '18:00',
      endTime: '17:00',
      timeZone: 'Central-ish',
      officialUrl: 'http://example.com',
    }
    expect(validateEventDetails(invalid).join(' ')).toMatch(/local ISO date/)
    expect(validateEventDetails(invalid).join(' ')).toMatch(/IANA/)
    expect(validateEventDetails(invalid).join(' ')).toMatch(/HTTPS/)
    expect(validatePublishedEvent({ ...event(), sources: event().sources.filter((source) => source.fieldName !== 'host') }).join(' ')).toMatch(/host/)
  })

  it('renders organizer-local dates without browser-zone conversion or invented times', () => {
    expect(formatEventDateRange(details)).toBe('Jul 6, 2026 – Jul 10, 2026 · All day · America/Chicago')
    expect(formatEventDateRange({ ...details, allDay: false, startTime: '18:30', endTime: '20:00' })).toContain('6:30 PM – 8:00 PM · America/Chicago')
  })
})

describe('event lifecycle, views, and filters', () => {
  it('derives completion without overriding cancellation or postponement', () => {
    expect(displayedEventLifecycle(details, '2026-08-12')).toBe('completed')
    expect(displayedEventLifecycle({ ...details, lifecycleStatus: 'cancelled' }, '2026-08-12')).toBe('cancelled')
    expect(displayedEventLifecycle({ ...details, lifecycleStatus: 'postponed' }, '2026-08-12')).toBe('postponed')
  })

  it('sorts upcoming forward and past in reverse chronology', () => {
    const early = event({ id: 'early' }, { occurrenceId: 'early', startDate: '2026-09-01', endDate: null })
    const late = event({ id: 'late' }, { occurrenceId: 'late', startDate: '2026-10-01', endDate: null })
    const older = event({ id: 'older' }, { occurrenceId: 'older', startDate: '2025-01-01', endDate: null, registrationDeadline: null, lifecycleStatus: 'completed' })
    expect(sortEventRecords([late, early], 'upcoming', '2026-08-12').map((record) => record.id)).toEqual(['early', 'late'])
    expect(sortEventRecords([older, event()], 'past', '2026-08-12').map((record) => record.id)).toEqual(['event-camporama-2026', 'older'])
  })

  it('combines host/category/scope/audience/year and date filters', () => {
    expect(filterEventRecords([event()], {
      query: 'royal rangers eagle',
      category: 'camp',
      scope: 'national',
      lifecycle: 'completed',
      registration: 'closed',
      audience: 'Leaders',
      year: '2026',
      from: '2026-07-01',
      to: '2026-07-31',
    }, '2026-08-12')).toHaveLength(1)
  })
})

describe('freshness and public/private serialization', () => {
  it('classifies stale sources, completion candidates, broken links, conflicts, and coverage gaps', () => {
    const conflict: EventConflict = {
      id: 'conflict-1', eventId: event().id, fieldName: 'location', status: 'open',
      assertions: [{ sourceId: 'source-location', sourceLabel: 'Organizer page', assertedValue: 'Missouri' }],
      openedAt: '2026-08-01T00:00:00.000Z', openedBy: 'operator', resolutionNote: null, resolvedAt: null, resolvedBy: null,
    }
    const gap: CoverageGap = {
      id: 'gap-1', scope: 'Northeast Region', description: 'No current regional source verified',
      sourceUrl: null, lastCheckedAt: '2026-08-01T00:00:00.000Z', status: 'open', resolutionReason: null,
      createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'operator', resolvedAt: null, resolvedBy: null,
    }
    const queue = buildFreshnessQueue([event()], [conflict], [{
      id: 'broken-1', sourceId: 'source-location', recordId: event().id,
      observedAt: '2026-08-02T00:00:00.000Z', observedBy: 'operator', note: 'Returned 404', clearedAt: null, clearedBy: null,
    }], [gap], '2026-08-12')
    expect(new Set(queue.map((item) => item.type))).toEqual(new Set(['verification-stale', 'completion', 'broken-source', 'event-conflict', 'coverage-gap']))
  })

  it('masks a disputed optional fact publicly without exposing notes or actor identity', () => {
    const conflict: EventConflict = {
      id: 'conflict-1', eventId: event().id, fieldName: 'location', status: 'open',
      assertions: [{ sourceId: null, sourceLabel: 'Source A', assertedValue: 'Internal assertion' }],
      openedAt: '2026-08-01T00:00:00.000Z', openedBy: 'private@example.com', resolutionNote: 'Private note', resolvedAt: null, resolvedBy: null,
    }
    const serialized = serializePublicEvent(event(), [conflict])
    expect(serialized).not.toBeNull()
    if (!serialized) throw new Error('Expected a public event.')
    const publicDetails = serialized.details as EventDetails
    expect(publicDetails.location).toBeNull()
    expect(publicDetails.verificationWarnings).toEqual(['location'])
    expect(JSON.stringify(serialized)).not.toContain('Private note')
    expect(JSON.stringify(serialized)).not.toContain('private@example.com')
  })

  it('withholds an event whose required fact has an open conflict', () => {
    const conflict = {
      id: 'conflict-2', eventId: event().id, fieldName: 'startDate', status: 'open' as const,
      assertions: [], openedAt: '2026-08-01T00:00:00.000Z', openedBy: 'operator', resolutionNote: null, resolvedAt: null, resolvedBy: null,
    }
    expect(serializePublicEvent(event(), [conflict])).toBeNull()
  })
})
