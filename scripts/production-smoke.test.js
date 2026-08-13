import { describe, expect, it, vi } from 'vitest'
import { runProductionSmoke } from './production-smoke.mjs'

const generatedAt = '2026-08-12T00:00:00.000Z'
const securityHeaders = {
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'permissions-policy': 'camera=(), microphone=() ',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}
const publicCacheHeaders = { ...securityHeaders, 'cache-control': 'public, max-age=60' }

function record(kind, slug = `${kind}-record`) {
  return {
    id: `${kind}-1`,
    kind,
    slug,
    title: `Published ${kind}`,
    summary: 'Public summary',
    status: 'published',
    details: {},
    verifiedAt: generatedAt,
    publishedAt: generatedAt,
    updatedAt: generatedAt,
    sources: [{
      id: `${kind}-source`,
      fieldName: 'title',
      label: 'Public source',
      url: 'https://source.example/public',
      verifiedAt: generatedAt,
    }],
  }
}

function successfulProduction({ leakPrivateField = false } = {}) {
  const requests = []
  const byPath = {
    '/api/public/outposts': record('outpost'),
    '/api/public/advancement': record('advancement'),
    '/api/public/events': record('event'),
    '/api/public/organizations': record('organization'),
    '/api/public/pages': record('page'),
  }
  const fetch = vi.fn(async (input, init = {}) => {
    const url = new URL(input)
    requests.push({ url, init })

    if (url.pathname === '/operator' || url.pathname === '/operator/records' || url.pathname === '/api/operator/snapshot' || url.pathname === '/api/operator/account/status') {
      return Response.json({ error: 'Operator authorization required.' }, {
        status: 401,
        headers: { ...securityHeaders, 'cache-control': 'no-store' },
      })
    }
    if (url.pathname === '/api/not-a-real-route') {
      return Response.json({ error: 'Not found.' }, {
        status: 404,
        headers: { ...securityHeaders, 'cache-control': 'no-store' },
      })
    }
    if (url.pathname === '/api/public/outposts' && url.searchParams.get('cursor') === 'not-a-cursor') {
      return Response.json({ error: 'The page cursor is invalid.' }, {
        status: 400,
        headers: { ...securityHeaders, 'cache-control': 'no-store' },
      })
    }
    if (url.pathname === '/api/health') {
      if (init.method === 'HEAD') {
        return new Response(null, { headers: { ...securityHeaders, 'cache-control': 'no-store', 'content-type': 'application/json' } })
      }
      return Response.json({ status: 'ok', schema: '0009' }, {
        headers: { ...securityHeaders, 'cache-control': 'no-store' },
      })
    }
    if (url.pathname === '/api/public/outpost-submissions/config') {
      return Response.json({ enabled: false, districts: [], languageOverlays: [] }, {
        headers: { ...securityHeaders, 'cache-control': 'no-store' },
      })
    }
    if (url.pathname === '/api/public') {
      return Response.json({
        navigation: [record('page')],
        featuredRecords: [{ ...record('event'), ...(leakPrivateField ? { actor: 'operator@example.org' } : {}) }],
        counts: { outpost: 1, event: 1, advancement: 1, organization: 1, page: 1 },
        generatedAt,
      }, { headers: publicCacheHeaders })
    }
    if (url.pathname === '/api/search') {
      return Response.json({ records: [record('page')], nextCursor: null, generatedAt }, { headers: publicCacheHeaders })
    }
    if (url.pathname === '/api/public/records/outpost-record') {
      return Response.json({ record: record('outpost') }, { headers: publicCacheHeaders })
    }
    if (byPath[url.pathname]) {
      return Response.json({ records: [byPath[url.pathname]], nextCursor: null, generatedAt }, { headers: publicCacheHeaders })
    }
    if (url.pathname === '/manifest.webmanifest') {
      return Response.json({
        name: 'Ranger Outpost Hub',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        icons: [
          { src: '/ranger-hub-mark-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/ranger-hub-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }, { headers: securityHeaders })
    }
    if (url.pathname.endsWith('.png')) {
      return new Response('png', { headers: { ...securityHeaders, 'content-type': 'image/png' } })
    }
    if (url.pathname === '/sw.js' || url.pathname.endsWith('.js')) {
      return new Response('export {}', { headers: { ...securityHeaders, 'content-type': 'text/javascript' } })
    }
    if (url.pathname.endsWith('.css')) {
      return new Response('body{}', { headers: { ...securityHeaders, 'content-type': 'text/css' } })
    }

    return new Response(`<!doctype html><html><head>
      <link rel="stylesheet" href="/assets/index-a1.css">
      <link rel="manifest" href="/manifest.webmanifest">
      </head><body><div id="root"></div><script type="module" src="/assets/index-b2.js"></script></body></html>`, {
      headers: { ...securityHeaders, 'content-type': 'text/html; charset=utf-8' },
    })
  })
  return { fetch, requests }
}

describe('production smoke command', () => {
  it('refuses a non-HTTPS target before sending a request', async () => {
    const fetch = vi.fn()

    await expect(runProductionSmoke('http://hub.example', { fetch })).rejects.toThrow(
      'Production smoke requires an HTTPS base URL.',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('performs the complete credential-free read-only production contract', async () => {
    const production = successfulProduction()

    const result = await runProductionSmoke('https://hub.example/', { fetch: production.fetch })
    const paths = production.requests.map(({ url }) => `${url.pathname}${url.search}`)

    expect(result.baseUrl).toBe('https://hub.example')
    expect(result.checks.length).toBeGreaterThan(20)
    expect(paths).toEqual(expect.arrayContaining([
      '/',
      '/outposts',
      '/advancement',
      '/events',
      '/about',
      '/other',
      '/help',
      '/search',
      '/add-your-outpost',
      '/manifest.webmanifest',
      '/ranger-hub-mark-192.png',
      '/ranger-hub-mark-512.png',
      '/sw.js',
      '/assets/index-a1.css',
      '/assets/index-b2.js',
      '/api/public',
      '/api/public/outposts?limit=2',
      '/api/public/advancement?limit=2',
      '/api/public/events?limit=2',
      '/api/public/organizations?limit=2',
      '/api/public/pages?limit=2',
      '/api/public/records/outpost-record',
      '/api/search?q=Ranger&limit=2',
      '/api/public/outpost-submissions/config',
      '/api/public/outposts?cursor=not-a-cursor',
      '/api/not-a-real-route',
      '/operator',
      '/operator/records',
      '/api/operator/snapshot',
      '/api/operator/account/status',
      '/api/health',
    ]))
    const operatorRequest = production.requests.find(({ url }) => url.pathname === '/api/operator/snapshot')
    expect(operatorRequest.init.redirect).toBe('manual')
    for (const { init } of production.requests) {
      const headers = new Headers(init.headers)
      expect(headers.has('authorization')).toBe(false)
      expect(headers.has('cookie')).toBe(false)
      expect(init.method ?? 'GET').toMatch(/^(GET|HEAD)$/)
      expect(init.body).toBeUndefined()
    }
  })

  it('fails when a public response includes private editorial state', async () => {
    const production = successfulProduction({ leakPrivateField: true })

    await expect(runProductionSmoke('https://hub.example', { fetch: production.fetch }))
      .rejects.toThrow(/private field|email address/i)
  })
})
