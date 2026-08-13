import { describe, expect, it } from 'vitest'
import {
  formatOutpostSubmission,
  submissionMailto,
  validateOutpostSubmission,
  type OutpostSubmission,
} from './outpostSubmission'

const valid: OutpostSubmission = {
  submissionType: 'new-listing',
  targetOutpostId: null,
  church: 'Community Church',
  outpostNumber: '12',
  campusSuffix: null,
  streetAddress: null,
  city: 'Springfield',
  jurisdiction: 'Missouri',
  postalCode: null,
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

describe('Add Your Outpost submission', () => {
  it('requires public identity, location, an HTTPS source, and a reply email', () => {
    expect(validateOutpostSubmission(valid)).toEqual({})
    expect(validateOutpostSubmission({
      ...valid,
      church: '',
      city: '',
      jurisdiction: '',
      sourceUrl: 'http://example.org',
      replyEmail: 'not-an-email',
      privacyConfirmed: false,
    })).toEqual({
      church: 'Enter the public church or outpost name.',
      city: 'Enter the city.',
      jurisdiction: 'Choose a state or U.S. territory.',
      sourceUrl: 'Enter a complete public source URL that starts with https://.',
      replyEmail: 'Enter an email address where the Operator can reply.',
      privacyConfirmed: 'Confirm that the proposal contains no youth, member, or personal leader data.',
    })
  })

  it('formats a complete copyable email without inventing missing facts', () => {
    const result = formatOutpostSubmission({ ...valid, outpostNumber: '', programs: [] })
    expect(result.copyText).toContain('Outpost number: Not provided')
    expect(result.copyText).toContain('Program Groups: Not provided')
    expect(result.copyText).toContain('not an official charter')
  })

  it('builds an encoded mail draft for a configured recipient', () => {
    expect(submissionMailto('help@example.org', 'Directory submission', 'Line one\nLine two'))
      .toBe('mailto:help%40example.org?subject=Directory%20submission&body=Line%20one%0ALine%20two')
  })
})
