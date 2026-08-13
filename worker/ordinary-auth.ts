import { betterAuth } from 'better-auth'
import { validateOrdinaryProfileInput, type ValidatedOrdinaryProfile } from '../shared/account'
import {
  invalidateEligibilityReservation,
  releaseEligibilityReservation,
  reserveEligibilityChallenge,
} from './account-eligibility'
import { activateOrdinaryProfile, createPendingOrdinaryProfile } from './account-profile-repository'
import {
  ensureOrdinaryAccountLifecycle,
  peekOrdinaryAccountLifecycleStatus,
} from './ordinary-account-lifecycle-repository'
import {
  deliverAuthEmail,
  type AuthEmailConfiguration,
  type OrdinaryAuthEmailEnv,
} from './auth-email'

export type OrdinaryAuthEnv = OrdinaryAuthEmailEnv & {
  DB: D1Database
  AUTH_SECRET?: string
  AUTH_CANONICAL_ORIGIN?: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_EXPECTED_HOSTNAMES?: string
  ORDINARY_ACCOUNT_LIFECYCLE_ENABLED?: string
}

export type OrdinaryAuthConfiguration = {
  enabled: boolean
  localPreview: boolean
  origin: string
  turnstileSiteKey: string | null
  turnstileHostnames: string[]
  secret: string
  email: AuthEmailConfiguration | null
}

function exactLoopback(url: URL) {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
}

function canonicalOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' && url.origin === value?.replace(/\/$/, '') && url.pathname === '/'
      ? url.origin
      : null
  } catch {
    return null
  }
}

export function ordinaryAuthConfiguration(request: Request, env: OrdinaryAuthEnv): OrdinaryAuthConfiguration {
  const url = new URL(request.url)
  const secret = env.AUTH_SECRET?.trim() ?? ''
  const localPreview = exactLoopback(url)
    && env.LOCAL_AUTH_EMAIL_PREVIEW === 'true'
    && secret.length >= 32
  const configuredOrigin = canonicalOrigin(env.AUTH_CANONICAL_ORIGIN)
  const turnstileHostnames = (env.TURNSTILE_EXPECTED_HOSTNAMES ?? '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  const production = Boolean(
    configuredOrigin === url.origin
    && secret.length >= 32
    && env.AUTH_EMAIL_PROVIDER === 'resend'
    && env.AUTH_EMAIL_FROM?.trim()
    && env.RESEND_API_KEY?.trim()
    && env.TURNSTILE_SITE_KEY?.trim()
    && env.TURNSTILE_SECRET_KEY?.trim()
    && env.ORDINARY_ACCOUNT_LIFECYCLE_ENABLED === 'true'
    && turnstileHostnames.includes(url.hostname.toLowerCase()),
  )
  return {
    enabled: localPreview || production,
    localPreview,
    origin: localPreview ? url.origin : configuredOrigin ?? url.origin,
    turnstileSiteKey: production ? env.TURNSTILE_SITE_KEY!.trim() : null,
    turnstileHostnames,
    secret,
    email: localPreview
      ? { mode: 'local-preview' }
      : production
        ? { mode: 'resend', sender: env.AUTH_EMAIL_FROM!.trim(), apiKey: env.RESEND_API_KEY!.trim() }
        : null,
  }
}

function privateResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'private, no-store')
  headers.set('pragma', 'no-cache')
  headers.set('referrer-policy', 'no-referrer')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function unavailable() {
  return Response.json(
    { error: 'Ordinary account signup and sign-in are not configured on this host.' },
    { status: 503, headers: { 'cache-control': 'private, no-store' } },
  )
}

function credentialFailure() {
  return Response.json(
    { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password.' },
    { status: 401 },
  )
}

function passwordResetRequestAccepted() {
  return Response.json({
    status: true,
    message: 'If this email exists in our system, check your email for the reset link',
  })
}

function sameOrigin(request: Request, configuration: OrdinaryAuthConfiguration) {
  if (request.method === 'GET' || request.method === 'HEAD') return true
  return request.headers.get('origin') === configuration.origin
}

function createOrdinaryAuth(env: OrdinaryAuthEnv, configuration: OrdinaryAuthConfiguration) {
  if (!configuration.email) throw new Error('Ordinary authentication is unavailable.')
  const email = configuration.email
  return betterAuth({
    database: env.DB,
    baseURL: configuration.origin,
    basePath: '/api/auth',
    secret: configuration.secret,
    trustedOrigins: [configuration.origin],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3_600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await deliverAuthEmail(env.DB, email, {
          authUserId: user.id, to: user.email, url, purpose: 'password-reset',
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 3_600,
      sendVerificationEmail: async ({ user, url }) => {
        await deliverAuthEmail(env.DB, email, {
          authUserId: user.id, to: user.email, url, purpose: 'verification',
        })
      },
      afterEmailVerification: async (user) => {
        await activateOrdinaryProfile(env.DB, user.id, new Date().toISOString())
      },
    },
    verification: { storeIdentifier: 'hashed' },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const now = new Date().toISOString()
            await activateOrdinaryProfile(env.DB, session.userId, now)
            const lifecycle = await ensureOrdinaryAccountLifecycle(env.DB, session.userId, now)
            return Boolean(lifecycle && lifecycle.state !== 'expired')
          },
        },
        update: {
          before: async (session) => {
            if (typeof session.userId !== 'string') return true
            await peekOrdinaryAccountLifecycleStatus(env.DB, session.userId)
            // Reading the session remains possible long enough to return the
            // generic expired-Account explanation. The D1 update trigger still
            // rejects any rolling update that would extend an expired session.
            return true
          },
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 20,
      customRules: {
        '/sign-up/email': { window: 60 * 60, max: 5 },
        '/sign-in/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60 * 60, max: 5 },
        '/reset-password': { window: 60 * 60, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: !configuration.localPreview,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
  })
}

function cleanedSignupRequest(request: Request, body: Record<string, unknown>, profile: ValidatedOrdinaryProfile) {
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  return new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: profile.displayName,
      email: typeof body.email === 'string' ? body.email.trim() : body.email,
      password: body.password,
      callbackURL: '/sign-in?verified=true',
    }),
  })
}

async function handleSignup(
  request: Request,
  env: OrdinaryAuthEnv,
  configuration: OrdinaryAuthConfiguration,
  requestId: string,
) {
  let body: Record<string, unknown>
  let profile: ValidatedOrdinaryProfile
  try {
    body = await request.clone().json() as Record<string, unknown>
    profile = validateOrdinaryProfileInput(body.profile)
  } catch (signupError) {
    return Response.json(
      { error: signupError instanceof Error ? signupError.message : 'Check the account details.' },
      { status: 400 },
    )
  }

  const normalizedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  let reservation: Awaited<ReturnType<typeof reserveEligibilityChallenge>>
  try {
    reservation = await reserveEligibilityChallenge(env.DB, body.eligibilityToken, requestId)
  } catch (eligibilityError) {
    return Response.json(
      { error: eligibilityError instanceof Error ? eligibilityError.message : 'Complete the adult-eligibility step again.' },
      { status: 400 },
    )
  }

  const auth = createOrdinaryAuth(env, configuration)
  let response: Response
  try {
    response = await auth.handler(cleanedSignupRequest(request, body, profile))
  } catch {
    response = Response.json({ error: 'Account creation could not be completed.' }, { status: 503 })
  }

  if (!response.ok) {
    const concurrentUser = normalizedEmail
      ? await env.DB.prepare('SELECT id FROM "user" WHERE lower(trim(email)) = ? LIMIT 1')
        .bind(normalizedEmail).first<{ id: string }>()
      : null
    if (!concurrentUser) {
      await releaseEligibilityReservation(env.DB, requestId)
      return privateResponse(response)
    }
    await invalidateEligibilityReservation(env.DB, requestId)
    const now = new Date().toISOString()
    return Response.json({
      token: null,
      user: {
        id: crypto.randomUUID(),
        name: profile.displayName,
        email: normalizedEmail,
        emailVerified: false,
        image: null,
        createdAt: now,
        updatedAt: now,
      },
    })
  }

  const payload = await response.clone().json().catch(() => null) as { user?: { id?: unknown } } | null
  const authUserId = typeof payload?.user?.id === 'string' ? payload.user.id : ''
  const createdUser = authUserId && normalizedEmail
    ? await env.DB.prepare('SELECT id FROM "user" WHERE id = ? AND lower(trim(email)) = ?')
      .bind(authUserId, normalizedEmail).first<{ id: string }>()
    : null
  if (!createdUser) {
    await invalidateEligibilityReservation(env.DB, requestId)
    return privateResponse(response)
  }
  try {
    await createPendingOrdinaryProfile(env.DB, {
      authUserId,
      eligibilityChallengeId: reservation.id,
      reservationRequestId: reservation.requestId,
      profile,
      now: new Date().toISOString(),
    })
  } catch {
    await env.DB.prepare(`DELETE FROM "user" WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM ordinary_account_profiles profile WHERE profile.auth_user_id = "user".id)`)
      .bind(authUserId).run()
    await invalidateEligibilityReservation(env.DB, requestId)
    return Response.json({ error: 'Account creation could not be completed.' }, { status: 503 })
  }
  return privateResponse(response)
}

const allowedAuthRoutes = [
  ['POST', '/api/auth/sign-up/email'],
  ['POST', '/api/auth/sign-in/email'],
  ['POST', '/api/auth/sign-out'],
  ['GET', '/api/auth/get-session'],
  ['POST', '/api/auth/request-password-reset'],
  ['POST', '/api/auth/reset-password'],
  ['POST', '/api/auth/send-verification-email'],
] as const

export async function handleOrdinaryAuth(request: Request, env: OrdinaryAuthEnv, requestId: string) {
  const configuration = ordinaryAuthConfiguration(request, env)
  if (!configuration.enabled) return unavailable()
  if (!sameOrigin(request, configuration)) {
    return Response.json({ error: 'Same-origin request required.' }, { status: 403 })
  }
  const path = new URL(request.url).pathname
  const callbackRoute = request.method === 'GET'
    && (path === '/api/auth/verify-email' || path.startsWith('/api/auth/reset-password/'))
  if (!callbackRoute && !allowedAuthRoutes.some(([method, allowedPath]) => method === request.method && allowedPath === path)) {
    return Response.json({ error: 'Not found.' }, { status: 404 })
  }
  if (request.method === 'POST' && path === '/api/auth/sign-up/email') {
    return privateResponse(await handleSignup(request, env, configuration, requestId))
  }
  if (request.method === 'GET' && path === '/api/auth/get-session') {
    const current = await ordinarySessionWithLifecycle(request, env)
    return privateResponse(Response.json(current?.lifecycle?.state === 'expired' ? null : current?.session ?? null))
  }
  const auth = createOrdinaryAuth(env, configuration)
  try {
    const response = await auth.handler(request)
    if (request.method === 'POST' && path === '/api/auth/request-password-reset'
      && response.status !== 429) {
      return privateResponse(passwordResetRequestAccepted())
    }
    if (request.method === 'POST' && path === '/api/auth/sign-in/email'
      && !response.ok && response.status !== 429) {
      return privateResponse(credentialFailure())
    }
    return privateResponse(response)
  } catch (error) {
    if (request.method === 'POST' && path === '/api/auth/request-password-reset') {
      return privateResponse(passwordResetRequestAccepted())
    }
    if (request.method === 'POST' && path === '/api/auth/sign-in/email') {
      return privateResponse(credentialFailure())
    }
    throw error
  }
}

export function ordinaryAuthForRequest(request: Request, env: OrdinaryAuthEnv) {
  const configuration = ordinaryAuthConfiguration(request, env)
  if (!configuration.enabled) return null
  return createOrdinaryAuth(env, configuration)
}

export async function ordinarySessionWithLifecycle(request: Request, env: OrdinaryAuthEnv) {
  const auth = ordinaryAuthForRequest(request, env)
  if (!auth) return null
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableRefresh: true },
  })
  if (!session) return null
  if (!session.user.emailVerified) return { session, lifecycle: null }
  const now = new Date().toISOString()
  await activateOrdinaryProfile(env.DB, session.user.id, now, false)
  const lifecycle = await ensureOrdinaryAccountLifecycle(env.DB, session.user.id, now)
  return { session, lifecycle }
}
