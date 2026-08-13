import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import { createMigratedD1 } from './test-sqlite-d1'

const issuer = 'https://lifecycle-test.cloudflareaccess.com'
const audience = 'operator-lifecycle-audience'
let privateKey: CryptoKey
let publicJwk: Awaited<ReturnType<typeof exportJWK>>
let database: ReturnType<typeof createMigratedD1>

beforeAll(async () => {
  const keys = await generateKeyPair('RS256')
  privateKey = keys.privateKey
  publicJwk = await exportJWK(keys.publicKey)
})

beforeEach(() => {
  database = createMigratedD1()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    keys: [{ ...publicJwk, kid: 'lifecycle-key', alg: 'RS256', use: 'sig' }],
  })))
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

afterEach(() => {
  database.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function assertion(email: string, issuedAt = Math.floor(Date.now() / 1_000)) {
  const now = Math.floor(Date.now() / 1_000)
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'lifecycle-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(`subject:${email}`)
    .setIssuedAt(issuedAt)
    .setNotBefore(now - 1)
    .setExpirationTime(now + 300)
    .sign(privateKey)
}

function env() {
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    DB: database.db,
    ACCESS_TEAM_DOMAIN: issuer,
    ACCESS_POLICY_AUD: audience,
  } as never
}

async function api(path: string, email: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cf-Access-Jwt-Assertion', await assertion(email))
  if (init.body) headers.set('content-type', 'application/json')
  return worker.fetch(new Request(`https://hub.example${path}`, { ...init, headers }), env())
}

async function apiWithIssuedAt(path: string, email: string, issuedAt: number, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cf-Access-Jwt-Assertion', await assertion(email, issuedAt))
  if (init.body) headers.set('content-type', 'application/json')
  return worker.fetch(new Request(`https://hub.example${path}`, { ...init, headers }), env())
}

async function claimFounder() {
  return api('/api/operator/account/claim', 'founder@example.org', {
    method: 'POST',
    body: JSON.stringify({
      displayName: 'Founder', currentOutpostId: null, birthYear: '2000', adultAttestation: true,
    }),
  })
}

describe('Access identity and D1 lifecycle authorization at the Worker seam', () => {
  it('claims without persisting, returning, or logging Birth Year and rejects a non-active Access identity before domain reads', async () => {
    const bareNumber = await api('/api/operator/account/claim', 'founder@example.org', {
      method: 'POST',
      body: JSON.stringify({
        displayName: 'Founder', currentOutpostId: 123, birthYear: '2000', adultAttestation: true,
      }),
    })
    expect(bareNumber.status).toBe(400)
    expect(await bareNumber.json()).toEqual({ error: 'Choose an existing Hub Outpost or No Current Outpost.' })
    expect(database.sqlite.prepare('SELECT state FROM operator_account').get()).toEqual({ state: 'unclaimed' })

    const response = await claimFounder()
    expect(response.status).toBe(201)
    expect(JSON.stringify(await response.json())).not.toContain('2000')

    const schema = database.sqlite.prepare(`SELECT group_concat(sql, ' ') sql FROM sqlite_schema WHERE type = 'table'`).get() as { sql: string }
    expect(schema.sql).not.toMatch(/birth.?year|birth.?date/i)
    const stored = database.sqlite.prepare(`SELECT display_name, verified_email, attestation_version
      FROM operator_account`).get()
    expect(stored).toEqual({
      display_name: 'Founder', verified_email: 'founder@example.org', attestation_version: 'operator-adult-v1',
    })
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('2000')

    database.clearQueries()
    const stranger = await api('/api/operator/snapshot', 'stranger@example.org')
    expect(stranger.status).toBe(403)
    expect(await stranger.json()).toEqual({ error: 'This Access identity is not authorized for that Operator action.' })
    const strangerQueries = database.queries.map(({ sql }) => sql).join('\n')
    expect(strangerQueries).not.toMatch(/account\.display_name|account\.renewal_due_at|account\.access_cleanup/i)
    expect(strangerQueries).not.toMatch(/FROM content_records|FROM field_provenance|FROM content_audit_events/i)

    const publicResponse = await worker.fetch(new Request('https://hub.example/api/public'), env())
    expect(JSON.stringify(await publicResponse.json())).not.toMatch(/founder@example|operator_account|tenure|adult_eligibility/i)
  })

  it('limits a pending successor to status and acceptance, then rejects the predecessor immediately after atomic acceptance', async () => {
    expect((await claimFounder()).status).toBe(201)
    const staged = await api('/api/operator/account/transfer', 'founder@example.org', {
      method: 'POST',
      body: JSON.stringify({
        successorDisplayName: 'Successor', successorEmail: 'successor@example.org',
        successorCurrentOutpostId: null, deliberateConfirmation: true,
      }),
    })
    expect(staged.status).toBe(201)
    const { acceptanceLink } = await staged.json() as { acceptanceLink: string }
    const link = new URL(acceptanceLink)
    expect(link.search).toBe('')
    expect(link.hash).toMatch(/^#transfer=[A-Za-z0-9_-]{43}$/)
    const token = new URLSearchParams(link.hash.slice(1)).get('transfer')!

    const successorContent = await api('/api/operator/snapshot', 'successor@example.org')
    expect(successorContent.status).toBe(403)
    const successorStatus = await api('/api/operator/account/status', 'successor@example.org')
    const pending = await successorStatus.json()
    expect(pending).toMatchObject({
      role: 'pending-successor', transfer: { displayName: 'Successor', currentOutpost: null },
    })
    expect(JSON.stringify(pending)).not.toMatch(/founder|predecessor/i)

    const failed = await api('/api/operator/account/transfer/accept', 'successor@example.org', {
      method: 'POST',
      body: JSON.stringify({
        token: 'C'.repeat(43), birthYear: '2000', adultAttestation: true,
        responsibilityAccepted: true, currentOutpostAccepted: true,
      }),
    })
    expect(failed.status).toBe(409)
    expect((await api('/api/operator/snapshot', 'founder@example.org')).status).toBe(200)

    const accepted = await api('/api/operator/account/transfer/accept', 'successor@example.org', {
      method: 'POST',
      body: JSON.stringify({
        token, birthYear: '2000', adultAttestation: true,
        responsibilityAccepted: true, currentOutpostAccepted: true,
      }),
    })
    expect(accepted.status).toBe(200)
    expect((await api('/api/operator/snapshot', 'founder@example.org')).status).toBe(403)
    expect((await api('/api/operator/snapshot', 'successor@example.org')).status).toBe(200)

    const terminal = database.sqlite.prepare(`SELECT state, successor_display_name, successor_email,
      successor_current_outpost_id, acceptance_token_hash, successor_tenure_number
      FROM operator_transfers`).get()
    expect(terminal).toEqual({
      state: 'accepted', successor_display_name: null, successor_email: null,
      successor_current_outpost_id: null, acceptance_token_hash: null, successor_tenure_number: 2,
    })
    expect(database.sqlite.prepare(`SELECT COUNT(*) count FROM operator_tenures WHERE ended_at IS NULL`).get())
      .toEqual({ count: 1 })
  })

  it('blocks ordinary work at expiry while status, renewal, and transfer controls remain available', async () => {
    expect((await claimFounder()).status).toBe(201)
    database.sqlite.prepare(`UPDATE operator_account SET renewal_due_at = '2026-01-01T00:00:00.000Z', version = version + 1`).run()

    const blocked = await api('/api/operator/records', 'founder@example.org', {
      method: 'POST', body: JSON.stringify({ private: 'must not write' }),
    })
    expect(blocked.status).toBe(423)
    expect(await blocked.json()).toMatchObject({ code: 'renewal-required' })

    const firstStatus = await api('/api/operator/account/status', 'founder@example.org')
    expect(await firstStatus.json()).toMatchObject({
      role: 'active', account: { lifecycleState: 'renewal-required' },
    })
    await api('/api/operator/account/status', 'founder@example.org')
    expect(database.sqlite.prepare('SELECT COUNT(*) count FROM operator_renewal_notices').get())
      .toEqual({ count: 1 })

    const renewed = await api('/api/operator/account/renew', 'founder@example.org', { method: 'POST', body: '{}' })
    expect(renewed.status).toBe(200)
    expect((await api('/api/operator/snapshot', 'founder@example.org')).status).toBe(200)

    database.sqlite.prepare(`UPDATE operator_account SET renewal_due_at = '2026-01-01T00:00:00.000Z', version = version + 1`).run()
    const transfer = await api('/api/operator/account/transfer', 'founder@example.org', {
      method: 'POST',
      body: JSON.stringify({
        successorDisplayName: 'Next', successorEmail: 'next@example.org',
        successorCurrentOutpostId: null, deliberateConfirmation: true,
      }),
    })
    expect(transfer.status).toBe(201)
  })

  it('uses an HttpOnly server-side intent when an Access token is too old for a sensitive action', async () => {
    expect((await claimFounder()).status).toBe(201)
    const staleIssuedAt = Math.floor(Date.now() / 1_000) - 3_600
    const staleRenewal = await apiWithIssuedAt('/api/operator/account/renew', 'founder@example.org', staleIssuedAt, {
      method: 'POST', body: '{}',
    })
    expect(staleRenewal.status).toBe(403)
    expect(await staleRenewal.json()).toEqual({ error: 'A fresh Cloudflare Access session is required for this action.' })

    const intent = await apiWithIssuedAt('/api/operator/account/reauthenticate', 'founder@example.org', staleIssuedAt, {
      method: 'POST', body: JSON.stringify({ intendedAction: 'renew' }),
    })
    expect(intent.status).toBe(200)
    expect(await intent.json()).toEqual({ logoutUrl: '/cdn-cgi/access/logout' })
    const setCookie = intent.headers.get('set-cookie')!
    expect(setCookie).toMatch(/HttpOnly; Secure; SameSite=Strict/)
    expect(setCookie).not.toMatch(/founder|example\.org/i)
    const cookie = setCookie.split(';')[0]

    const freshIssuedAt = Math.floor(Date.now() / 1_000) + 1
    const resumed = await apiWithIssuedAt('/api/operator/account/renew', 'founder@example.org', freshIssuedAt, {
      method: 'POST', headers: { cookie }, body: '{}',
    })
    expect(resumed.status).toBe(200)
  })
})
