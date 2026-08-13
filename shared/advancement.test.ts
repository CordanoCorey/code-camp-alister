import { describe, expect, it } from 'vitest'
import type { AdvancementDetails, ContentRecord } from './domain'
import {
  advancementRecordLabel,
  changeAdvancementSubtype,
  defaultAdvancementDetails,
  filterAdvancementRecords,
  isAdvancementRecord,
  recordLabel,
  sortAdvancementRecords,
  validateAdvancementDetails,
} from './advancement'

function advancementRecord(id: string, title: string, details: AdvancementDetails): ContentRecord {
  return {
    id,
    kind: 'advancement',
    slug: id,
    title,
    summary: `${title} independently summarized`,
    status: 'published',
    details,
    verifiedAt: '2026-08-12T00:00:00.000Z',
    publishedAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    sources: [{ id: `${id}-source`, fieldName: 'record', label: 'Official source', url: 'https://example.com', verifiedAt: '2026-08-12T00:00:00.000Z' }],
  }
}

const common = {
  audiences: [] as Array<'Leaders' | 'FCF'>,
  gradeRange: null,
  officialUrl: 'https://example.com',
  contentStatus: 'current' as const,
  references: [],
}

describe('advancement module', () => {
  it('guards subtype details and labels public results', () => {
    const merit = advancementRecord('camping', 'Camping', {
      ...common,
      subtype: 'merit',
      programGroups: ['Discovery Rangers'],
      meritCategory: 'skill',
      colors: ['blue'],
    })
    expect(isAdvancementRecord(merit)).toBe(true)
    expect(advancementRecordLabel(merit)).toBe('Merit')
    expect(recordLabel({ ...merit, kind: 'event' })).toBe('Event')
    expect(isAdvancementRecord({ ...merit, details: { ...merit.details, subtype: 'unknown' } as never })).toBe(false)
  })

  it('distinguishes every advancement subtype and FCF in global search labels', () => {
    const records = [
      advancementRecord('program', 'Ranger Kids', { ...common, subtype: 'program-group', programGroups: ['Ranger Kids'], accent: '#D34A36', highlights: [] }),
      advancementRecord('trail', 'Trail to the Elk', { ...common, subtype: 'achievement-trail', programGroups: ['Ranger Kids'] }),
      advancementRecord('merit', 'Camping', { ...common, subtype: 'merit', programGroups: ['Adventure Rangers'], meritCategory: 'skill', colors: ['green'] }),
      advancementRecord('award', 'Trail of the Saber', { ...common, subtype: 'award', programGroups: ['Adventure Rangers'], awardLevel: 'junior-leadership' }),
      advancementRecord('handbook', 'Adventure Rangers Handbook', {
        ...common,
        subtype: 'handbook',
        programGroups: ['Adventure Rangers'],
        publisher: 'Gospel Publishing House',
        itemNumber: '020616',
        edition: null,
        revision: null,
        publicationYear: null,
        availability: 'available',
        formats: ['print'],
        purchaseUrls: [],
      }),
    ]
    expect(records.map(recordLabel)).toEqual(['Program Group', 'Achievement Trail', 'Merit', 'Award', 'Handbook'])
    expect(recordLabel({
      ...records[0],
      kind: 'organization',
      details: { organizationType: 'fcf-territory', scope: 'fcf', parent: null, affiliations: [], jurisdictions: [] },
    })).toBe('FCF organization')
    expect(recordLabel({
      ...records[0],
      kind: 'page',
      slug: 'frontiersmen-camping-fellowship',
      details: { section: 'other', body: [], links: [] },
    })).toBe('FCF')
  })

  it('sorts Program Groups in grade order before subtype and title', () => {
    const rangerKids = advancementRecord('rk', 'Ranger Kids', {
      ...common,
      subtype: 'program-group',
      programGroups: ['Ranger Kids'],
      gradeRange: 'K–2',
      accent: '#D34A36',
      highlights: [],
    })
    const expedition = advancementRecord('expedition', 'Expedition Rangers', {
      ...common,
      subtype: 'program-group',
      programGroups: ['Expedition Rangers'],
      gradeRange: '9–12',
      accent: '#73528F',
      highlights: [],
    })
    const trail = advancementRecord('trail', 'Trail to the Elk', {
      ...common,
      subtype: 'achievement-trail',
      programGroups: ['Ranger Kids'],
    })
    expect(sortAdvancementRecords([expedition, trail, rangerKids]).map((record) => record.id)).toEqual(['rk', 'trail', 'expedition'])
  })

  it('combines title/summary, Program Group, subtype, category, and color filters', () => {
    const blue = advancementRecord('blue', 'Camping Merit', {
      ...common,
      subtype: 'merit',
      programGroups: ['Discovery Rangers'],
      meritCategory: 'skill',
      colors: ['blue'],
    })
    const red = advancementRecord('red', 'Leadership Merit', {
      ...common,
      subtype: 'merit',
      programGroups: ['Discovery Rangers'],
      meritCategory: 'leadership',
      colors: ['red'],
    })
    expect(filterAdvancementRecords([red, blue], {
      query: 'camping summarized',
      programGroup: 'Discovery Rangers',
      subtype: 'merit',
      meritCategory: 'skill',
      color: 'blue',
    })).toEqual([blue])
  })

  it('rejects invalid cross-subtype fields, URLs, colors, and handbook formats', () => {
    expect(validateAdvancementDetails({
      ...common,
      subtype: 'merit',
      programGroups: ['Discovery Rangers'],
      officialUrl: 'http://example.com',
      meritCategory: 'bible',
      colors: ['blue'],
      publisher: 'Does not belong here',
    }).join(' ')).toMatch(/Remove fields.*Official URL.*colors/s)

    const handbook = {
      ...defaultAdvancementDetails('handbook'),
      audiences: ['FCF'] as const,
      officialUrl: 'https://example.com/fcf',
      formats: ['pdf'],
      purchaseUrls: [{ label: 'Download', format: 'ebook', url: 'http://example.com/file' }],
    }
    expect(validateAdvancementDetails(handbook).join(' ')).toMatch(/formats.*Purchase link/s)
  })

  it('clears subtype-only fields when the Operator changes subtype', () => {
    const handbook = defaultAdvancementDetails('handbook')
    if (handbook.subtype !== 'handbook') throw new Error('Expected handbook defaults.')
    handbook.programGroups = ['Ranger Kids']
    handbook.officialUrl = 'https://example.com/handbook'
    handbook.publisher = 'Gospel Publishing House'
    handbook.itemNumber = '022115'
    const merit = changeAdvancementSubtype(handbook, 'merit')
    expect(merit.subtype).toBe('merit')
    expect('publisher' in merit).toBe(false)
    expect(merit.programGroups).toEqual(['Ranger Kids'])
  })
})
