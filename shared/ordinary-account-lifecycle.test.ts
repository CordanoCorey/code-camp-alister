import { describe, expect, it } from 'vitest'
import {
  ORDINARY_ACCESS_TERM_YEARS,
  ORDINARY_DELETION_DELAY_MONTHS,
  ORDINARY_NOTICE_WINDOW_MONTHS,
  deletionDueFromConfirmedWarning,
  deriveOrdinaryLifecycleState,
  initialOrdinaryAccessSchedule,
  ordinaryLifecycleAllows,
  renewedOrdinaryAccessSchedule,
} from './ordinary-account-lifecycle'

describe('ordinary Account lifecycle policy', () => {
  it('centralizes the one-year term, one-month notice, and six-month delivery-based deletion delay', () => {
    expect(ORDINARY_ACCESS_TERM_YEARS).toBe(1)
    expect(ORDINARY_NOTICE_WINDOW_MONTHS).toBe(1)
    expect(ORDINARY_DELETION_DELAY_MONTHS).toBe(6)
    expect(initialOrdinaryAccessSchedule('2024-02-29T14:15:16.123Z')).toEqual({
      accessDueAt: '2025-02-28T14:15:16.123Z',
      noticeOpenAt: '2025-01-28T14:15:16.123Z',
    })
  })

  it('clamps calendar arithmetic at month ends instead of approximating days', () => {
    expect(initialOrdinaryAccessSchedule('2023-01-31T23:59:59.999Z')).toEqual({
      accessDueAt: '2024-01-31T23:59:59.999Z',
      noticeOpenAt: '2023-12-31T23:59:59.999Z',
    })
    expect(deletionDueFromConfirmedWarning('2024-08-31T12:00:00.000Z'))
      .toBe('2025-02-28T12:00:00.000Z')
  })

  it('changes state at the exact notice and expiry instants', () => {
    const schedule = initialOrdinaryAccessSchedule('2026-08-13T12:00:00.000Z')
    expect(deriveOrdinaryLifecycleState(schedule, '2027-07-13T11:59:59.999Z')).toBe('active')
    expect(deriveOrdinaryLifecycleState(schedule, '2027-07-13T12:00:00.000Z')).toBe('renewal-notice')
    expect(deriveOrdinaryLifecycleState(schedule, '2027-08-13T11:59:59.999Z')).toBe('renewal-notice')
    expect(deriveOrdinaryLifecycleState(schedule, '2027-08-13T12:00:00.000Z')).toBe('expired')
  })

  it('renews only before expiry and extends from the existing due instant', () => {
    expect(renewedOrdinaryAccessSchedule(
      '2027-08-13T12:00:00.000Z',
      '2027-07-13T12:00:00.000Z',
    )).toEqual({
      accessDueAt: '2028-08-13T12:00:00.000Z',
      noticeOpenAt: '2028-07-13T12:00:00.000Z',
    })
    expect(() => renewedOrdinaryAccessSchedule(
      '2027-08-13T12:00:00.000Z',
      '2027-08-13T12:00:00.000Z',
    )).toThrow('expired')
  })

  it('keeps only lifecycle explanation, sign-out, and public browsing after expiry', () => {
    expect(ordinaryLifecycleAllows('renewal-notice', 'profile')).toBe(true)
    expect(ordinaryLifecycleAllows('renewal-notice', 'renew')).toBe(true)
    expect(ordinaryLifecycleAllows('expired', 'profile')).toBe(false)
    expect(ordinaryLifecycleAllows('expired', 'outpost-search')).toBe(false)
    expect(ordinaryLifecycleAllows('expired', 'renew')).toBe(false)
    expect(ordinaryLifecycleAllows('expired', 'lifecycle-status')).toBe(true)
    expect(ordinaryLifecycleAllows('expired', 'sign-out')).toBe(true)
    expect(ordinaryLifecycleAllows('expired', 'public')).toBe(true)
  })
})
