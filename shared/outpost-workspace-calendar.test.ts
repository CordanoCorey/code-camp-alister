import { describe, expect, it } from 'vitest'
import { validateCalendarEntryInput, validateWorkspaceTimezone } from './outpost-workspace-calendar'

describe('Outpost Workspace calendar domain', () => {
  it('accepts an explicit IANA timezone and rejects invented or fixed-offset zones', () => {
    expect(validateWorkspaceTimezone('America/New_York')).toBe('America/New_York')
    expect(() => validateWorkspaceTimezone('EST')).toThrow('IANA')
    expect(() => validateWorkspaceTimezone('Mars/Olympus')).toThrow('IANA')
  })

  it('accepts a bounded all-day group plan without individual data', () => {
    expect(validateCalendarEntryInput({
      title: 'Monthly meeting', description: 'General program planning', category: 'meeting',
      startDate: '2026-09-10', endDate: '2026-09-10', startTime: null, endTime: null,
      allDay: true, location: 'Fellowship hall', status: 'planned', requestKey: 'request-12345678',
    })).toMatchObject({ title: 'Monthly meeting', allDay: true, status: 'planned' })
  })

  it('rejects reversed ranges and inconsistent all-day times', () => {
    expect(() => validateCalendarEntryInput({ title: 'Camp', category: 'camp', startDate: '2026-09-12', endDate: '2026-09-10', allDay: true, status: 'planned', requestKey: 'request-12345678' })).toThrow('end')
    expect(() => validateCalendarEntryInput({ title: 'Meeting', category: 'meeting', startDate: '2026-09-10', endDate: '2026-09-10', startTime: '19:00', allDay: true, status: 'planned', requestKey: 'request-12345678' })).toThrow('all-day')
    expect(() => validateCalendarEntryInput({ title: 'Meeting', category: 'meeting', startDate: '2026-09-10', endDate: '2026-09-10', startTime: '20:00', endTime: '19:00', allDay: false, status: 'planned', requestKey: 'request-12345678' })).toThrow('end')
  })

  it('rejects fields that could turn the group calendar into attendance or a roster', () => {
    expect(() => validateCalendarEntryInput({ title: 'Meeting', category: 'meeting', startDate: '2026-09-10', endDate: '2026-09-10', allDay: true, status: 'planned', attendees: ['Alex'], requestKey: 'request-12345678' })).toThrow('field')
  })
})
