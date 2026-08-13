import { describe, expect, it } from 'vitest'
import type { ContentRecord } from '../../shared/domain'
import { fcfLabel, filterOutposts, filterRecords, formatDate, outpostMapUrl } from './records'

const record: ContentRecord = {
  id: 'one',
  kind: 'outpost',
  slug: 'outpost-one',
  title: 'Outpost 1',
  summary: 'A Greenville group',
  status: 'published',
  details: {
    hubOutpostId: 'one',
    outpostNumber: '1',
    campusSuffix: null,
    church: 'LifeChange Church',
    streetAddress: '88 Example Street',
    city: 'Greenville',
    jurisdiction: 'Alabama',
    postalCode: '36037',
    district: 'Alabama District',
    region: 'Southeast Region',
    languageOverlay: '',
    fcfTerritory: 'Riflemen Territory',
    activeFcf: null,
    programs: [],
    meeting: null,
    contactUrl: 'https://example.com/contact',
  },
  verifiedAt: '2026-08-12T00:00:00.000Z',
  publishedAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  sources: [],
}

describe('record helpers', () => {
  it('searches common and detail fields with all terms', () => {
    expect(filterRecords([record], 'lifechange alabama')).toEqual([record])
    expect(filterRecords([record], 'texas')).toEqual([])
  })

  it('uses an explicit three-state FCF label', () => {
    expect(fcfLabel(true)).toBe('Yes')
    expect(fcfLabel(false)).toBe('No')
    expect(fcfLabel(null)).toBe('Not verified')
  })

  it('combines directory filters without treating civil geography as affiliation', () => {
    expect(filterOutposts([record], {
      query: 'lifechange 1',
      jurisdiction: 'Alabama',
      affiliation: 'region|Southeast Region',
      program: '',
      fcf: 'not-verified',
    })).toEqual([record])
    expect(filterOutposts([record], {
      query: '', jurisdiction: 'Alabama', affiliation: 'region|Gulf Region', program: '', fcf: '',
    })).toEqual([])
    const campusRecord = { ...record, details: { ...record.details, campusSuffix: 'A' } }
    expect(filterOutposts([campusRecord], {
      query: '1A', jurisdiction: '', affiliation: '', program: '', fcf: '',
    })).toEqual([campusRecord])
  })

  it('generates a map link only when every address field has provenance', () => {
    const sourced = {
      ...record,
      sources: ['streetAddress', 'city', 'jurisdiction', 'postalCode'].map((fieldName) => ({
        id: fieldName,
        fieldName,
        label: 'Church contact page',
        url: 'https://example.com/contact',
        verifiedAt: '2026-08-12T00:00:00.000Z',
      })),
    }
    expect(outpostMapUrl(sourced)).toContain('google.com/maps/search')
    expect(outpostMapUrl(record)).toBeNull()
  })

  it('formats source dates consistently', () => {
    expect(formatDate('2026-09-11')).toBe('Sep 11, 2026')
  })
})
