export const calendarCategories = ['meeting', 'camp', 'service', 'training', 'ceremony', 'fundraiser', 'other'] as const
export const calendarStatuses = ['tentative', 'planned', 'confirmed', 'cancelled', 'completed'] as const

export type CalendarCategory = (typeof calendarCategories)[number]
export type CalendarStatus = (typeof calendarStatuses)[number]

export type CalendarEntryInput = {
  title: string
  description: string | null
  category: CalendarCategory
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  location: string | null
  status: Exclude<CalendarStatus, 'cancelled'>
  requestKey: string
}

function text(value: unknown, label: string, maximum: number, required = false) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new Error(`${label} is required.`)
    return null
  }
  if (typeof value !== 'string') throw new Error(`${label} must be text.`)
  const result = value.trim()
  if ((required && !result) || result.length > maximum) throw new Error(`${label} must be ${required ? `1-${maximum}` : `at most ${maximum}`} characters.`)
  return result || null
}

export function validateWorkspaceTimezone(value: unknown) {
  if (typeof value !== 'string' || value.length > 80 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value)) {
    throw new Error('Choose a valid IANA timezone such as America/New_York.')
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0))
  } catch {
    throw new Error('Choose a valid IANA timezone such as America/New_York.')
  }
  return value
}

function date(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a local date.`)
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a local date.`)
  return value
}

function time(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${label} must use 24-hour HH:MM format.`)
  return value
}

export function validateCalendarEntryInput(value: unknown): CalendarEntryInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Calendar entry must be an object.')
  const input = value as Record<string, unknown>
  const allowed = new Set(['title', 'description', 'category', 'startDate', 'endDate', 'startTime', 'endTime', 'allDay', 'location', 'status', 'requestKey'])
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error('Calendar entry contains an unsupported field.')
  const title = text(input.title, 'Title', 120, true) as string
  const description = text(input.description, 'Description', 1_000)
  const location = text(input.location, 'Location', 200)
  if (!calendarCategories.includes(input.category as CalendarCategory)) throw new Error('Choose a calendar category.')
  if (!calendarStatuses.slice(0, 3).concat('completed').includes(input.status as never)) throw new Error('Choose a group-plan status.')
  const startDate = date(input.startDate, 'Start date')
  const endDate = date(input.endDate, 'End date')
  const startTime = time(input.startTime, 'Start time')
  const endTime = time(input.endTime, 'End time')
  if (typeof input.allDay !== 'boolean') throw new Error('Choose whether this is an all-day plan.')
  if (endDate < startDate) throw new Error('The end date cannot precede the start date.')
  if (input.allDay && (startTime || endTime)) throw new Error('An all-day plan cannot include times.')
  if (!input.allDay && !startTime) throw new Error('A timed plan requires a start time.')
  if (!input.allDay && endDate === startDate && endTime && startTime && endTime <= startTime) throw new Error('The end must follow the start.')
  const requestKey = text(input.requestKey, 'Request key', 100, true) as string
  if (requestKey.length < 8) throw new Error('Request key is invalid.')
  return { title, description, category: input.category as CalendarCategory, startDate, endDate, startTime, endTime, allDay: input.allDay, location, status: input.status as CalendarEntryInput['status'], requestKey }
}
