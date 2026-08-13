import { createRemoteJWKSet, jwtVerify } from 'jose'
import { normalizeAccessEmail } from '../shared/operator-lifecycle'

export type AccessIdentityEnv = {
  LOCAL_OPERATOR_PREVIEW?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_POLICY_AUD?: string
}

export type AccessIdentity = {
  email: string
  subject: string
  issuedAt: number
  notBefore: number
  expiresAt: number
  localPreview: boolean
}

let cachedAccessKeys: {
  teamDomain: string
  keys: ReturnType<typeof createRemoteJWKSet>
} | undefined

function accessKeysFor(teamDomain: string) {
  if (cachedAccessKeys?.teamDomain !== teamDomain) {
    cachedAccessKeys = {
      teamDomain,
      keys: createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)),
    }
  }
  return cachedAccessKeys.keys
}

function isExactLoopback(request: Request) {
  const hostname = new URL(request.url).hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export async function verifyAccessIdentity(
  request: Request,
  env: AccessIdentityEnv,
  now = new Date(),
): Promise<AccessIdentity> {
  if (env.LOCAL_OPERATOR_PREVIEW === 'true' && isExactLoopback(request)) {
    const issuedAt = Math.floor(now.valueOf() / 1_000)
    return {
      email: 'local-preview@operator.invalid',
      subject: 'local-operator-preview',
      issuedAt,
      notBefore: issuedAt,
      expiresAt: issuedAt + 300,
      localPreview: true,
    }
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.replace(/\/$/, '')
  const audience = env.ACCESS_POLICY_AUD
  if (!token || !teamDomain || !audience || !teamDomain.startsWith('https://')) {
    throw new Error('Access identity is unavailable.')
  }

  const { payload } = await jwtVerify(token, accessKeysFor(teamDomain), {
    algorithms: ['RS256'],
    issuer: teamDomain,
    audience,
    requiredClaims: ['email', 'sub', 'iat', 'nbf', 'exp'],
  })
  if (
    typeof payload.sub !== 'string' || !payload.sub
    || typeof payload.iat !== 'number'
    || typeof payload.nbf !== 'number'
    || typeof payload.exp !== 'number'
  ) {
    throw new Error('Access identity claims are invalid.')
  }
  return {
    email: normalizeAccessEmail(payload.email),
    subject: payload.sub,
    issuedAt: payload.iat,
    notBefore: payload.nbf,
    expiresAt: payload.exp,
    localPreview: false,
  }
}
