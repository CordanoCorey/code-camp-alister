import { usJurisdictions } from './us-directory'
import { isIsoCountryCode } from './countries'

export const ADULT_ACCOUNT_ATTESTATION_VERSION = 'ordinary-adult-v1'

export const claimedPositions = [
  'Parent/Guardian',
  'Adult Leader',
  'Outpost Coordinator',
  'Pastor',
  'Section/Division/Area Leader',
  'District Leader',
  'Regional Leader',
  'National Leader',
  'FCF Leader',
  'Other',
] as const

export type ClaimedPosition = (typeof claimedPositions)[number]
export type OnboardingPath = 'usa' | 'international'

export type ValidatedOrdinaryProfile = {
  displayName: string
  onboardingPath: OnboardingPath
  claimedPosition: ClaimedPosition
  claimedPositionOther: string | null
  currentOutpostId: string | null
  outpostClaim: string | null
  usaJurisdictionId: string | null
  countryCode: string | null
  internationalSubdivision: string | null
}

export type OrdinaryProfileDraft = {
  displayName: string
  onboardingPath: string
  claimedPosition: string
  claimedPositionOther: string
  currentOutpostId: string
  noCurrentOutpost: boolean
  outpostClaim: string
  usaJurisdictionId: string
  countryCode: string
  internationalSubdivision: string
}

export type OrdinaryAccountProfile = ValidatedOrdinaryProfile & {
  email: string
  emailVerified: true
  currentOutpost: {
    id: string
    title: string
    externalNumber: string | null
    city: string
    jurisdiction: string
    district: string | null
    region: string | null
    languageOverlay: string | null
    fcfTerritory: string | null
    fcfActivityStatus: string
  } | null
  adultEligibility: {
    confirmed: true
    confirmedAt: string
    attestationVersion: string
  }
  createdAt: string
  updatedAt: string
  version: number
}

const usaJurisdictionIds = new Set(usJurisdictions.map(({ abbreviation }) => `us-${abbreviation.toLowerCase()}`))

function containsControlCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
}

function boundedText(label: string, value: unknown, maximum: number, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null
  if (typeof value !== 'string') throw new Error(`${label} is required.`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum || containsControlCharacter(normalized)) {
    throw new Error(`${label} must be plain text between 1 and ${maximum} characters.`)
  }
  return normalized
}

export function validateAdultAccountEligibility(birthYearValue: unknown, attested: unknown, now = new Date()) {
  const birthYear = typeof birthYearValue === 'string' && /^\d{4}$/.test(birthYearValue)
    ? Number(birthYearValue)
    : Number.NaN
  const currentYear = now.getUTCFullYear()
  if (!Number.isInteger(birthYear) || birthYear < currentYear - 120 || birthYear >= currentYear - 18) {
    throw new Error('Adult accounts are currently available only when the Birth Year is compatible with being 18 or older.')
  }
  if (attested !== true) throw new Error('Confirm that you are at least 18 to continue.')
  return {
    confirmed: true as const,
    confirmedAt: now.toISOString(),
    attestationVersion: ADULT_ACCOUNT_ATTESTATION_VERSION,
  }
}

export function validateOrdinaryProfileInput(input: unknown): ValidatedOrdinaryProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Account details are required.')
  const value = input as Record<string, unknown>
  const onboardingPath = value.onboardingPath
  if (onboardingPath !== 'usa' && onboardingPath !== 'international') {
    throw new Error('Choose the USA or International onboarding path.')
  }
  if (!claimedPositions.includes(value.claimedPosition as ClaimedPosition)) {
    throw new Error('Choose an approved adult Claimed Position.')
  }
  const claimedPosition = value.claimedPosition as ClaimedPosition
  const claimedPositionOther = claimedPosition === 'Other'
    ? boundedText('Other position', value.claimedPositionOther, 80)
    : null
  const currentOutpostId = boundedText('Current Outpost', value.currentOutpostId, 100, true)
  const outpostClaim = currentOutpostId ? null : boundedText('Outpost association', value.outpostClaim, 120, true)

  if (onboardingPath === 'usa') {
    if (typeof value.usaJurisdictionId !== 'string' || !usaJurisdictionIds.has(value.usaJurisdictionId)) {
      throw new Error('Choose a verified USA state, District of Columbia, or populated territory.')
    }
    if (value.countryCode !== null && value.countryCode !== undefined && value.countryCode !== '') {
      throw new Error('USA account details cannot contain International country data.')
    }
    if (value.internationalSubdivision !== null && value.internationalSubdivision !== undefined && value.internationalSubdivision !== '') {
      throw new Error('USA account details cannot contain an International subdivision.')
    }
    return {
      displayName: boundedText('Display Name', value.displayName, 80) as string,
      onboardingPath,
      claimedPosition,
      claimedPositionOther,
      currentOutpostId,
      outpostClaim,
      usaJurisdictionId: value.usaJurisdictionId,
      countryCode: null,
      internationalSubdivision: null,
    }
  }

  const countryCode = typeof value.countryCode === 'string' ? value.countryCode.trim().toUpperCase() : ''
  if (!isIsoCountryCode(countryCode) || countryCode === 'US') {
    throw new Error('Choose a verified International country.')
  }
  if (value.usaJurisdictionId !== null && value.usaJurisdictionId !== undefined && value.usaJurisdictionId !== '') {
    throw new Error('International account details cannot contain a USA jurisdiction.')
  }
  return {
    displayName: boundedText('Display Name', value.displayName, 80) as string,
    onboardingPath,
    claimedPosition,
    claimedPositionOther,
    currentOutpostId,
    outpostClaim,
    usaJurisdictionId: null,
    countryCode,
    internationalSubdivision: boundedText('International subdivision', value.internationalSubdivision, 100, true),
  }
}

export function ordinaryProfileDraft(profile?: ValidatedOrdinaryProfile): OrdinaryProfileDraft {
  return {
    displayName: profile?.displayName ?? '',
    onboardingPath: profile?.onboardingPath ?? 'usa',
    claimedPosition: profile?.claimedPosition ?? 'Parent/Guardian',
    claimedPositionOther: profile?.claimedPositionOther ?? '',
    currentOutpostId: profile?.currentOutpostId ?? '',
    noCurrentOutpost: !profile?.currentOutpostId,
    outpostClaim: profile?.outpostClaim ?? '',
    usaJurisdictionId: profile?.usaJurisdictionId ?? '',
    countryCode: profile?.countryCode ?? '',
    internationalSubdivision: profile?.internationalSubdivision ?? '',
  }
}

export function validateOrdinaryProfileDraft(draft: OrdinaryProfileDraft) {
  return validateOrdinaryProfileInput({
    displayName: draft.displayName,
    onboardingPath: draft.onboardingPath,
    claimedPosition: draft.claimedPosition,
    claimedPositionOther: draft.claimedPositionOther,
    currentOutpostId: draft.noCurrentOutpost ? null : draft.currentOutpostId,
    outpostClaim: draft.noCurrentOutpost ? draft.outpostClaim : null,
    usaJurisdictionId: draft.onboardingPath === 'usa' ? draft.usaJurisdictionId : null,
    countryCode: draft.onboardingPath === 'international' ? draft.countryCode : null,
    internationalSubdivision: draft.onboardingPath === 'international'
      ? draft.internationalSubdivision
      : null,
  })
}
