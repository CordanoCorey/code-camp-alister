import { describe, expect, it } from 'vitest'
import { consumeTransferTokenFragment, createTransferTokenCapture } from './transfer-fragment'

describe('transfer URL fragment handling', () => {
  it('returns the one-time token and clears the fragment without navigation', () => {
    const replacements: string[] = []
    const token = 'D'.repeat(43)
    const result = consumeTransferTokenFragment(
      { pathname: '/operator', search: '?ignored=public', hash: `#transfer=${token}` },
      (url) => replacements.push(url),
    )
    expect(result).toBe(token)
    expect(replacements).toEqual(['/operator?ignored=public'])
  })

  it('does not rewrite history for unrelated or query-string data', () => {
    const replacements: string[] = []
    expect(consumeTransferTokenFragment(
      { pathname: '/operator', search: `?transfer=${'E'.repeat(43)}`, hash: '' },
      (url) => replacements.push(url),
    )).toBeNull()
    expect(replacements).toEqual([])
  })

  it('clears a malformed transfer fragment without treating it as an acceptance token', () => {
    const replacements: string[] = []
    expect(consumeTransferTokenFragment(
      { pathname: '/operator', search: '', hash: '#transfer=truncated' },
      (url) => replacements.push(url),
    )).toBeNull()
    expect(replacements).toEqual(['/operator'])
  })

  it('retains the captured token when a StrictMode initializer runs twice after clearing the hash', () => {
    const capture = createTransferTokenCapture()
    const replacements: string[] = []
    const location = { pathname: '/operator', search: '', hash: `#transfer=${'S'.repeat(43)}` }
    expect(capture(location, (url) => { replacements.push(url); location.hash = '' })).toBe('S'.repeat(43))
    expect(capture(location, (url) => replacements.push(url))).toBe('S'.repeat(43))
    expect(replacements).toEqual(['/operator'])
  })
})
