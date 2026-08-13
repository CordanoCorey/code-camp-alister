export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

export type CursorValue = string | number | null

export class CursorInputError extends Error {}

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

export function encodeCursor(values: CursorValue[]) {
  return toBase64Url(JSON.stringify({ version: 1, values }))
}

export function decodeCursor(cursor: string, expectedValues: number): CursorValue[] {
  if (!cursor || cursor.length > 1_024) throw new CursorInputError('The page cursor is invalid.')
  try {
    const parsed = JSON.parse(fromBase64Url(cursor)) as { version?: unknown; values?: unknown }
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.values) ||
      parsed.values.length !== expectedValues ||
      parsed.values.some((value) => value !== null && typeof value !== 'string' && typeof value !== 'number')
    ) {
      throw new CursorInputError('The page cursor is invalid.')
    }
    return parsed.values
  } catch (error) {
    if (error instanceof CursorInputError) throw error
    throw new CursorInputError('The page cursor is invalid.')
  }
}

export function readPageSize(search: URLSearchParams) {
  const requested = search.get('limit')
  if (requested === null || requested === '') return DEFAULT_PAGE_SIZE
  if (!/^\d+$/.test(requested) || Number(requested) < 1) {
    throw new CursorInputError('Page size must be a positive number.')
  }
  return Math.min(Number(requested), MAX_PAGE_SIZE)
}

export function pageFromRows<Row>(
  rows: Row[],
  limit: number,
  cursorValues: (row: Row) => CursorValue[],
) {
  const items = rows.slice(0, limit)
  const nextCursor = rows.length > limit && items.length > 0
    ? encodeCursor(cursorValues(items[items.length - 1]))
    : null
  return { items, nextCursor }
}
