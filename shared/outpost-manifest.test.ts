import { describe, expect, it } from 'vitest'
import { manifestChecksum, parseOutpostManifest } from './outpost-manifest'

const valid = {
  schemaVersion: 1,
  batchKey: 'northwest-01',
  sourceRegister: 'docs/research/us-outpost-cohort-north.md',
  sourceVersion: '2026-08-13',
  reviewedAt: '2026-08-13',
  candidates: [{
    candidateKey: 'us-nw-id-idaho-city-christian-center',
    operation: 'new-listing',
    targetHubOutpostId: null,
    publicFacts: {
      church: 'Idaho City Christian Center', city: 'Idaho City', jurisdiction: 'Idaho',
      outpostNumber: null, campusSuffix: null, district: 'Southern Idaho District',
      region: 'Northwest Region', fcfTerritory: 'Trappers Territory',
      fcfActivityStatus: 'not-verified', programs: [],
    },
    fieldSources: {
      church: [{ url: 'https://example.org/rangers', label: 'Church Royal Rangers page', checkedAt: '2026-08-13', factKind: 'direct' }],
      city: [{ url: 'https://example.org/rangers', label: 'Church Royal Rangers page', checkedAt: '2026-08-13', factKind: 'direct' }],
      jurisdiction: [{ url: 'https://example.org/rangers', label: 'Church Royal Rangers page', checkedAt: '2026-08-13', factKind: 'direct' }],
      district: [{ url: 'https://royalrangers.com/map', label: 'Official map', checkedAt: '2026-08-13', factKind: 'derived', mappingSourceUrl: 'https://royalrangers.com/map' }],
      region: [{ url: 'https://royalrangers.com/map', label: 'Official map', checkedAt: '2026-08-13', factKind: 'derived', mappingSourceUrl: 'https://royalrangers.com/map' }],
      fcfTerritory: [{ url: 'https://royalrangers.com/territories', label: 'Official territory table', checkedAt: '2026-08-13', factKind: 'derived', mappingSourceUrl: 'https://royalrangers.com/territories' }],
    },
  }],
}

describe('source-backed U.S. Outpost manifest seam', () => {
  it('accepts bounded public facts with exact per-field evidence', () => {
    expect(parseOutpostManifest(valid).candidates).toHaveLength(1)
  })

  it('rejects prohibited/private fields and missing provenance before staging', () => {
    expect(() => parseOutpostManifest({
      ...valid,
      candidates: [{ ...valid.candidates[0], leaderName: 'Private Person', fieldSources: { church: valid.candidates[0].fieldSources.church } }],
    })).toThrow(/prohibited field|source evidence/i)
  })

  it('allows number reuse only when scoped district or campus differs', () => {
    const first = {
      ...valid.candidates[0],
      publicFacts: { ...valid.candidates[0].publicFacts, outpostNumber: '12' },
      fieldSources: { ...valid.candidates[0].fieldSources, outpostNumber: valid.candidates[0].fieldSources.church },
    }
    expect(() => parseOutpostManifest({
      ...valid,
      candidates: [first, { ...first, candidateKey: 'us-nw-id-other', publicFacts: { ...first.publicFacts, church: 'Other Church' } }],
    })).toThrow(/scoped number/i)
    expect(parseOutpostManifest({
      ...valid,
      candidates: [first, {
        ...first, candidateKey: 'us-nw-id-other',
        publicFacts: { ...first.publicFacts, church: 'Other Church', campusSuffix: 'North' },
        fieldSources: { ...first.fieldSources, campusSuffix: first.fieldSources.church },
      }],
    }).candidates).toHaveLength(2)
  })

  it('bounds source evidence to keep a D1 batch below its query ceiling', () => {
    const source = valid.candidates[0].fieldSources.church
    const candidates = Array.from({ length: 4 }, (_, index) => ({
      ...valid.candidates[0],
      candidateKey: `us-test-church-${index}`,
      publicFacts: { ...valid.candidates[0].publicFacts, outpostNumber: String(index + 1) },
      fieldSources: { ...valid.candidates[0].fieldSources, outpostNumber: source },
    }))
    expect(() => parseOutpostManifest({ ...valid, candidates })).toThrow('at most 24 source evidence rows')
  })

  it('produces a stable checksum independent of object key order', async () => {
    expect(await manifestChecksum(valid)).toBe(await manifestChecksum(JSON.parse(JSON.stringify(valid))))
    expect(await manifestChecksum(valid)).toMatch(/^[a-f0-9]{64}$/)
  })
})
