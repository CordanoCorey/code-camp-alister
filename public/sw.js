import { assetPathsFromShell, canCacheResponse, classifyRequest, markOfflineResponse } from './sw-policy.js'

const CACHE_VERSION = 'v5'
const SHELL_CACHE = `ranger-outpost-shell-${CACHE_VERSION}`
const DATA_CACHE = `ranger-outpost-public-data-${CACHE_VERSION}`
const APP_SHELL = [
  '/manifest.webmanifest',
  '/ranger-hub-mark.svg',
  '/ranger-hub-mark-192.png',
  '/ranger-hub-mark-512.png',
]

async function installPublicCaches() {
  const shellCache = await caches.open(SHELL_CACHE)
  const shellResponse = await fetch('/', { cache: 'no-store' })
  if (!canCacheResponse(shellResponse)) throw new Error('The public app shell could not be cached.')
  await shellCache.put('/', shellResponse.clone())
  await shellCache.addAll([...APP_SHELL, ...assetPathsFromShell(await shellResponse.text())])

  try {
    await publicData(new Request(new URL('/api/public', self.location.origin)))
  } catch {
    // The shell remains installable; the UI explains when no saved public bundle exists yet.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([installPublicCaches(), self.skipWaiting()]))
})

self.addEventListener('activate', (event) => {
  const currentCaches = new Set([SHELL_CACHE, DATA_CACHE])
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('ranger-outpost-') && !currentCaches.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

async function publicData(request) {
  const cache = await caches.open(DATA_CACHE)
  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (canCacheResponse(response)) await cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    if (!cached) throw new Error('No saved public data is available.')
    return markOfflineResponse(cached)
  }
}

async function immutableAsset(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (canCacheResponse(response)) await cache.put(request, response.clone())
  return response
}

async function appShell(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (canCacheResponse(response)) await cache.put('/', response.clone())
    return response
  } catch {
    const cached = await cache.match('/')
    if (!cached) throw new Error('The public app shell is not available offline.')
    return cached
  }
}

self.addEventListener('fetch', (event) => {
  const policy = classifyRequest(event.request, self.location.origin)
  if (policy === 'ignore') return
  if (policy === 'public-data') event.respondWith(publicData(event.request))
  else if (policy === 'immutable-asset' || policy === 'core-asset') event.respondWith(immutableAsset(event.request))
  else if (policy === 'app-shell') event.respondWith(appShell(event.request))
})
