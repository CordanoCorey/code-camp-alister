import { describe, expect, it } from 'vitest'
import {
  addCalendarYears,
  createAcceptanceToken,
  lifecycleStateAt,
  nextRenewalDueAt,
  normalizeAccessEmail,
  noticeOpensAt,
  parseTransferTokenFragment,
  validateAdultEligibility,
} from './operator-lifecycle'

describe('Operator lifecycle calendar rules', () => {
  it('uses calendar years and clamps a leap-day term when the target year is not a leap year', () => {
    expect(addCalendarYears('2096-02-29T15:30:00.000Z', 4)).toBe('2100-02-28T15:30:00.000Z')
  })

  it('opens notice exactly two calendar months before the due instant at month end', () => {
    expect(noticeOpensAt('2027-04-30T12:00:00.000Z')).toBe('2027-02-28T12:00:00.000Z')
    expect(lifecycleStateAt('2027-04-30T12:00:00.000Z', '2027-02-28T11:59:59.999Z')).toBe('active')
    expect(lifecycleStateAt('2027-04-30T12:00:00.000Z', '2027-02-28T12:00:00.000Z')).toBe('notice-due')
    expect(lifecycleStateAt('2027-04-30T12:00:00.000Z', '2027-04-30T12:00:00.000Z')).toBe('renewal-required')
  })

  it('extends an early renewal from the existing due date and an expired renewal from confirmation', () => {
    expect(nextRenewalDueAt('2030-08-13T09:00:00.000Z', '2030-06-01T09:00:00.000Z'))
      .toBe('2034-08-13T09:00:00.000Z')
    expect(nextRenewalDueAt('2030-08-13T09:00:00.000Z', '2030-09-01T10:30:00.000Z'))
      .toBe('2034-09-01T10:30:00.000Z')
  })
})

describe('Operator eligibility and transfer inputs', () => {
  it('accepts only an adult-compatible birth year with the explicit attestation', () => {
    const now = new Date('2026-08-13T00:00:00.000Z')
    expect(validateAdultEligibility('2007', true, now)).toEqual({ confirmed: true })
    expect(() => validateAdultEligibility('2008', true, now)).toThrow('Birth Year')
    expect(() => validateAdultEligibility('2000', false, now)).toThrow('confirm')
  })

  it('normalizes a verified Access email without accepting malformed identity text', () => {
    expect(normalizeAccessEmail(' Founder@Example.ORG ')).toBe('founder@example.org')
    expect(() => normalizeAccessEmail('not-an-email')).toThrow('verified email')
  })

  it('creates a strong fragment-safe token and reads only the transfer fragment key', () => {
    const token = createAcceptanceToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(parseTransferTokenFragment(`#transfer=${token}`)).toBe(token)
    expect(parseTransferTokenFragment(`?transfer=${token}`)).toBeNull()
    expect(parseTransferTokenFragment('#other=value')).toBeNull()
  })
})
