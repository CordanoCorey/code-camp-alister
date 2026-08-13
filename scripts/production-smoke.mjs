import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SPA_ROUTES = [
  '/',
  '/outposts',
  '/advancement',
  '/events',
  '/about',
  '/other',
  '/help',
  '/search',
  '/add-your-outpost',
]

const PRIVATE_ACCOUNT_ROUTES = ['/signup', '/sign-in', '/forgot-password', '/reset-password', '/account']

const PAGED_PUBLIC_APIS = [
  ['/api/public/outposts?limit=2', 'outpost'],
  ['/api/public/advancement?limit=2', 'advancement'],
  ['/api/public/events?limit=2', 'event'],
  ['/api/public/organizations?limit=2', 'organization'],
  ['/api/public/pages?limit=2', 'page'],
]

const RECORD_KINDS = new Set(['outpost', 'event', 'advancement', 'organization', 'page'])
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'actor',
  'audit',
  'auditActor',
  'operatorLabel',
  'tenureNumber',
  'renewalDueAt',
  'adultEligibilityConfirmed',
  'accessCleanupRequired',
  'pendingTransfer',
  'verifiedEmail',
  'email',
  'authUserId',
  'profile',
  'claimedPosition',
  'eligibility',
  'session',
  'token',
  'assertions',
  'brokenSources',
  'conflicts',
  'coverageGaps',
  'freshnessQueue',
  'openedBy',
  'privateNotes',
  'resolutionNote',
  'resolvedBy',
  'sourceHealthNotes',
  'submitterEmail',
  'version',
  'accessDueAt',
  'noticeOpenAt',
  'deletionDueAt',
  'confirmedDeliveryAt',
  'lifecycleState',
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireSecurityHeaders(response, label) {
  const csp = response.headers.get('content-security-policy') ?? ''
  assert(csp.includes("default-src 'self'"), `${label} is missing the expected Content-Security-Policy.`)
  assert(csp.includes("frame-ancestors 'none'"), `${label} does not deny framing in Content-Security-Policy.`)
  assert(response.headers.get('strict-transport-security')?.includes('max-age='), `${label} is missing HSTS.`)
  assert(response.headers.get('x-content-type-options') === 'nosniff', `${label} is missing nosniff.`)
  assert(response.headers.get('x-frame-options') === 'DENY', `${label} is missing the frame denial header.`)
  assert(response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', `${label} has an unexpected Referrer-Policy.`)
  assert(response.headers.get('permissions-policy')?.includes('camera=()'), `${label} is missing the restrictive Permissions-Policy.`)
}

function requirePrivateAccountHeaders(response, label) {
  const csp = response.headers.get('content-security-policy') ?? ''
  assert(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"), `${label} is missing the expected CSP.`)
  assert(response.headers.get('strict-transport-security')?.includes('max-age='), `${label} is missing HSTS.`)
  assert(response.headers.get('x-content-type-options') === 'nosniff', `${label} is missing nosniff.`)
  assert(response.headers.get('x-frame-options') === 'DENY', `${label} is missing frame denial.`)
  assert(response.headers.get('referrer-policy') === 'no-referrer', `${label} must use Referrer-Policy: no-referrer.`)
  requireNoStore(response, label)
}

function requireNoStore(response, label) {
  const cacheControl = response.headers.get('cache-control') ?? ''
  assert(/(?:^|,)\s*no-store(?:\s|,|$)/i.test(cacheControl), `${label} must use Cache-Control: no-store.`)
}

function requirePublicCache(response, label) {
  const cacheControl = response.headers.get('cache-control') ?? ''
  assert(/(?:^|,)\s*public(?:\s|,|$)/i.test(cacheControl), `${label} must be explicitly public-cacheable.`)
  assert(!/(?:^|,)\s*(?:private|no-store)(?:\s|,|$)/i.test(cacheControl), `${label} has a private cache directive.`)
}

function inspectPublicValue(value, label, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectPublicValue(item, label, `${path}[${index}]`))
    return
  }
  if (!isObject(value)) {
    if (typeof value === 'string') {
      assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value), `${label} exposes an email address at ${path}.`)
    }
    return
  }
  for (const [key, child] of Object.entries(value)) {
    assert(!FORBIDDEN_PUBLIC_KEYS.has(key), `${label} exposes private field ${path}.${key}.`)
    if (key === 'status') assert(child === 'published', `${label} exposes a non-published record at ${path}.status.`)
    inspectPublicValue(child, label, `${path}.${key}`)
  }
}

function validateRecord(record, label) {
  assert(isObject(record), `${label} contains a non-object record.`)
  assert(typeof record.id === 'string' && record.id.length > 0, `${label} has a record without an ID.`)
  assert(RECORD_KINDS.has(record.kind), `${label} has an unsupported record kind.`)
  assert(typeof record.slug === 'string' && record.slug.length > 0, `${label} has a record without a slug.`)
  assert(typeof record.title === 'string' && record.title.length > 0, `${label} has a record without a title.`)
  assert(typeof record.summary === 'string', `${label} has a record without a summary.`)
  assert(record.status === 'published', `${label} contains a record that is not published.`)
  assert(isObject(record.details), `${label} has a record without bounded details.`)
  assert(Array.isArray(record.sources), `${label} has a record without public sources.`)
  inspectPublicValue(record, label)
}

async function readJson(response, label) {
  try {
    return await response.json()
  } catch {
    throw new Error(`${label} did not return valid JSON.`)
  }
}

function validatePage(page, label, maximum = 2) {
  assert(isObject(page), `${label} did not return a page object.`)
  assert(Array.isArray(page.records), `${label} did not return a records array.`)
  assert(page.records.length <= maximum, `${label} exceeded the requested record bound.`)
  assert(page.nextCursor === null || typeof page.nextCursor === 'string', `${label} returned an invalid next cursor.`)
  assert(typeof page.generatedAt === 'string', `${label} did not return a generated date.`)
  page.records.forEach((record) => validateRecord(record, label))
}

export async function runProductionSmoke(baseUrl, options = {}) {
  const target = new URL(baseUrl)
  if (target.protocol !== 'https:') {
    throw new Error('Production smoke requires an HTTPS base URL.')
  }
  if (target.username || target.password) {
    throw new Error('Production smoke does not accept credentials in the base URL.')
  }
  const origin = target.origin
  const fetchImpl = options.fetch ?? globalThis.fetch
  assert(typeof fetchImpl === 'function', 'No fetch implementation is available.')
  const checks = []
  const request = (path, init = {}) => fetchImpl(new URL(path, origin).href, init)
  let rootHtml = ''

  for (const path of SPA_ROUTES) {
    const response = await request(path)
    assert(response.status === 200, `${path} returned ${response.status}; expected 200.`)
    requireSecurityHeaders(response, path)
    assert(response.headers.get('content-type')?.includes('text/html'), `${path} did not return the SPA HTML.`)
    const html = await response.text()
    assert(/<div[^>]+id=["']root["']/i.test(html), `${path} did not return the Ranger Outpost Hub shell.`)
    if (path === '/') rootHtml = html
    checks.push(`SPA ${path}`)
  }

  for (const path of PRIVATE_ACCOUNT_ROUTES) {
    const response = await request(path)
    assert(response.status === 200, `${path} returned ${response.status}; expected 200.`)
    requirePrivateAccountHeaders(response, path)
    assert(response.headers.get('content-type')?.includes('text/html'), `${path} did not return SPA HTML.`)
    assert(/<div[^>]+id=["']root["']/i.test(await response.text()), `${path} did not return the SPA shell.`)
    checks.push(`private account SPA ${path}`)
  }

  const manifestResponse = await request('/manifest.webmanifest')
  assert(manifestResponse.status === 200, 'The web manifest did not load.')
  requireSecurityHeaders(manifestResponse, 'The web manifest')
  const manifest = await readJson(manifestResponse, 'The web manifest')
  assert(manifest.name === 'Ranger Outpost Hub', 'The web manifest has the wrong application name.')
  assert(manifest.start_url === '/' && manifest.scope === '/', 'The web manifest has the wrong start URL or scope.')
  assert(manifest.display === 'standalone', 'The web manifest is not configured as standalone.')
  assert(Array.isArray(manifest.icons), 'The web manifest has no icon declarations.')
  assert(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'), 'The web manifest has no 192x192 PNG icon.')
  assert(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'), 'The web manifest has no 512x512 PNG icon.')
  assert(manifest.icons.some((icon) => String(icon.purpose).split(/\s+/).includes('maskable')), 'The web manifest has no maskable icon.')
  checks.push('web manifest')

  for (const iconPath of [...new Set(manifest.icons.map((icon) => icon.src))]) {
    const response = await request(iconPath)
    assert(response.status === 200, `${iconPath} did not load.`)
    assert(response.headers.get('content-type')?.includes('image/png'), `${iconPath} is not served as PNG.`)
    checks.push(`icon ${iconPath}`)
  }

  const serviceWorker = await request('/sw.js')
  assert(serviceWorker.status === 200, 'The service worker did not load.')
  requireSecurityHeaders(serviceWorker, 'The service worker')
  assert(/(?:java|ecma)script/i.test(serviceWorker.headers.get('content-type') ?? ''), 'The service worker has the wrong content type.')
  checks.push('service worker')

  const hashedAssets = [...new Set(
    [...rootHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((path) => /^\/assets\/.+-[\w-]+\.(?:css|js)$/.test(path)),
  )]
  assert(hashedAssets.some((path) => path.endsWith('.js')), 'The SPA shell has no hashed JavaScript asset.')
  assert(hashedAssets.some((path) => path.endsWith('.css')), 'The SPA shell has no hashed CSS asset.')
  for (const assetPath of hashedAssets) {
    const response = await request(assetPath)
    assert(response.status === 200, `${assetPath} did not load.`)
    const expected = assetPath.endsWith('.css') ? 'text/css' : /(?:java|ecma)script/i
    const contentType = response.headers.get('content-type') ?? ''
    assert(typeof expected === 'string' ? contentType.includes(expected) : expected.test(contentType), `${assetPath} has the wrong content type.`)
    checks.push(`asset ${assetPath}`)
  }

  const bootstrapResponse = await request('/api/public')
  assert(bootstrapResponse.status === 200, `/api/public returned ${bootstrapResponse.status}.`)
  requireSecurityHeaders(bootstrapResponse, '/api/public')
  requirePublicCache(bootstrapResponse, '/api/public')
  const bootstrap = await readJson(bootstrapResponse, '/api/public')
  assert(Array.isArray(bootstrap.navigation) && bootstrap.navigation.length <= 12, '/api/public returned an invalid navigation bundle.')
  assert(Array.isArray(bootstrap.featuredRecords) && bootstrap.featuredRecords.length <= 7, '/api/public returned an invalid featured bundle.')
  assert(isObject(bootstrap.counts), '/api/public returned invalid public counts.')
  assert(typeof bootstrap.generatedAt === 'string', '/api/public did not return a generated date.')
  ;[...bootstrap.navigation, ...bootstrap.featuredRecords].forEach((record) => validateRecord(record, '/api/public'))
  inspectPublicValue(bootstrap, '/api/public')
  checks.push('public bootstrap')

  let detailSlug = null
  for (const [path, expectedKind] of PAGED_PUBLIC_APIS) {
    const response = await request(path)
    assert(response.status === 200, `${path} returned ${response.status}.`)
    requireSecurityHeaders(response, path)
    requirePublicCache(response, path)
    const page = await readJson(response, path)
    validatePage(page, path)
    assert(page.records.every((record) => record.kind === expectedKind), `${path} returned the wrong record kind.`)
    if (!detailSlug && page.records.length > 0) detailSlug = page.records[0].slug
    checks.push(`public page ${expectedKind}`)
  }
  assert(detailSlug, 'No public record was available for the detail smoke check.')

  const detailPath = `/api/public/records/${encodeURIComponent(detailSlug)}`
  const detailResponse = await request(detailPath)
  assert(detailResponse.status === 200, `${detailPath} returned ${detailResponse.status}.`)
  requireSecurityHeaders(detailResponse, detailPath)
  requirePublicCache(detailResponse, detailPath)
  const detail = await readJson(detailResponse, detailPath)
  assert(isObject(detail) && isObject(detail.record), `${detailPath} returned an invalid detail DTO.`)
  validateRecord(detail.record, detailPath)
  checks.push('public detail')

  const searchPath = '/api/search?q=Ranger&limit=2'
  const searchResponse = await request(searchPath)
  assert(searchResponse.status === 200, `${searchPath} returned ${searchResponse.status}.`)
  requireSecurityHeaders(searchResponse, searchPath)
  requirePublicCache(searchResponse, searchPath)
  validatePage(await readJson(searchResponse, searchPath), searchPath)
  checks.push('public search')

  const intakeConfigResponse = await request('/api/public/outpost-submissions/config')
  assert(intakeConfigResponse.status === 200, `Public intake configuration returned ${intakeConfigResponse.status}.`)
  requireNoStore(intakeConfigResponse, 'Public intake configuration')
  const intakeConfig = await readJson(intakeConfigResponse, 'Public intake configuration')
  assert(isObject(intakeConfig) && typeof intakeConfig.enabled === 'boolean', 'Public intake configuration is malformed.')
  assert(!/(?:secret|replyEmail|notes|referenceCode|challengeToken)/i.test(JSON.stringify(intakeConfig)), 'Public intake configuration leaked private state.')
  checks.push(`public intake ${intakeConfig.enabled ? 'configured' : 'fallback'}`)

  const accountConfigResponse = await request('/api/account/config')
  assert(accountConfigResponse.status === 200, 'Ordinary account configuration did not respond.')
  requirePrivateAccountHeaders(accountConfigResponse, 'Ordinary account configuration')
  const accountConfig = await readJson(accountConfigResponse, 'Ordinary account configuration')
  assert(accountConfig.enabled === true && accountConfig.signupEnabled === true
    && accountConfig.localPreview === false
    && typeof accountConfig.siteKey === 'string' && accountConfig.siteKey.length > 0
    && accountConfig.action === 'adult-account-eligibility',
  'Production ordinary signup is not fully configured with provider-controlled settings.')
  checks.push('ordinary account production configuration')

  const accountSessionResponse = await request('/api/account/session')
  assert(accountSessionResponse.status === 200, '/api/account/session did not accept an anonymous production session check.')
  requirePrivateAccountHeaders(accountSessionResponse, '/api/account/session')
  const accountSession = await readJson(accountSessionResponse, '/api/account/session')
  assert(isObject(accountSession) && accountSession.authenticated === false,
    '/api/account/session did not return the anonymous session shape.')
  checks.push('ordinary account anonymous session')

  const authSessionResponse = await request('/api/auth/get-session')
  assert(authSessionResponse.status === 200, '/api/auth/get-session did not accept an anonymous production session check.')
  requirePrivateAccountHeaders(authSessionResponse, '/api/auth/get-session')
  assert(await readJson(authSessionResponse, '/api/auth/get-session') === null,
    '/api/auth/get-session did not return an empty anonymous session.')
  checks.push('ordinary auth anonymous session')

  for (const [path, expectedStatus] of [
    ['/api/public/outposts?cursor=not-a-cursor', 400],
    ['/api/not-a-real-route', 404],
  ]) {
    const response = await request(path)
    assert(response.status === expectedStatus, `${path} returned ${response.status}; expected ${expectedStatus}.`)
    requireNoStore(response, path)
    const body = await readJson(response, path)
    assert(isObject(body) && typeof body.error === 'string' && body.error.length > 0, `${path} did not fail plainly.`)
    inspectPublicValue(body, path)
    checks.push(`failure ${path}`)
  }

  for (const path of ['/operator', '/operator/records', '/api/operator/snapshot',
    '/api/operator/account/status', '/api/operator/automation']) {
    const operatorResponse = await request(path, { redirect: 'manual' })
    assert([302, 401, 403].includes(operatorResponse.status), `Unauthenticated ${path} access returned ${operatorResponse.status}.`)
    requireNoStore(operatorResponse, `Unauthenticated ${path} access`)
    const operatorBody = await operatorResponse.text()
    assert(!/"(?:actor|audit|records|freshnessQueue|conflicts)"\s*:/i.test(operatorBody), `Unauthenticated ${path} access returned private data.`)
    checks.push(`Operator denial ${path}`)
  }

  const healthResponse = await request('/api/health')
  assert(healthResponse.status === 200, `/api/health returned ${healthResponse.status}.`)
  requireSecurityHeaders(healthResponse, '/api/health')
  requireNoStore(healthResponse, '/api/health')
  const health = await readJson(healthResponse, '/api/health')
  assert(JSON.stringify(health) === JSON.stringify({ status: 'ok', schema: '0012' }), '/api/health leaked or omitted readiness fields.')
  checks.push('readiness GET')

  const healthHead = await request('/api/health', { method: 'HEAD' })
  assert(healthHead.status === 200, `HEAD /api/health returned ${healthHead.status}.`)
  requireNoStore(healthHead, 'HEAD /api/health')
  assert((await healthHead.text()) === '', 'HEAD /api/health returned a response body.')
  checks.push('readiness HEAD')

  return { baseUrl: origin, checks }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const baseUrl = process.argv[2]
  if (!baseUrl) {
    console.error('Usage: npm run smoke:production -- https://your-worker.workers.dev')
    process.exitCode = 1
  } else {
    runProductionSmoke(baseUrl)
      .then((result) => console.log(JSON.stringify({ ok: true, ...result }, null, 2)))
      .catch((error) => {
        console.error(`Production smoke failed: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
      })
  }
}
