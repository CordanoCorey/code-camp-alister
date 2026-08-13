import { describe, expect, it } from 'vitest'
import {
  ADULT_ACCOUNT_ATTESTATION_VERSION,
  claimedPositions,
  ordinaryProfileDraft,
  validateAdultAccountEligibility,
  validateOrdinaryProfileDraft,
  validateOrdinaryProfileInput,
} from './account'

describe('ordinary adult account eligibility', () => {
  const now = new Date('2026-08-13T12:00:00.000Z')

  it('accepts the conservative year-only adult boundary without retaining Birth Year', () => {
    expect(validateAdultAccountEligibility('2007', true, now)).toEqual({
      confirmed: true,
      confirmedAt: now.toISOString(),
      attestationVersion: ADULT_ACCOUNT_ATTESTATION_VERSION,
    })
  })

  it.each([
    ['2008', true],
    ['not-a-year', true],
    ['1890', true],
    ['2000', false],
  ])('rejects an ineligible, implausible, invalid, or unattested request', (birthYear, attested) => {
    expect(() => validateAdultAccountEligibility(birthYear, attested, now)).toThrow()
  })
})

describe('ordinary account profile input', () => {
  const common = {
    displayName: 'Alex',
    claimedPosition: claimedPositions[1],
    claimedPositionOther: null,
    currentOutpostId: null,
    outpostClaim: 'Outpost 12 at Example Church',
  }

  it('validates a USA claim only with a verified USA jurisdiction identity', () => {
    expect(validateOrdinaryProfileInput({
      ...common,
      onboardingPath: 'usa',
      usaJurisdictionId: 'us-va',
      countryCode: null,
      internationalSubdivision: null,
    })).toMatchObject({
      onboardingPath: 'usa',
      usaJurisdictionId: 'us-va',
      countryCode: null,
      internationalSubdivision: null,
    })
  })

  it('validates an International claim without requiring USA structure', () => {
    expect(validateOrdinaryProfileInput({
      ...common,
      onboardingPath: 'international',
      usaJurisdictionId: null,
      countryCode: 'CA',
      internationalSubdivision: 'Ontario',
    })).toMatchObject({
      onboardingPath: 'international',
      usaJurisdictionId: null,
      countryCode: 'CA',
      internationalSubdivision: 'Ontario',
    })
  })

  it('rejects an unassigned country code and normalizes a raw profile draft', () => {
    expect(() => validateOrdinaryProfileInput({
      ...common,
      onboardingPath: 'international',
      usaJurisdictionId: null,
      countryCode: 'ZZ',
      internationalSubdivision: null,
    })).toThrow('verified International country')

    expect(validateOrdinaryProfileDraft({
      ...ordinaryProfileDraft(),
      displayName: ' Alex ',
      onboardingPath: 'international',
      claimedPosition: 'Adult Leader',
      countryCode: ' ca ',
      noCurrentOutpost: true,
      outpostClaim: ' Example Church ',
    })).toMatchObject({
      displayName: 'Alex',
      countryCode: 'CA',
      outpostClaim: 'Example Church',
    })
  })

  it('rejects path crossover, youth/operator positions, and an unbounded Other label', () => {
    expect(() => validateOrdinaryProfileInput({
      ...common,
      onboardingPath: 'usa',
      usaJurisdictionId: null,
      countryCode: 'CA',
      internationalSubdivision: null,
    })).toThrow('USA')
    expect(() => validateOrdinaryProfileInput({
      ...common,
      onboardingPath: 'international',
      claimedPosition: 'Ranger/Boy',
      usaJurisdictionId: null,
      countryCode: 'CA',
      internationalSubdivision: null,
    })).toThrow('Claimed Position')
    expect(() => validateOrdinaryProfileInput({
      ...common,
      onboardingPath: 'international',
      claimedPosition: 'Other',
      claimedPositionOther: 'x'.repeat(81),
      usaJurisdictionId: null,
      countryCode: 'CA',
      internationalSubdivision: null,
    })).toThrow('Other')
  })
})
