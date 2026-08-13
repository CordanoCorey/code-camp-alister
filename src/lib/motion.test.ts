import { describe, expect, it } from 'vitest'
import { preferredScrollBehavior } from './motion'

describe('reduced-motion navigation', () => {
  it('avoids animated scrolling when reduced motion is active', () => {
    expect(preferredScrollBehavior(true)).toBe('auto')
    expect(preferredScrollBehavior(false)).toBe('smooth')
  })
})
