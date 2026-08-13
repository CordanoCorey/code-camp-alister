import { programGroups, type ProgramGroup } from './domain.ts'

export const directorySubmissionTypes = ['new-listing', 'correction'] as const
export type DirectorySubmissionType = (typeof directorySubmissionTypes)[number]

export const fcfActivityStatuses = ['yes', 'no', 'not-verified'] as const
export type FcfActivityStatus = (typeof fcfActivityStatuses)[number]

export const listingLifecycleStates = [
  'unverified',
  'verified',
  'grace',
  'verification-expired',
  'archived',
] as const
export type ListingLifecycleState = (typeof listingLifecycleStates)[number]

export type DirectorySubmissionInput = {
  submissionType: DirectorySubmissionType
  targetOutpostId: string | null
  church: string
  outpostNumber: string | null
  campusSuffix: string | null
  streetAddress: string | null
  city: string
  jurisdiction: string
  postalCode: string | null
  district: string | null
  languageOverlay: string | null
  programs: ProgramGroup[]
  meeting: string | null
  sourceUrl: string
  fcfActivityStatus: FcfActivityStatus
  replyEmail: string
  notes: string | null
  privacyConfirmed: boolean
}

export type DirectorySubmissionErrors = Partial<Record<keyof DirectorySubmissionInput, string>>

type VerificationSchedule = {
  lastVerifiedAt: string
  warningStartsAt: string
  dueAt: string
  graceEndsAt: string
}

type JurisdictionType = 'state' | 'district' | 'territory'

export type UsJurisdiction = {
  name: string
  abbreviation: string
  type: JurisdictionType
  region: string | null
  fcfTerritory: string | null
}

const regions = {
  northwest: ['Northwest Region', 'Trappers Territory'],
  northCentral: ['North Central Region', 'Explorers Territory'],
  southwest: ['Southwest Region', 'Mountainmen Territory'],
  southCentral: ['South Central Region', 'Plainsmen Territory'],
  gulf: ['Gulf Region', 'Rivermen Territory'],
  southeast: ['Southeast Region', 'Riflemen Territory'],
  greatLakes: ['Great Lakes Region', 'Voyagers Territory'],
  northeast: ['Northeast Region', 'Colonials Territory'],
} as const

function jurisdiction(name: string, abbreviation: string, type: JurisdictionType, assignment: readonly [string, string] | null): UsJurisdiction {
  return { name, abbreviation, type, region: assignment?.[0] ?? null, fcfTerritory: assignment?.[1] ?? null }
}

export const usJurisdictions: UsJurisdiction[] = [
  jurisdiction('Alabama', 'AL', 'state', regions.southeast),
  jurisdiction('Alaska', 'AK', 'state', regions.northwest),
  jurisdiction('Arizona', 'AZ', 'state', regions.southwest),
  jurisdiction('Arkansas', 'AR', 'state', regions.gulf),
  jurisdiction('California', 'CA', 'state', regions.southwest),
  jurisdiction('Colorado', 'CO', 'state', regions.southwest),
  jurisdiction('Connecticut', 'CT', 'state', regions.northeast),
  jurisdiction('Delaware', 'DE', 'state', regions.northeast),
  jurisdiction('District of Columbia', 'DC', 'district', regions.northeast),
  jurisdiction('Florida', 'FL', 'state', regions.southeast),
  jurisdiction('Georgia', 'GA', 'state', regions.southeast),
  jurisdiction('Hawaii', 'HI', 'state', regions.southwest),
  jurisdiction('Idaho', 'ID', 'state', regions.northwest),
  jurisdiction('Illinois', 'IL', 'state', regions.greatLakes),
  jurisdiction('Indiana', 'IN', 'state', regions.greatLakes),
  jurisdiction('Iowa', 'IA', 'state', regions.northCentral),
  jurisdiction('Kansas', 'KS', 'state', regions.southCentral),
  jurisdiction('Kentucky', 'KY', 'state', regions.greatLakes),
  jurisdiction('Louisiana', 'LA', 'state', regions.gulf),
  jurisdiction('Maine', 'ME', 'state', regions.northeast),
  jurisdiction('Maryland', 'MD', 'state', regions.northeast),
  jurisdiction('Massachusetts', 'MA', 'state', regions.northeast),
  jurisdiction('Michigan', 'MI', 'state', regions.greatLakes),
  jurisdiction('Minnesota', 'MN', 'state', regions.northCentral),
  jurisdiction('Mississippi', 'MS', 'state', regions.gulf),
  jurisdiction('Missouri', 'MO', 'state', null),
  jurisdiction('Montana', 'MT', 'state', regions.northwest),
  jurisdiction('Nebraska', 'NE', 'state', regions.northCentral),
  jurisdiction('Nevada', 'NV', 'state', regions.southwest),
  jurisdiction('New Hampshire', 'NH', 'state', regions.northeast),
  jurisdiction('New Jersey', 'NJ', 'state', regions.northeast),
  jurisdiction('New Mexico', 'NM', 'state', regions.southCentral),
  jurisdiction('New York', 'NY', 'state', regions.northeast),
  jurisdiction('North Carolina', 'NC', 'state', regions.southeast),
  jurisdiction('North Dakota', 'ND', 'state', regions.northCentral),
  jurisdiction('Ohio', 'OH', 'state', regions.greatLakes),
  jurisdiction('Oklahoma', 'OK', 'state', regions.southCentral),
  jurisdiction('Oregon', 'OR', 'state', regions.northwest),
  jurisdiction('Pennsylvania', 'PA', 'state', regions.northeast),
  jurisdiction('Rhode Island', 'RI', 'state', regions.northeast),
  jurisdiction('South Carolina', 'SC', 'state', regions.southeast),
  jurisdiction('South Dakota', 'SD', 'state', regions.northCentral),
  jurisdiction('Tennessee', 'TN', 'state', regions.gulf),
  jurisdiction('Texas', 'TX', 'state', regions.southCentral),
  jurisdiction('Utah', 'UT', 'state', regions.southwest),
  jurisdiction('Vermont', 'VT', 'state', regions.northeast),
  jurisdiction('Virginia', 'VA', 'state', regions.northeast),
  jurisdiction('Washington', 'WA', 'state', regions.northwest),
  jurisdiction('West Virginia', 'WV', 'state', regions.northeast),
  jurisdiction('Wisconsin', 'WI', 'state', regions.northCentral),
  jurisdiction('Wyoming', 'WY', 'state', regions.northwest),
  jurisdiction('American Samoa', 'AS', 'territory', null),
  jurisdiction('Guam', 'GU', 'territory', null),
  jurisdiction('Northern Mariana Islands', 'MP', 'territory', null),
  jurisdiction('Puerto Rico', 'PR', 'territory', regions.southeast),
  jurisdiction('U.S. Virgin Islands', 'VI', 'territory', null),
]

function parsedDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Verification time must be a valid ISO date and time.')
  return date
}

function addCalendarYearsClamped(value: Date, years: number) {
  const result = new Date(value)
  const month = result.getUTCMonth()
  result.setUTCFullYear(result.getUTCFullYear() + years, month, 1)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), month + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(value.getUTCDate(), lastDay))
  return result
}

function addCalendarMonthsClamped(value: Date, months: number) {
  const result = new Date(value)
  const targetMonth = result.getUTCMonth() + months
  const targetYear = result.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  result.setUTCFullYear(targetYear, normalizedMonth, Math.min(value.getUTCDate(), lastDay))
  return result
}

function addCalendarDays(value: Date, days: number) {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function listingVerificationSchedule(verifiedAt: string): VerificationSchedule {
  const lastVerifiedAt = parsedDate(verifiedAt)
  const dueAt = addCalendarYearsClamped(lastVerifiedAt, 1)
  return {
    lastVerifiedAt: lastVerifiedAt.toISOString(),
    warningStartsAt: addCalendarMonthsClamped(dueAt, -2).toISOString(),
    dueAt: dueAt.toISOString(),
    graceEndsAt: addCalendarDays(dueAt, 30).toISOString(),
  }
}

export function evaluateListingVerification(schedule: VerificationSchedule, now: string): Exclude<ListingLifecycleState, 'unverified' | 'archived'> {
  const current = parsedDate(now).getTime()
  if (current < parsedDate(schedule.dueAt).getTime()) return 'verified'
  if (current <= parsedDate(schedule.graceEndsAt).getTime()) return 'grace'
  return 'verification-expired'
}

export function submissionRetentionDeadline(createdAt: string) {
  return addCalendarMonthsClamped(parsedDate(createdAt), 6).toISOString()
}

export function deriveUsDirectoryGeography(name: string) {
  const place = usJurisdictions.find((candidate) => candidate.name === name)
  return place ? { region: place.region, fcfTerritory: place.fcfTerritory, district: null } : null
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname)
  } catch {
    return false
  }
}

function exceeds(value: string | null, maximum: number) {
  return (value?.trim().length ?? 0) > maximum
}

export function validateDirectorySubmission(value: DirectorySubmissionInput): DirectorySubmissionErrors {
  const errors: DirectorySubmissionErrors = {}
  if (!directorySubmissionTypes.includes(value.submissionType)) errors.submissionType = 'Choose a new listing or correction.'
  if (value.submissionType === 'correction' && !value.targetOutpostId?.trim()) {
    errors.targetOutpostId = 'Choose the existing listing this correction concerns.'
  }
  if (!value.church.trim()) errors.church = 'Enter the public church or outpost name.'
  else if (exceeds(value.church, 160)) errors.church = 'Church or outpost name must be 160 characters or fewer.'
  if (!value.city.trim()) errors.city = 'Enter the city.'
  else if (exceeds(value.city, 100)) errors.city = 'City must be 100 characters or fewer.'
  if (!usJurisdictions.some((place) => place.name === value.jurisdiction)) errors.jurisdiction = 'Choose a state or U.S. territory.'
  if (!isHttpsUrl(value.sourceUrl)) errors.sourceUrl = 'Enter a complete public source URL that starts with https://.'
  else if (exceeds(value.sourceUrl, 500)) errors.sourceUrl = 'Source URL must be 500 characters or fewer.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.replyEmail.trim()) || exceeds(value.replyEmail, 254)) {
    errors.replyEmail = 'Enter an email address where the Operator can reply.'
  }
  if (!fcfActivityStatuses.includes(value.fcfActivityStatus)) errors.fcfActivityStatus = 'Choose Yes, No, or Not verified.'
  if (!Array.isArray(value.programs) || value.programs.some((program) => !programGroups.includes(program))) {
    errors.programs = 'Choose only listed Program Groups.'
  }
  for (const [field, maximum] of [
    ['targetOutpostId', 100], ['outpostNumber', 40], ['campusSuffix', 80], ['streetAddress', 200],
    ['postalCode', 20], ['district', 160], ['languageOverlay', 160], ['meeting', 500], ['notes', 1000],
  ] as const) {
    if (exceeds(value[field], maximum)) errors[field] = `This field must be ${maximum} characters or fewer.`
  }
  if (!value.privacyConfirmed) {
    errors.privacyConfirmed = 'Confirm that the proposal contains no youth, member, or personal leader data.'
  }
  return errors
}

function normalizedText(value: string | null) {
  return value?.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ') ?? ''
}

function normalizedUrl(value: string) {
  const url = new URL(value)
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  url.searchParams.sort()
  return url.toString()
}

export async function submissionFingerprint(value: DirectorySubmissionInput) {
  const identity = [
    value.submissionType,
    normalizedText(value.targetOutpostId),
    normalizedText(value.church),
    normalizedText(value.streetAddress),
    normalizedText(value.city),
    normalizedText(value.jurisdiction),
    normalizedText(value.district),
    normalizedText(value.outpostNumber),
    normalizedText(value.campusSuffix),
    normalizedUrl(value.sourceUrl),
  ].join('\u001f')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
