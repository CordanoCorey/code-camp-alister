import { describe, expect, it } from 'vitest'
import { capabilitySupportsScope, hasExactCapability, mayDelegate, mayReviewMembership, type ActiveGrant } from './membership-permissions'

const now = '2026-08-13T12:00:00.000Z'
const grant = (capability: ActiveGrant['capability'], type: ActiveGrant['scope']['type'], id: string): ActiveGrant => ({
  capability, scope: { type, id }, endsAt: null,
})

describe('exact-scope authority', () => {
  it('never inherits between ministry scopes or adjacent scope ids', () => {
    const grants = [grant('edit-outpost-draft', 'region', 'north'), grant('edit-outpost-draft', 'outpost', 'one')]
    expect(hasExactCapability(grants, 'edit-outpost-draft', { type: 'district', id: 'north-district' }, now)).toBe(false)
    expect(hasExactCapability(grants, 'edit-outpost-draft', { type: 'outpost', id: 'two' }, now)).toBe(false)
    expect(capabilitySupportsScope('edit-outpost-draft', { type: 'region', id: 'north' })).toBe(false)
  })

  it('rejects expiry, self-grant, privilege amplification, and cross-scope delegation', () => {
    const expired = { ...grant('edit-outpost-draft', 'outpost', 'one'), endsAt: now }
    expect(hasExactCapability([expired], 'edit-outpost-draft', { type: 'outpost', id: 'one' }, now)).toBe(false)
    const issuerGrants = [grant('manage-outpost-permissions', 'outpost', 'one'), grant('edit-outpost-draft', 'outpost', 'one')]
    expect(mayDelegate({ issuerId: 'a', recipientId: 'a', issuerGrants, capability: 'edit-outpost-draft', scope: { type: 'outpost', id: 'one' }, now })).toBe(false)
    expect(mayDelegate({ issuerId: 'a', recipientId: 'b', issuerGrants, capability: 'publish-outpost-facts', scope: { type: 'outpost', id: 'one' }, now })).toBe(false)
    expect(mayDelegate({ issuerId: 'a', recipientId: 'b', issuerGrants, capability: 'edit-outpost-draft', scope: { type: 'outpost', id: 'two' }, now })).toBe(false)
  })

  it('rejects self-approval and accepts only the exact review grant', () => {
    const grants = [grant('review-outpost-membership', 'outpost', 'one')]
    expect(mayReviewMembership({ reviewerId: 'a', applicantId: 'a', grants, outpostId: 'one', now })).toBe(false)
    expect(mayReviewMembership({ reviewerId: 'a', applicantId: 'b', grants, outpostId: 'two', now })).toBe(false)
    expect(mayReviewMembership({ reviewerId: 'a', applicantId: 'b', grants, outpostId: 'one', now })).toBe(true)
  })
})
