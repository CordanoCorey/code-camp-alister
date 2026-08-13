const PUBLIC_ROUTES = new Set([
  '/',
  '/search',
  '/outposts',
  '/add-your-outpost',
  '/advancement',
  '/events',
  '/about',
  '/other',
  '/help',
])

const CORE_ASSETS = new Set([
  '/manifest.webmanifest',
  '/ranger-hub-mark.svg',
  '/ranger-hub-mark-192.png',
  '/ranger-hub-mark-512.png',
])

const immutableAssetPath = /^\/assets\/.+-[\w-]+\.(?:css|js|woff2?|png|webp|svg)$/

export function assetPathsFromShell(html) {
  return [...new Set(
    [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((path) => immutableAssetPath.test(path)),
  )]
}

export function classifyRequest(request, origin) {
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== origin) return 'ignore'
  if (url.pathname === '/workspace' || url.pathname.startsWith('/workspace/')) return 'ignore'
  if (url.pathname === '/api/public/outpost-submissions/config' || url.pathname === '/api/public/outpost-submissions') return 'ignore'
  if (url.pathname === '/api/public' || url.pathname.startsWith('/api/public/') || url.pathname === '/api/search') return 'public-data'
  if (url.pathname.startsWith('/api/') || url.pathname === '/operator' || url.pathname.startsWith('/operator/')) return 'ignore'
  if (CORE_ASSETS.has(url.pathname)) return 'core-asset'
  if (immutableAssetPath.test(url.pathname)) return 'immutable-asset'
  if (request.mode === 'navigate' && PUBLIC_ROUTES.has(url.pathname)) return 'app-shell'
  return 'ignore'
}

export function canCacheResponse(response) {
  if (!response.ok) return false
  const cacheControl = response.headers.get('cache-control') ?? ''
  return !/(?:^|,)\s*(?:no-store|private)(?:\s|,|$)/i.test(cacheControl)
}

export function markOfflineResponse(cached) {
  const headers = new Headers(cached.headers)
  headers.set('x-ranger-data-source', 'cache')
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  })
}
