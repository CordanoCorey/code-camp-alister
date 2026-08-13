export const ORDINARY_ACCESS_TERM_YEARS = 1
export const ORDINARY_NOTICE_WINDOW_MONTHS = 1
export const ORDINARY_DELETION_DELAY_MONTHS = 6

export type OrdinaryLifecycleState = 'active' | 'renewal-notice' | 'expired'
export type OrdinaryLifecycleCapability =
  | 'profile'
  | 'outpost-search'
  | 'lifecycle-status'
  | 'renew'
  | 'sign-out'
  | 'public'

export type OrdinaryAccessSchedule = {
  accessDueAt: string
  noticeOpenAt: string
}

function exactDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== value) {
    throw new Error('Lifecycle time must be an exact UTC instant.')
  }
  return date
}

function addUtcCalendarMonths(value: string, months: number) {
  const date = exactDate(value)
  const targetMonth = date.getUTCMonth() + months
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(
    targetYear,
    normalizedMonth,
    Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  )).toISOString()
}

function scheduleFromDue(accessDueAt: string): OrdinaryAccessSchedule {
  return {
    accessDueAt,
    noticeOpenAt: addUtcCalendarMonths(accessDueAt, -ORDINARY_NOTICE_WINDOW_MONTHS),
  }
}

export function initialOrdinaryAccessSchedule(activatedAt: string) {
  return scheduleFromDue(addUtcCalendarMonths(activatedAt, ORDINARY_ACCESS_TERM_YEARS * 12))
}

export function deletionDueFromConfirmedWarning(confirmedDeliveryAt: string) {
  return addUtcCalendarMonths(confirmedDeliveryAt, ORDINARY_DELETION_DELAY_MONTHS)
}

export function deriveOrdinaryLifecycleState(
  schedule: OrdinaryAccessSchedule,
  now: string,
): OrdinaryLifecycleState {
  const clock = exactDate(now).valueOf()
  if (clock >= exactDate(schedule.accessDueAt).valueOf()) return 'expired'
  if (clock >= exactDate(schedule.noticeOpenAt).valueOf()) return 'renewal-notice'
  return 'active'
}

export function renewedOrdinaryAccessSchedule(accessDueAt: string, renewedAt: string) {
  if (exactDate(renewedAt).valueOf() >= exactDate(accessDueAt).valueOf()) {
    throw new Error('An expired Account cannot be renewed.')
  }
  return scheduleFromDue(addUtcCalendarMonths(accessDueAt, ORDINARY_ACCESS_TERM_YEARS * 12))
}

export function ordinaryLifecycleAllows(
  state: OrdinaryLifecycleState,
  capability: OrdinaryLifecycleCapability,
) {
  if (state !== 'expired') return true
  return capability === 'lifecycle-status' || capability === 'sign-out' || capability === 'public'
}
