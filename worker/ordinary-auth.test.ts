import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleOrdinaryAccount } from './ordinary-account-http'
import { handleOrdinaryAuth, type OrdinaryAuthEnv } from './ordinary-auth'
import { deleteDueOrdinaryAccount } from './ordinary-account-lifecycle-repository'
import { createMigratedD1 } from './test-sqlite-d1'

const origin = 'http://localhost:5173'
const credentials = { email: 'alex@example.test', password: 'correct horse battery staple' }

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`${origin}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function cookieFrom(response: Response) {
  const value = response.headers.get('set-cookie')
  return value?.split(';', 1)[0] ?? ''
}

describe('ordinary Better Auth HTTP boundary', () => {
  let migrated: ReturnType<typeof createMigratedD1>
  let env: OrdinaryAuthEnv

  beforeEach(() => {
    migrated = createMigratedD1()
    env = {
      DB: migrated.db,
      AUTH_SECRET: 'test-only-auth-secret-that-is-at-least-32-characters',
      LOCAL_AUTH_EMAIL_PREVIEW: 'true',
    }
  })
  afterEach(() => migrated.close())

  async function signUpOnly(accountCredentials = credentials, suffix = 'signup') {
    const eligibility = await handleOrdinaryAccount(post('/api/account/eligibility', {
      birthYear: '2000',
      attested: true,
    }), env)
    expect(eligibility.status).toBe(200)
    const { token } = await eligibility.json() as { token: string }
    const signup = await handleOrdinaryAuth(post('/api/auth/sign-up/email', {
      ...accountCredentials,
      eligibilityToken: token,
      profile: {
        displayName: 'Alex',
        onboardingPath: 'usa',
        claimedPosition: 'Adult Leader',
        claimedPositionOther: null,
        currentOutpostId: null,
        outpostClaim: 'Outpost 12 at Example Church',
        usaJurisdictionId: 'us-va',
        countryCode: null,
        internationalSubdivision: null,
      },
    }), env, `${suffix}-request`)
    expect(signup.status).toBe(200)
  }

  async function signUpAndVerify(accountCredentials = credentials, suffix = 'signup') {
    await signUpOnly(accountCredentials, suffix)
    const preview = await handleOrdinaryAccount(
      new Request(`${origin}/api/account/local-email-preview?purpose=verification`), env,
    )
    const { url } = await preview.json() as { url: string }
    const verified = await handleOrdinaryAuth(new Request(url, { redirect: 'manual' }), env, `${suffix}-verify`)
    expect(verified.status).toBe(302)
    return url
  }

  it('requires one-time eligibility and verified email before creating a session', async () => {
    const bypass = await handleOrdinaryAuth(post('/api/auth/sign-up/email', credentials), env, 'bypass')
    expect(bypass.status).toBe(400)
    await signUpAndVerify()

    const signIn = await handleOrdinaryAuth(post('/api/auth/sign-in/email', credentials), env, 'signin')
    expect(signIn.status).toBe(200)
    const cookie = cookieFrom(signIn)
    expect(cookie).toContain('better-auth.session_token=')

    const account = await handleOrdinaryAccount(new Request(`${origin}/api/account/profile`, {
      headers: { cookie },
    }), env)
    expect(account.status).toBe(200)
    expect(account.headers.get('cache-control')).toBe('private, no-store')
    const payload = await account.json() as { profile: Record<string, unknown> }
    expect(payload.profile).not.toHaveProperty('password')
    expect(payload.profile).not.toHaveProperty('birthYear')
    expect(payload.profile).toMatchObject({ displayName: 'Alex', emailVerified: true })

    const signOut = await handleOrdinaryAuth(post('/api/auth/sign-out', {}, cookie), env, 'signout')
    expect(signOut.status).toBe(200)
  }, 20_000)

  it('uses a generic recovery response and consumes reset tokens once', async () => {
    await signUpAndVerify()
    const activeSession = await handleOrdinaryAuth(post('/api/auth/sign-in/email', credentials), env, 'pre-reset-signin')
    expect(activeSession.status).toBe(200)
    const missing = await handleOrdinaryAuth(post('/api/auth/request-password-reset', {
      email: 'missing@example.test', redirectTo: '/reset-password',
    }), env, 'missing-reset')
    const existing = await handleOrdinaryAuth(post('/api/auth/request-password-reset', {
      email: credentials.email, redirectTo: '/reset-password',
    }), env, 'existing-reset')
    expect(existing.status).toBe(200)
    expect(await existing.clone().json()).toEqual(await missing.json())

    const preview = await handleOrdinaryAccount(
      new Request(`${origin}/api/account/local-email-preview?purpose=password-reset`), env,
    )
    const { url } = await preview.json() as { url: string }
    const callback = await handleOrdinaryAuth(new Request(url, { redirect: 'manual' }), env, 'reset-callback')
    const token = new URL(callback.headers.get('location') as string).searchParams.get('token')
    const reset = await handleOrdinaryAuth(post('/api/auth/reset-password', {
      token, newPassword: 'new correct horse battery staple',
    }), env, 'reset')
    const replay = await handleOrdinaryAuth(post('/api/auth/reset-password', {
      token, newPassword: 'another correct horse battery staple',
    }), env, 'reset-replay')
    expect(reset.status).toBe(200)
    expect(replay.status).toBe(400)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM session').get()).toEqual({ count: 0 })
  }, 20_000)

  it('rejects unverified and wrong-credential sign-ins and verification replay creates no session', async () => {
    await signUpOnly()
    const unverified = await handleOrdinaryAuth(post('/api/auth/sign-in/email', credentials), env, 'unverified-signin')
    expect(unverified.status).not.toBe(200)
    const preview = await handleOrdinaryAccount(
      new Request(`${origin}/api/account/local-email-preview?purpose=verification`), env,
    )
    const { url } = await preview.json() as { url: string }
    const first = await handleOrdinaryAuth(new Request(url, { redirect: 'manual' }), env, 'verify-first')
    const replay = await handleOrdinaryAuth(new Request(url, { redirect: 'manual' }), env, 'verify-replay')
    expect(first.status).toBe(302)
    expect(replay.status).toBe(302)
    expect(migrated.sqlite.prepare('SELECT "emailVerified" emailVerified FROM "user"').get())
      .toEqual({ emailVerified: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM session').get()).toEqual({ count: 0 })

    const wrong = await handleOrdinaryAuth(post('/api/auth/sign-in/email', {
      email: credentials.email, password: 'wrong password value',
    }), env, 'wrong-signin')
    expect(wrong.status).not.toBe(200)
  }, 20_000)

  it('expires stale sessions and keeps private profile reads scoped to the cookie user', async () => {
    await signUpAndVerify()
    const signIn = await handleOrdinaryAuth(post('/api/auth/sign-in/email', credentials), env, 'session-signin')
    const cookie = cookieFrom(signIn)
    const ownProfile = await handleOrdinaryAccount(new Request(
      `${origin}/api/account/profile?authUserId=someone-else`, { headers: { cookie } },
    ), env)
    expect(ownProfile.status).toBe(200)
    expect((await ownProfile.json() as { profile: { email: string } }).profile.email).toBe(credentials.email)

    migrated.sqlite.prepare(`UPDATE session SET "expiresAt" = '2020-01-01T00:00:00.000Z'`).run()
    const expired = await handleOrdinaryAccount(new Request(`${origin}/api/account/profile`, {
      headers: { cookie },
    }), env)
    expect(expired.status).toBe(401)
  }, 20_000)

  it('enforces durable eligibility throttling and same-origin auth mutations', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await handleOrdinaryAccount(post('/api/account/eligibility', {
        birthYear: '2000', attested: true,
      }), env)
      expect(response.status).toBe(200)
    }
    expect((await handleOrdinaryAccount(post('/api/account/eligibility', {
      birthYear: '2000', attested: true,
    }), env)).status).toBe(429)
    expect(migrated.sqlite.prepare(`SELECT count FROM rateLimit
      WHERE key LIKE 'ordinary-eligibility:%'`).get()).toEqual({ count: 10 })

    const crossOrigin = post('/api/auth/sign-in/email', credentials)
    crossOrigin.headers.set('origin', 'https://attacker.example')
    const response = await handleOrdinaryAuth(crossOrigin, env, 'csrf-signin')
    expect(response.status).toBe(403)
  })

  it('consumes one recovery token under concurrency and rejects an expired recovery callback', async () => {
    await signUpAndVerify()
    await handleOrdinaryAuth(post('/api/auth/request-password-reset', {
      email: credentials.email, redirectTo: '/reset-password',
    }), env, 'concurrent-reset-request')
    let preview = await handleOrdinaryAccount(
      new Request(`${origin}/api/account/local-email-preview?purpose=password-reset`), env,
    )
    let { url } = await preview.json() as { url: string }
    let callback = await handleOrdinaryAuth(new Request(url, { redirect: 'manual' }), env, 'concurrent-reset-callback')
    const token = new URL(callback.headers.get('location') as string).searchParams.get('token')
    const results = await Promise.all(['one', 'two'].map((suffix) => handleOrdinaryAuth(post('/api/auth/reset-password', {
      token, newPassword: `new correct horse battery staple ${suffix}`,
    }), env, `concurrent-reset-${suffix}`)))
    expect(results.filter((response) => response.status === 200)).toHaveLength(1)

    await handleOrdinaryAuth(post('/api/auth/request-password-reset', {
      email: credentials.email, redirectTo: '/reset-password',
    }), env, 'expired-reset-request')
    preview = await handleOrdinaryAccount(
      new Request(`${origin}/api/account/local-email-preview?purpose=password-reset`), env,
    )
    ;({ url } = await preview.json() as { url: string })
    migrated.sqlite.prepare(`UPDATE verification SET "expiresAt" = '2020-01-01T00:00:00.000Z'`).run()
    callback = await handleOrdinaryAuth(new Request(url, { redirect: 'manual' }), env, 'expired-reset-callback')
    expect(callback.status).toBe(302)
    expect(new URL(callback.headers.get('location') as string).searchParams.get('error')).toBeTruthy()
  }, 30_000)

  it('fails closed off loopback and rejects cross-origin mutations', async () => {
    const disabled = await handleOrdinaryAuth(new Request('https://hub.example/api/auth/get-session'), env, 'disabled')
    expect(disabled.status).toBe(503)
    const crossOrigin = post('/api/account/eligibility', { birthYear: '2000', attested: true })
    crossOrigin.headers.set('origin', 'https://attacker.example')
    const response = await handleOrdinaryAccount(crossOrigin, env)
    expect(response.status).toBe(403)
    const preview = await handleOrdinaryAccount(
      new Request('https://hub.example/api/account/local-email-preview?purpose=verification'), env,
    )
    expect(preview.status).toBe(503)
  })

  it('keeps the winning user when duplicate signup requests race', async () => {
    const profile = {
      displayName: 'Alex', onboardingPath: 'usa', claimedPosition: 'Adult Leader',
      claimedPositionOther: null, currentOutpostId: null,
      outpostClaim: 'Outpost 12 at Example Church', usaJurisdictionId: 'us-va',
      countryCode: null, internationalSubdivision: null,
    }
    const eligibilityResponses = await Promise.all(['one', 'two'].map(() => handleOrdinaryAccount(
      post('/api/account/eligibility', { birthYear: '2000', attested: true }), env,
    )))
    const eligibilityTokens = await Promise.all(eligibilityResponses.map(async (response) => {
      expect(response.status).toBe(200)
      return ((await response.json()) as { token: string }).token
    }))

    const responses = await Promise.all(eligibilityTokens.map((eligibilityToken, index) => handleOrdinaryAuth(
      post('/api/auth/sign-up/email', { ...credentials, eligibilityToken, profile }),
      env,
      `concurrent-signup-${index}`,
    )))

    expect(responses.map(({ status }) => status)).toEqual([200, 200])
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM "user"').get()).toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM ordinary_account_profiles').get()).toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM account').get()).toEqual({ count: 1 })
  }, 30_000)

  it('normalizes duplicate signup identity without exposing an account-exists error', async () => {
    await signUpOnly()
    const eligibility = await handleOrdinaryAccount(post('/api/account/eligibility', {
      birthYear: '2000', attested: true,
    }), env)
    const { token } = await eligibility.json() as { token: string }
    const duplicate = await handleOrdinaryAuth(post('/api/auth/sign-up/email', {
      email: '  ALEX@EXAMPLE.TEST ', password: credentials.password, eligibilityToken: token,
      profile: {
        displayName: 'Another Alex', onboardingPath: 'usa', claimedPosition: 'Adult Leader',
        claimedPositionOther: null, currentOutpostId: null, outpostClaim: 'Private claim',
        usaJurisdictionId: 'us-va', countryCode: null, internationalSubdivision: null,
      },
    }), env, 'normalized-duplicate')
    expect(duplicate.status).toBe(200)
    expect(JSON.stringify(await duplicate.json())).not.toMatch(/already|exists|duplicate/i)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM "user"').get()).toEqual({ count: 1 })
  }, 20_000)

  it('returns private lifecycle status, renews once, and blocks expired sessions and profile routes', async () => {
    await signUpAndVerify()
    let signIn = await handleOrdinaryAuth(post('/api/auth/sign-in/email', credentials), env, 'lifecycle-signin')
    const cookie = cookieFrom(signIn)
    const status = await handleOrdinaryAccount(new Request(`${origin}/api/account/lifecycle`, {
      headers: { cookie },
    }), env)
    expect(status.status).toBe(200)
    const lifecycle = await status.json() as { lifecycle: { accessDueAt: string; version: number } }

    const renewed = await handleOrdinaryAccount(post('/api/account/renew', {
      expectedVersion: lifecycle.lifecycle.version,
      idempotencyKey: 'http-renewal-request-0001',
    }, cookie), env)
    expect(renewed.status).toBe(200)
    const renewedPayload = await renewed.json() as { lifecycle: { accessDueAt: string } }
    expect(Date.parse(renewedPayload.lifecycle.accessDueAt)).toBeGreaterThan(Date.parse(lifecycle.lifecycle.accessDueAt))

    const user = migrated.sqlite.prepare('SELECT id FROM "user" LIMIT 1').get() as { id: string }
    migrated.sqlite.prepare(`UPDATE ordinary_account_lifecycles SET
      activated_at = '2025-01-01T00:00:00.000Z', term_base_at = '2025-01-01T00:00:00.000Z',
      access_due_at = '2026-01-01T00:00:00.000Z',
      notice_open_at = '2025-12-01T00:00:00.000Z',
      state = 'active', confirmed_delivery_at = NULL, deletion_due_at = NULL,
      updated_at = '2026-01-01T00:00:00.000Z', version = version + 1 WHERE auth_user_id = ?`).run(user.id)

    const sessionSummary = await handleOrdinaryAccount(new Request(`${origin}/api/account/session`, {
      headers: { cookie },
    }), env)
    const endedSession = await sessionSummary.json() as Record<string, unknown>
    expect(endedSession).toEqual({ authenticated: false, lifecycleState: 'expired' })
    expect(endedSession).not.toHaveProperty('displayName')
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM session WHERE "userId" = ?').get(user.id))
      .toEqual({ count: 0 })
    const explanation = await handleOrdinaryAccount(new Request(`${origin}/api/account/lifecycle`, {
      headers: { cookie },
    }), env)
    expect(explanation.status).toBe(401)
    const directSession = await handleOrdinaryAuth(new Request(`${origin}/api/auth/get-session`, {
      headers: { cookie },
    }), env, 'expired-direct-session')
    expect(await directSession.json()).toBeNull()
    const blockedProfile = await handleOrdinaryAccount(new Request(`${origin}/api/account/profile`, {
      headers: { cookie },
    }), env)
    expect(blockedProfile.status).toBe(401)
    const blockedRenewal = await handleOrdinaryAccount(post('/api/account/renew', {
      expectedVersion: 3,
      idempotencyKey: 'late-http-renewal-request',
    }, cookie), env)
    expect(blockedRenewal.status).toBe(401)
    const wrongCredentials = await handleOrdinaryAuth(post('/api/auth/sign-in/email', {
      email: credentials.email,
      password: 'wrong password value',
    }), env, 'expired-wrong-password')
    signIn = await handleOrdinaryAuth(post('/api/auth/sign-in/email', credentials), env, 'expired-signin')
    expect(signIn.status).toBe(401)
    expect(signIn.status).toBe(wrongCredentials.status)
    expect(await signIn.json()).toEqual(await wrongCredentials.json())
    const expiredRecovery = await handleOrdinaryAuth(post('/api/auth/request-password-reset', {
      email: credentials.email,
      redirectTo: '/reset-password',
    }), env, 'expired-recovery')
    const missingRecovery = await handleOrdinaryAuth(post('/api/auth/request-password-reset', {
      email: 'missing@example.test',
      redirectTo: '/reset-password',
    }), env, 'missing-recovery-after-expiry')
    expect(expiredRecovery.status).toBe(200)
    expect(await expiredRecovery.json()).toEqual(await missingRecovery.json())
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM verification').get())
      .toEqual({ count: 0 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM session WHERE "userId" = ?').get(user.id))
      .toEqual({ count: 0 })
  }, 30_000)

  it('allows the same email to complete a wholly new signup only after guarded deletion', async () => {
    await signUpAndVerify()
    const original = migrated.sqlite.prepare('SELECT id FROM "user"').get() as { id: string }
    migrated.sqlite.prepare(`UPDATE ordinary_account_lifecycles SET
      state = 'expired', confirmed_delivery_at = '2026-01-01T00:00:00.000Z',
      deletion_due_at = '2026-07-01T00:00:00.000Z', expired_at = '2026-02-01T00:00:00.000Z',
      updated_at = '2026-07-01T00:00:00.000Z', version = version + 1 WHERE auth_user_id = ?`).run(original.id)
    migrated.sqlite.prepare(`INSERT INTO maintenance_runs
      (id, trigger_type, dispatcher_rule_version, status, started_at, operator_tenure_id)
      VALUES ('new-signup-after-delete-run', 'local-test', 'maintenance-dispatcher-v1', 'running',
        '2026-07-01T00:00:00.000Z', NULL)`).run()
    expect(await deleteDueOrdinaryAccount(
      migrated.db, original.id, 'new-signup-after-delete-run', '2026-07-01T00:00:00.000Z',
    )).toBe(true)
    expect((await handleOrdinaryAuth(post('/api/auth/sign-in/email', credentials), env, 'deleted-signin')).status)
      .not.toBe(200)

    await signUpAndVerify(credentials, 'replacement-signup')
    const replacement = migrated.sqlite.prepare('SELECT id FROM "user"').get() as { id: string }
    expect(replacement.id).not.toBe(original.id)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM ordinary_account_profiles').get())
      .toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM ordinary_adult_eligibility').get())
      .toEqual({ count: 1 })
  }, 30_000)
})
