import { describe, expect, it } from 'vitest'
import { parseInternationalManifest } from './international-outpost-manifest'

const source = { url: 'https://example.org/directory', label: 'Official directory', checkedAt: '2026-08-13' }
const valid = { schemaVersion: 1, batchKey: 'my-01', sourceRegister: 'docs/research/international-directory-slice-15.md', reviewedAt: '2026-08-13', coverage: { countryCode: 'MY', state: 'country-information-directory-incomplete', namedLocalEditors: null, sources: [source] }, candidates: [{ candidateKey: 'intl-my-example-one', countryCode: 'MY', countryName: 'Malaysia', nationalProgramId: 'rr-malaysia', nationalProgramName: 'Royal Rangers Malaysia', rriGrouping: 'Asia Pacific', localUnitLabel: 'Outpost', identifierRaw: 'Example#1', displayNameRaw: 'Example#1', civilSubdivision: null, city: null, streetAddress: null, contactUrl: null, affiliations: [], fcfAvailability: 'not-verified', activeFcf: null, fieldSources: { countryName: [source], nationalProgramName: [source], rriGrouping: [source], localUnitLabel: [source], identifierRaw: [source], displayNameRaw: [source] } }] }

describe('international manifest', () => {
  it('accepts country-scoped source-native candidates', () => expect(parseInternationalManifest(valid).candidates[0].identifierRaw).toBe('Example#1'))
  it.each([
    [{ ...valid, candidates: [{ ...valid.candidates[0], countryCode: 'DE' }] }, 'inconsistent country scope'],
    [{ ...valid, candidates: [{ ...valid.candidates[0], email: 'private@example.org' }] }, 'prohibited field'],
    [{ ...valid, candidates: [{ ...valid.candidates[0], privateNote: 'must not enter a manifest' }] }, 'unsupported field'],
    [{ ...valid, candidates: [{ ...valid.candidates[0], fieldSources: {} }] }, 'field-level provenance'],
    [{ ...valid, candidates: Array(5).fill(valid.candidates[0]).map((candidate, index) => ({ ...candidate, candidateKey: `intl-my-example-${index}` })) }, 'one to four'],
    [{ ...valid, candidates: [{ ...valid.candidates[0], activeFcf: true }] }, 'without verified availability'],
    [{ ...valid, reviewedAt: '2026-02-31' }, 'valid ISO date'],
  ])('rejects invalid manifests', (value, message) => expect(() => parseInternationalManifest(value)).toThrow(message))
})
