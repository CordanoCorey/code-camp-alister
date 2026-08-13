import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import { createMigratedD1 } from './test-sqlite-d1'

const proposal = {
  submissionType: 'new-listing',
  targetOutpostId: null,
  church: 'Community Church',
  outpostNumber: '12',
  campusSuffix: null,
  streetAddress: '100 Main Street',
  city: 'Springfield',
  jurisdiction: 'Missouri',
  postalCode: '65802',
  district: null,
  languageOverlay: null,
  programs: ['Ranger Kids'],
  meeting: 'Wednesdays at 6:30 p.m.',
  sourceUrl: 'https://example.org/rangers',
  fcfActivityStatus: 'not-verified',
  replyEmail: 'submitter@example.org',
  notes: 'Please verify the public page.',
  privacyConfirmed: true,
}

function env(db: D1Database, overrides: Record<string, string> = {}) {
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    DB: db,
    ...overrides,
  } as never
}

async function jsonRequest(url: string, body: unknown, environment: never, extraHeaders: Record<string, string> = {}) {
  return worker.fetch(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(url).origin, ...extraHeaders },
    body: JSON.stringify(body),
  }), environment)
}

describe('public Directory Submission HTTP seam', () => {
  let migrated: ReturnType<typeof createMigratedD1>

  beforeEach(() => {
    migrated = createMigratedD1()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'))
  })

  afterEach(() => {
    migrated.close()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fails closed without abuse configuration and never mutates D1', async () => {
    const response = await jsonRequest('https://hub.example/api/public/outpost-submissions', {
      proposal, challengeToken: 'token', timingToken: 'token', website: '',
    }, env(migrated.db))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Secure online intake is unavailable. Prepare an email or copy the proposal instead.',
      code: 'intake-unavailable',
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM directory_submissions').get()).toEqual({ count: 0 })
  })

  it('accepts private proposals on exact loopback only and treats an exact duplicate the same', async () => {
    const environment = env(migrated.db, {
      LOCAL_PUBLIC_INTAKE_BYPASS: 'true',
      INTAKE_SIGNING_SECRET: 'local-test-signing-secret-with-enough-entropy',
    })
    const config = await worker.fetch(new Request('http://localhost/api/public/outpost-submissions/config'), environment)
    const configured = await config.json() as { enabled: boolean; timingToken: string }
    expect(configured.enabled).toBe(true)

    vi.advanceTimersByTime(3_000)
    const body = { proposal, challengeToken: '', timingToken: configured.timingToken, website: '' }
    const accepted = await jsonRequest('http://localhost/api/public/outpost-submissions', body, environment)
    const duplicate = await jsonRequest('http://localhost/api/public/outpost-submissions', body, environment)

    expect(accepted.status).toBe(202)
    expect(duplicate.status).toBe(202)
    expect(Object.keys(await accepted.json() as object).sort()).toEqual(['referenceCode', 'status'])
    expect(Object.keys(await duplicate.json() as object).sort()).toEqual(['referenceCode', 'status'])
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM directory_submissions').get()).toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM directory_submission_events').get()).toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM public_search_documents').get()).toEqual({ count: 137 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM public_outpost_directory').get()).toEqual({ count: 4 })

    const wrongHost = await jsonRequest('https://hub.example/api/public/outpost-submissions', body, environment)
    expect(wrongHost.status).toBe(503)
  })

  it('rejects wrong origin, content type, honeypot, fast completion, oversized and invalid input before D1', async () => {
    const environment = env(migrated.db, {
      LOCAL_PUBLIC_INTAKE_BYPASS: 'true',
      INTAKE_SIGNING_SECRET: 'local-test-signing-secret-with-enough-entropy',
    })
    const configResponse = await worker.fetch(new Request('http://127.0.0.1/api/public/outpost-submissions/config'), environment)
    const config = await configResponse.json() as { timingToken: string }

    const fast = await jsonRequest('http://127.0.0.1/api/public/outpost-submissions', {
      proposal, challengeToken: '', timingToken: config.timingToken, website: '',
    }, environment)
    expect(fast.status).toBe(400)

    vi.advanceTimersByTime(3_000)
    const wrongOrigin = await jsonRequest('http://127.0.0.1/api/public/outpost-submissions', {
      proposal, challengeToken: '', timingToken: config.timingToken, website: '',
    }, environment, { origin: 'https://other.example' })
    const honeypot = await jsonRequest('http://127.0.0.1/api/public/outpost-submissions', {
      proposal, challengeToken: '', timingToken: config.timingToken, website: 'filled',
    }, environment)
    const invalid = await jsonRequest('http://127.0.0.1/api/public/outpost-submissions', {
      proposal: { ...proposal, sourceUrl: 'http://example.org', privacyConfirmed: false },
      challengeToken: '', timingToken: config.timingToken, website: '',
    }, environment)
    const wrongType = await worker.fetch(new Request('http://127.0.0.1/api/public/outpost-submissions', {
      method: 'POST', headers: { 'content-type': 'text/plain', origin: 'http://127.0.0.1' }, body: '{}',
    }), environment)
    const oversized = await jsonRequest('http://127.0.0.1/api/public/outpost-submissions', {
      proposal: { ...proposal, notes: 'x'.repeat(20_000) }, challengeToken: '', timingToken: config.timingToken, website: '',
    }, environment)

    expect(wrongOrigin.status).toBe(403)
    expect(honeypot.status).toBe(400)
    expect(invalid.status).toBe(400)
    expect(wrongType.status).toBe(415)
    expect(oversized.status).toBe(413)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM directory_submissions').get()).toEqual({ count: 0 })
  })

  it('verifies Turnstile success, action, and hostname without storing challenge data', async () => {
    const environment = env(migrated.db, {
      TURNSTILE_SITE_KEY: 'public-site-key',
      TURNSTILE_SECRET_KEY: 'private-test-secret',
      TURNSTILE_EXPECTED_HOSTNAMES: 'hub.example',
      INTAKE_SIGNING_SECRET: 'production-test-signing-secret-with-enough-entropy',
    })
    const configResponse = await worker.fetch(new Request('https://hub.example/api/public/outpost-submissions/config'), environment)
    const config = await configResponse.json() as { timingToken: string; action: string; siteKey: string }
    vi.advanceTimersByTime(3_000)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      success: true, hostname: 'hub.example', action: 'outpost-submission', challenge_ts: '2026-08-13T12:00:00.000Z',
    })))

    const response = await jsonRequest('https://hub.example/api/public/outpost-submissions', {
      proposal, challengeToken: 'single-use-provider-token', timingToken: config.timingToken, website: '',
    }, environment)
    expect(response.status).toBe(202)
    expect(config).toMatchObject({ action: 'outpost-submission', siteKey: 'public-site-key' })
    const schema = String(migrated.sqlite.prepare("SELECT group_concat(sql, ' ') sql FROM sqlite_schema WHERE type = 'table'").get().sql)
    expect(schema).not.toMatch(/challenge_token|ip_address|user_agent/i)
  })
})
