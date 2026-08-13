import { describe, expect, it } from 'vitest'
import { assetPathsFromShell, canCacheResponse, classifyRequest, markOfflineResponse } from '../public/sw-policy.js'

const origin = 'https://hub.example'
const classify = (path, overrides = {}) => classifyRequest({
  url: `${origin}${path}`,
  method: 'GET',
  mode: 'same-origin',
  destination: '',
  ...overrides,
}, origin)

describe('service-worker cache policy', () => {
  it('finds only hashed production assets when seeding the first-load shell', () => {
    expect(assetPathsFromShell(`
      <script type="module" src="/assets/index-a1B_2.js"></script>
      <link rel="stylesheet" href="/assets/index-c3D.css">
      <script src="/unhashed.js"></script>
      <img src="https://other.example/assets/private-a1.png">
    `)).toEqual(['/assets/index-a1B_2.js', '/assets/index-c3D.css'])
  })

  it('allows only the public-data response, public app shell, and public immutable assets', () => {
    expect(classify('/api/public')).toBe('public-data')
    expect(classify('/api/public/outposts?limit=20')).toBe('public-data')
    expect(classify('/api/search?q=camp')).toBe('public-data')
    expect(classify('/events', { mode: 'navigate', destination: 'document' })).toBe('app-shell')
    expect(classify('/assets/index-DOPxvU6L.js', { destination: 'script' })).toBe('immutable-asset')
    expect(classify('/manifest.webmanifest')).toBe('core-asset')
  })

  it('explicitly excludes Operator, other APIs, cross-origin, and mutation requests', () => {
    expect(classify('/operator', { mode: 'navigate', destination: 'document' })).toBe('ignore')
    expect(classify('/operator/records', { mode: 'navigate', destination: 'document' })).toBe('ignore')
    expect(classify('/api/operator/snapshot')).toBe('ignore')
    expect(classify('/api/operator/account/status')).toBe('ignore')
    expect(classify('/api/operator/automation')).toBe('ignore')
    expect(classify('/api/health')).toBe('ignore')
    expect(classify('/api/auth/get-session')).toBe('ignore')
    expect(classify('/api/account/profile')).toBe('ignore')
    expect(classify('/signup', { mode: 'navigate', destination: 'document' })).toBe('ignore')
    expect(classify('/sign-in', { mode: 'navigate', destination: 'document' })).toBe('ignore')
    expect(classify('/account', { mode: 'navigate', destination: 'document' })).toBe('ignore')
    expect(classify('/reset-password?token=sensitive', { mode: 'navigate', destination: 'document' })).toBe('ignore')
    expect(classify('/api/private')).toBe('ignore')
    expect(classify('/api/public/outpost-submissions/config')).toBe('ignore')
    expect(classify('/api/public/outpost-submissions')).toBe('ignore')
    expect(classify('/api/public', { method: 'POST' })).toBe('ignore')
    expect(classifyRequest({ url: 'https://other.example/assets/app-a1.js', method: 'GET', mode: 'cors', destination: 'script' }, origin)).toBe('ignore')
  })

  it('never caches errors or responses marked private or no-store', () => {
    expect(canCacheResponse(new Response('ok'))).toBe(true)
    expect(canCacheResponse(new Response('error', { status: 500 }))).toBe(false)
    expect(canCacheResponse(new Response('private', { headers: { 'cache-control': 'private' } }))).toBe(false)
    expect(canCacheResponse(new Response('secret', { headers: { 'cache-control': 'no-store' } }))).toBe(false)
  })

  it('marks a cached public bundle offline without changing its generated or verification dates', async () => {
    const cached = Response.json({
      generatedAt: '2026-08-12T15:00:00.000Z',
      records: [{ id: 'public-1', verifiedAt: '2026-08-10T00:00:00.000Z' }],
    }, { headers: { 'cache-control': 'public, max-age=60' } })

    const offline = markOfflineResponse(cached)
    expect(offline.headers.get('x-ranger-data-source')).toBe('cache')
    expect(await offline.json()).toEqual({
      generatedAt: '2026-08-12T15:00:00.000Z',
      records: [{ id: 'public-1', verifiedAt: '2026-08-10T00:00:00.000Z' }],
    })
  })
})
