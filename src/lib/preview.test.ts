import { describe, expect, it } from 'vitest'
import { defaultEventDetails } from '../../shared/events'
import type { ContentRecord, EventConflict } from '../../shared/domain'
import { preparePublicPreview } from './preview'

function eventDraft(): ContentRecord {
  return {
    id: 'event-1', kind: 'event', slug: 'event-1', title: 'Draft event', summary: 'Unsaved summary',
    status: 'draft', verifiedAt: null, publishedAt: null, updatedAt: '2026-08-12T00:00:00.000Z',
    details: { ...defaultEventDetails(), occurrenceId: 'occurrence-1', host: 'Host', startDate: '2027-01-01', officialUrl: 'https://example.org/event' },
    sources: [{ id: 'source-1', fieldName: 'record', label: 'Organizer', url: 'https://example.org/event', verifiedAt: '2026-08-12T00:00:00.000Z' }],
  }
}

function conflict(fieldName: string): EventConflict {
  return {
    id: `conflict-${fieldName}`, eventId: 'event-1', fieldName, assertions: [], status: 'open',
    openedAt: '2026-08-12T00:00:00.000Z', openedBy: 'operator@example.org', resolutionNote: null,
    resolvedAt: null, resolvedBy: null,
  }
}

describe('private public-presentation preview', () => {
  it('applies public conflict omission rules without changing draft publication state', () => {
    const draft = eventDraft()
    const result = preparePublicPreview(draft, [conflict('location')])

    expect(result.record?.status).toBe('draft')
    expect(result.record).not.toBeNull()
    expect((result.record!.details as { locationStatus: string }).locationStatus).toBe('not-verified')
    expect(draft.status).toBe('draft')
  })

  it('warns and omits a draft that public conflict rules cannot safely display', () => {
    const result = preparePublicPreview(eventDraft(), [conflict('title')])

    expect(result.record).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/would be omitted/i)
  })

  it('warns instead of throwing for missing required draft fields', () => {
    const draft = eventDraft()
    draft.title = ''
    draft.details = defaultEventDetails()
    const result = preparePublicPreview(draft, [])

    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
