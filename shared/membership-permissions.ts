export const outpostCapabilities = [
  'view-outpost-private',
  'review-outpost-membership',
  'manage-outpost-permissions',
  'edit-outpost-draft',
  'verify-outpost-facts',
  'publish-outpost-facts',
  'edit-scope-conflicts',
  'resolve-scope-conflicts',
] as const

export type OutpostCapability = (typeof outpostCapabilities)[number]
export type ExactScope = { type: 'outpost' | 'district' | 'region' | 'national' | 'international' | 'fcf' | 'country-defined'; id: string }
export type ActiveGrant = { capability: OutpostCapability; scope: ExactScope; endsAt: string | null }
export type VerifiedOperatorAuthority = { kind: 'verified-operator-authority'; action: 'bootstrap' | 'recovery'; auditEventId: string }
const outpostOnly = new Set<OutpostCapability>(['view-outpost-private','review-outpost-membership','manage-outpost-permissions','edit-outpost-draft','verify-outpost-facts','publish-outpost-facts'])
export function capabilitySupportsScope(capability: OutpostCapability, scope: ExactScope) {
  return !outpostOnly.has(capability) || scope.type === 'outpost'
}

export function sameExactScope(left: ExactScope, right: ExactScope) {
  return left.type === right.type && left.id === right.id
}

export function hasExactCapability(grants: ActiveGrant[], capability: OutpostCapability, scope: ExactScope, now: string) {
  return capabilitySupportsScope(capability, scope) && grants.some((grant) => grant.capability === capability
    && sameExactScope(grant.scope, scope)
    && (grant.endsAt === null || grant.endsAt > now))
}

export function mayDelegate(input: {
  issuerId: string
  recipientId: string
  issuerGrants: ActiveGrant[]
  capability: OutpostCapability
  scope: ExactScope
  now: string
  operatorAuthority?: VerifiedOperatorAuthority
}) {
  if (input.operatorAuthority?.auditEventId) return true
  if (input.issuerId === input.recipientId) return false
  return hasExactCapability(input.issuerGrants, 'manage-outpost-permissions', input.scope, input.now)
    && hasExactCapability(input.issuerGrants, input.capability, input.scope, input.now)
}

export function mayReviewMembership(input: {
  reviewerId: string
  applicantId: string
  grants: ActiveGrant[]
  outpostId: string
  now: string
  operatorAuthority?: VerifiedOperatorAuthority
}) {
  if (input.operatorAuthority?.auditEventId) return true
  return input.reviewerId !== input.applicantId && hasExactCapability(
    input.grants,
    'review-outpost-membership',
    { type: 'outpost', id: input.outpostId },
    input.now,
  )
}
