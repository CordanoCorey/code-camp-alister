export const ADULT_ATTESTATION_VERSION = 'operator-adult-v1'
export const RECENT_AUTHENTICATION_SECONDS = 15 * 60

export type OperatorLifecycleState = 'active' | 'notice-due' | 'renewal-required'

function parseInstant(value: string) {
  const instant = new Date(value)
  if (Number.isNaN(instant.valueOf())) throw new Error('A valid UTC timestamp is required.')
  return instant
}

function shiftUtcCalendar(value: string, years: number, months: number) {
  const source = parseInstant(value)
  const firstOfTargetMonth = new Date(Date.UTC(
    source.getUTCFullYear() + years,
    source.getUTCMonth() + months,
    1,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  ))
  const lastDay = new Date(Date.UTC(
    firstOfTargetMonth.getUTCFullYear(),
    firstOfTargetMonth.getUTCMonth() + 1,
    0,
  )).getUTCDate()
  firstOfTargetMonth.setUTCDate(Math.min(source.getUTCDate(), lastDay))
  return firstOfTargetMonth.toISOString()
}

export function addCalendarYears(value: string, years: number) {
  if (!Number.isInteger(years)) throw new Error('Calendar years must be a whole number.')
  return shiftUtcCalendar(value, years, 0)
}

export function noticeOpensAt(dueAt: string) {
  return shiftUtcCalendar(dueAt, 0, -2)
}

export function lifecycleStateAt(dueAt: string, now: string): OperatorLifecycleState {
  const due = parseInstant(dueAt).valueOf()
  const current = parseInstant(now).valueOf()
  if (current >= due) return 'renewal-required'
  return current >= parseInstant(noticeOpensAt(dueAt)).valueOf() ? 'notice-due' : 'active'
}

export function nextRenewalDueAt(priorDueAt: string, confirmedAt: string) {
  const base = parseInstant(confirmedAt).valueOf() < parseInstant(priorDueAt).valueOf()
    ? priorDueAt
    : confirmedAt
  return addCalendarYears(base, 4)
}

export function validateAdultEligibility(value: unknown, attested: unknown, now = new Date()) {
  const birthYear = typeof value === 'string' && /^\d{4}$/.test(value)
    ? Number(value)
    : typeof value === 'number' && Number.isInteger(value)
      ? value
      : Number.NaN
  const currentYear = now.getUTCFullYear()
  // Birth Year has no month/day, so the immediately preceding 18th year is ambiguous.
  // Reject it conservatively rather than accepting someone who has not reached their birthday.
  if (!Number.isInteger(birthYear) || birthYear < currentYear - 120 || birthYear >= currentYear - 18) {
    throw new Error('Enter a Birth Year compatible with being 18 or older.')
  }
  if (attested !== true) {
    throw new Error('You must confirm that you are 18 or older.')
  }
  return { confirmed: true as const }
}

export function normalizeAccessEmail(value: unknown) {
  if (typeof value !== 'string') throw new Error('A verified email is required.')
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid verified email is required.')
  }
  return email
}

export function validateDisplayName(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Display Name is required.')
  const displayName = value.trim()
  if (displayName.length > 80) throw new Error('Display Name must be 80 characters or fewer.')
  return displayName
}

export function isRecentAuthentication(issuedAt: number, now: Date, maximumAgeSeconds = RECENT_AUTHENTICATION_SECONDS) {
  const ageSeconds = Math.floor(now.valueOf() / 1_000) - issuedAt
  return Number.isInteger(issuedAt) && ageSeconds >= 0 && ageSeconds <= maximumAgeSeconds
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function createAcceptanceToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashAcceptanceToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('The transfer acceptance token is invalid.')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function parseTransferTokenFragment(fragment: string) {
  if (!fragment.startsWith('#')) return null
  const token = new URLSearchParams(fragment.slice(1)).get('transfer')
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}
