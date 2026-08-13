import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyAccessIdentity } from './access-identity'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Cloudflare Access identity verification', () => {
  it('extracts only normalized identity and safe token timing after full claim verification', async () => {
    const issuer = 'https://identity-one.cloudflareaccess.com'
    const audience = 'operator-audience'
    const now = Math.floor(Date.now() / 1_000)
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    const fetchKeys = vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }))
    vi.stubGlobal('fetch', fetchKeys)
    const token = await new SignJWT({ email: ' Founder@Example.ORG ' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('access-user-id')
      .setIssuedAt(now)
      .setNotBefore(now - 1)
      .setExpirationTime(now + 300)
      .sign(privateKey)

    const identity = await verifyAccessIdentity(new Request('https://hub.example/operator', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }), { ACCESS_TEAM_DOMAIN: issuer, ACCESS_POLICY_AUD: audience })

    expect(identity).toEqual({
      email: 'founder@example.org',
      subject: 'access-user-id',
      issuedAt: now,
      notBefore: now - 1,
      expiresAt: now + 300,
      localPreview: false,
    })
    await verifyAccessIdentity(new Request('https://hub.example/operator', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }), { ACCESS_TEAM_DOMAIN: issuer, ACCESS_POLICY_AUD: audience })
    expect(fetchKeys).toHaveBeenCalledTimes(1)
  })

  it('requires email, subject, issued-at, not-before, and expiration claims', async () => {
    const issuer = 'https://identity-two.cloudflareaccess.com'
    const audience = 'operator-audience'
    const now = Math.floor(Date.now() / 1_000)
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'key-2', alg: 'RS256', use: 'sig' }] })))
    const token = await new SignJWT({ email: 'operator@example.org' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-2' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey)

    await expect(verifyAccessIdentity(new Request('https://hub.example/operator', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }), { ACCESS_TEAM_DOMAIN: issuer, ACCESS_POLICY_AUD: audience })).rejects.toThrow()
  })

  it('keeps the local exception deterministic and limited to exact loopback hosts', async () => {
    const local = await verifyAccessIdentity(
      new Request('http://localhost/operator'),
      { LOCAL_OPERATOR_PREVIEW: 'true' },
      new Date('2026-08-13T12:00:00.000Z'),
    )
    expect(local.email).toBe('local-preview@operator.invalid')
    expect(local.localPreview).toBe(true)

    await expect(verifyAccessIdentity(
      new Request('http://localhost.example/operator'),
      { LOCAL_OPERATOR_PREVIEW: 'true' },
    )).rejects.toThrow()
  })
})
