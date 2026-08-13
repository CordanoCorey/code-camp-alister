import { describe, expect, it } from 'vitest'
import {
  deriveUsDirectoryGeography,
  evaluateListingVerification,
  listingVerificationSchedule,
  submissionFingerprint,
  validateDirectorySubmission,
  type DirectorySubmissionInput,
} from './us-directory'

const validSubmission: DirectorySubmissionInput = {
  submissionType: 'new-listing',
  targetOutpostId: null,
  church: 'Community Church',
  outpostNumber: '12',
  campusSuffix: null,
  streetAddress: '100 Main Street',
  city: 'Springfield',
  jurisdiction: 'Missouri',
  postalCode: '65802',
  district: null,
  languageOverlay: null,
  programs: ['Ranger Kids'],
  meeting: 'Wednesdays at 6:30 p.m.',
  sourceUrl: 'https://example.org/rangers',
  fcfActivityStatus: 'not-verified',
  replyEmail: 'submitter@example.org',
  notes: null,
  privacyConfirmed: true,
}

describe('U.S. directory operations domain seam', () => {
  it('uses calendar years and a 30-day grace period, including leap-day clamping', () => {
    expect(listingVerificationSchedule('2024-02-29T15:30:00.000Z')).toEqual({
      lastVerifiedAt: '2024-02-29T15:30:00.000Z',
      warningStartsAt: '2024-12-28T15:30:00.000Z',
      dueAt: '2025-02-28T15:30:00.000Z',
      graceEndsAt: '2025-03-30T15:30:00.000Z',
    })

    const schedule = listingVerificationSchedule('2026-01-31T00:00:00.000Z')
    expect(evaluateListingVerification(schedule, '2027-01-30T23:59:59.999Z')).toBe('verified')
    expect(evaluateListingVerification(schedule, '2027-01-31T00:00:00.000Z')).toBe('grace')
    expect(evaluateListingVerification(schedule, '2027-03-02T00:00:00.000Z')).toBe('grace')
    expect(evaluateListingVerification(schedule, '2027-03-02T00:00:00.001Z')).toBe('verification-expired')
  })

  it('derives only maintained region and FCF territory mappings', () => {
    expect(deriveUsDirectoryGeography('Texas')).toEqual({
      region: 'South Central Region',
      fcfTerritory: 'Plainsmen Territory',
      district: null,
    })
    expect(deriveUsDirectoryGeography('Missouri')).toEqual({ region: null, fcfTerritory: null, district: null })
    expect(deriveUsDirectoryGeography('Not a jurisdiction')).toBeNull()
  })

  it('validates bounded public facts without treating FCF territory as activity', () => {
    expect(validateDirectorySubmission(validSubmission)).toEqual({})
    expect(validateDirectorySubmission({
      ...validSubmission,
      submissionType: 'correction',
      targetOutpostId: null,
      sourceUrl: 'http://example.org/rangers',
      replyEmail: 'invalid',
      privacyConfirmed: false,
      fcfActivityStatus: 'yes',
    })).toEqual({
      targetOutpostId: 'Choose the existing listing this correction concerns.',
      sourceUrl: 'Enter a complete public source URL that starts with https://.',
      replyEmail: 'Enter an email address where the Operator can reply.',
      privacyConfirmed: 'Confirm that the proposal contains no youth, member, or personal leader data.',
    })
  })

  it('matches exact duplicate proposals but scopes reused numbers by district and campus', async () => {
    const base = await submissionFingerprint(validSubmission)
    expect(await submissionFingerprint({ ...validSubmission, church: '  COMMUNITY   CHURCH ' })).toBe(base)
    expect(await submissionFingerprint({ ...validSubmission, district: 'North Texas District' })).not.toBe(base)
    expect(await submissionFingerprint({ ...validSubmission, campusSuffix: 'North' })).not.toBe(base)
    expect(await submissionFingerprint({ ...validSubmission, outpostNumber: '12', jurisdiction: 'Texas' })).not.toBe(base)
  })
})
