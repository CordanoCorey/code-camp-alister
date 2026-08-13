import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPublicBootstrap } from './client'

const bootstrap = {
  navigation: [],
  featuredRecords: [],
  counts: {
    outpost: 0,
    event: 0,
    advancement: 0,
    organization: 0,
    page: 0,
  },
  generatedAt: '2026-08-12T00:00:00.000Z',
}

describe('fetchPublicBootstrap', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries once when the local server is temporarily unavailable', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not ready' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrap), { status: 200 }))

    const result = expect(fetchPublicBootstrap()).resolves.toMatchObject({ data: bootstrap })
    await vi.advanceTimersByTimeAsync(300)

    await result
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
