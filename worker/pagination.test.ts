import { describe, expect, it } from 'vitest'
import {
  CursorInputError,
  decodeCursor,
  encodeCursor,
  pageFromRows,
  readPageSize,
} from './pagination'

describe('bounded cursor pagination', () => {
  it('round-trips deterministic typed cursor values without exposing query text', () => {
    const cursor = encodeCursor(['Victory Assembly', 'outpost-stx-173', 7])

    expect(cursor).not.toContain('Victory Assembly')
    expect(decodeCursor(cursor, 3)).toEqual(['Victory Assembly', 'outpost-stx-173', 7])
  })

  it('rejects malformed, wrong-version, and wrong-shape cursors plainly', () => {
    expect(() => decodeCursor('not-base64', 2)).toThrow(CursorInputError)
    expect(() => decodeCursor(encodeCursor(['only-one']), 2)).toThrow('The page cursor is invalid.')
  })

  it('uses a conservative default and never exceeds the server maximum', () => {
    expect(readPageSize(new URLSearchParams())).toBe(20)
    expect(readPageSize(new URLSearchParams('limit=5'))).toBe(5)
    expect(readPageSize(new URLSearchParams('limit=5000'))).toBe(50)
    expect(() => readPageSize(new URLSearchParams('limit=zero'))).toThrow('Page size must be a positive number.')
  })

  it('uses the extra row only to create the next cursor', () => {
    const first = pageFromRows(
      [
        { id: 'a', title: 'Alpha' },
        { id: 'b', title: 'Bravo' },
        { id: 'c', title: 'Charlie' },
      ],
      2,
      (row) => [row.title, row.id],
    )

    expect(first.items.map((row) => row.id)).toEqual(['a', 'b'])
    expect(decodeCursor(first.nextCursor!, 2)).toEqual(['Bravo', 'b'])
    expect(pageFromRows([{ id: 'c', title: 'Charlie' }], 2, (row) => [row.title, row.id])).toEqual({
      items: [{ id: 'c', title: 'Charlie' }],
      nextCursor: null,
    })
  })
})
