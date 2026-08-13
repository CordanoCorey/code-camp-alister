import { createEligibilityChallenge } from './account-eligibility'
import {
  getOrdinaryProfile,
  listOrdinaryOutpostMatches,
  updateOrdinaryProfile,
} from './account-profile-repository'
import { consumeLocalEmailPreview, type AuthEmailPurpose } from './auth-email'
import {
  ordinaryAuthConfiguration,
  ordinarySessionWithLifecycle,
  type OrdinaryAuthEnv,
} from './ordinary-auth'
import { renewOrdinaryAccount } from './ordinary-account-lifecycle-repository'
import { sha256 } from './sha256'

const ELIGIBILITY_ACTION = 'adult-account-eligibility'
const MAX_BODY_BYTES = 16_384

class AccountRequestError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': 'private, no-store',
      pragma: 'no-cache',
      'referrer-policy': 'no-referrer',
    },
  })
}

async function readBody(request: Request) {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new AccountRequestError('Request body is too large.', 413)
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new AccountRequestError('Request body is too large.', 413)
  try {
    const value = JSON.parse(text) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    return value as Record<string, unknown>
  } catch {
    throw new AccountRequestError('Request body must be a JSON object.')
  }
}

function sameOrigin(request: Request, origin: string) {
  return request.headers.get('origin') === origin
}

async function applyEligibilityRateLimit(request: Request, env: OrdinaryAuthEnv, secret: string) {
  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'local-loopback'
  const key = `ordinary-eligibility:${await sha256(`${secret}:${clientAddress}`)}`
  const now = Date.now()
  const cutoff = now - 60 * 60 * 1_000
  await env.DB.prepare(`INSERT OR IGNORE INTO rateLimit (id, key, count, lastRequest)
    VALUES (?, ?, 0, 0)`)
    .bind(`app-${key}`, key).run()
  const result = await env.DB.prepare(`UPDATE rateLimit
    SET count = CASE WHEN lastRequest < ? THEN 1 ELSE count + 1 END, lastRequest = ?
    WHERE key = ? AND (lastRequest < ? OR count < 10)`)
    .bind(cutoff, now, key, cutoff).run()
  if ((result.meta.changes ?? 0) !== 1) throw new AccountRequestError('Too many attempts. Wait before trying again.', 429)
}

async function verifyTurnstile(token: unknown, env: OrdinaryAuthEnv, hostnames: string[]) {
  if (typeof token !== 'string' || token.length < 1 || token.length > 2_048) {
    throw new AccountRequestError('Complete the human-verification check and try again.')
  }
  const form = new FormData()
  form.set('secret', env.TURNSTILE_SECRET_KEY as string)
  form.set('response', token)
  form.set('idempotency_key', crypto.randomUUID())
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: form, signal: controller.signal,
    })
    if (!response.ok) throw new Error('unavailable')
    const result = await response.json() as { success?: unknown; hostname?: unknown; action?: unknown }
    if (result.success !== true || result.action !== ELIGIBILITY_ACTION
      || typeof result.hostname !== 'string' || !hostnames.includes(result.hostname.toLowerCase())) {
      throw new Error('rejected')
    }
  } catch {
    throw new AccountRequestError('Human verification failed. Try a fresh check.')
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function ordinaryAccountContext(request: Request, env: OrdinaryAuthEnv) {
  const current = await ordinarySessionWithLifecycle(request, env)
  const user = current?.session.user
  if (!user || !user.emailVerified) return null
  const lifecycle = current.lifecycle
  const profile = lifecycle?.state === 'expired' ? null : await getOrdinaryProfile(env.DB, user.id)
  return lifecycle ? { user, profile, lifecycle } : null
}

export async function handleOrdinaryAccount(request: Request, env: OrdinaryAuthEnv): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const configuration = ordinaryAuthConfiguration(request, env)

  try {
    if (request.method === 'GET' && path === '/api/account/config') {
      return json({
        enabled: configuration.enabled,
        signupEnabled: configuration.enabled,
        localPreview: configuration.localPreview,
        siteKey: configuration.turnstileSiteKey,
        action: ELIGIBILITY_ACTION,
      })
    }
    if (!configuration.enabled) throw new AccountRequestError('Ordinary accounts are not configured on this host.', 503)

    if (request.method === 'POST' && path === '/api/account/eligibility') {
      if (!sameOrigin(request, configuration.origin)) throw new AccountRequestError('Same-origin request required.', 403)
      const body = await readBody(request)
      const allowedKeys = new Set(['birthYear', 'attested', 'challengeToken'])
      if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
        throw new AccountRequestError('Only the adult-eligibility fields are accepted at this step.')
      }
      await applyEligibilityRateLimit(request, env, configuration.secret)
      if (!configuration.localPreview) {
        await verifyTurnstile(body.challengeToken, env, configuration.turnstileHostnames)
      }
      return json(await createEligibilityChallenge(env.DB, {
        birthYear: body.birthYear,
        attested: body.attested,
      }))
    }

    if (request.method === 'GET' && path === '/api/account/local-email-preview') {
      if (!configuration.localPreview) throw new AccountRequestError('Not found.', 404)
      const purpose = url.searchParams.get('purpose')
      if (purpose !== 'verification' && purpose !== 'password-reset' && purpose !== 'renewal-warning') {
        throw new AccountRequestError('Choose a preview purpose.')
      }
      const previewUrl = await consumeLocalEmailPreview(env.DB, purpose as AuthEmailPurpose)
      return previewUrl ? json({ url: previewUrl }) : json({ error: 'No unused local email preview is ready.' }, 404)
    }

    if (request.method === 'GET' && path === '/api/account/session') {
      const sessionContext = await ordinarySessionWithLifecycle(request, env)
      const user = sessionContext?.session.user
      if (!user) return json({ authenticated: false })
      if (sessionContext.lifecycle?.state === 'expired') {
        return json({ authenticated: false, lifecycleState: 'expired' })
      }
      const profile = user.emailVerified ? await getOrdinaryProfile(env.DB, user.id) : null
      return json({
        authenticated: true,
        emailVerified: user.emailVerified,
        displayName: profile?.displayName ?? user.name,
        profileReady: Boolean(profile),
        lifecycleState: sessionContext.lifecycle?.state,
      })
    }

    if (request.method === 'GET' && path === '/api/account/lifecycle') {
      const current = await ordinaryAccountContext(request, env)
      if (!current) throw new AccountRequestError('Verified sign-in required.', 401)
      return json({ lifecycle: current.lifecycle })
    }

    if (request.method === 'POST' && path === '/api/account/renew') {
      if (!sameOrigin(request, configuration.origin)) throw new AccountRequestError('Same-origin request required.', 403)
      const current = await ordinaryAccountContext(request, env)
      if (!current) throw new AccountRequestError('Verified sign-in required.', 401)
      if (current.lifecycle.state === 'expired') throw new AccountRequestError('This Account has expired and cannot be renewed.', 423)
      const body = await readBody(request)
      if (typeof body.idempotencyKey !== 'string') throw new AccountRequestError('A renewal request key is required.')
      const lifecycle = await renewOrdinaryAccount(
        env.DB,
        current.user.id,
        Number(body.expectedVersion),
        body.idempotencyKey,
        new Date().toISOString(),
      )
      return json({ lifecycle })
    }

    if (request.method === 'GET' && path === '/api/account/profile') {
      const current = await ordinaryAccountContext(request, env)
      if (!current) throw new AccountRequestError('Verified sign-in required.', 401)
      if (current.lifecycle.state === 'expired') throw new AccountRequestError('This Account has expired. Public browsing remains available.', 423)
      if (!current.profile) throw new AccountRequestError('Verified sign-in required.', 401)
      return json({ profile: current.profile })
    }

    if (request.method === 'PUT' && path === '/api/account/profile') {
      if (!sameOrigin(request, configuration.origin)) throw new AccountRequestError('Same-origin request required.', 403)
      const current = await ordinaryAccountContext(request, env)
      if (!current) throw new AccountRequestError('Verified sign-in required.', 401)
      if (current.lifecycle.state === 'expired') throw new AccountRequestError('This Account has expired. Public browsing remains available.', 423)
      if (!current.profile) throw new AccountRequestError('Verified sign-in required.', 401)
      const body = await readBody(request)
      const profile = await updateOrdinaryProfile(
        env.DB, current.user.id, body.profile, body.expectedVersion, new Date().toISOString(),
      )
      return json({ profile })
    }

    if (request.method === 'GET' && path === '/api/account/outposts') {
      if (url.searchParams.get('context') === 'profile') {
        const current = await ordinaryAccountContext(request, env)
        if (!current) throw new AccountRequestError('Verified sign-in required.', 401)
        if (current.lifecycle.state === 'expired') throw new AccountRequestError('This Account has expired. Public browsing remains available.', 423)
      }
      return json({ items: await listOrdinaryOutpostMatches(env.DB, {
        onboardingPath: url.searchParams.get('path'),
        scope: url.searchParams.get('scope'),
        query: url.searchParams.get('q'),
      }) })
    }

    throw new AccountRequestError('Not found.', 404)
  } catch (error) {
    if (error instanceof AccountRequestError) return json({ error: error.message }, error.status)
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('This private profile changed')) return json({ error: message }, 409)
    if (/^(Reload the Account page|Account details|Adult accounts|Confirm that you are at least 18|Choose |Other position|Current Outpost|Outpost association|Display Name|International subdivision)/.test(message)) {
      return json({ error: message }, 400)
    }
    return json({ error: 'The private account request could not be completed.' }, 503)
  }
}
