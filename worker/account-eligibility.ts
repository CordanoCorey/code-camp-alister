import { validateAdultAccountEligibility } from '../shared/account'
import { sha256 } from './sha256'

const CHALLENGE_LIFETIME_MILLISECONDS = 20 * 60 * 1_000

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function tokenParts(token: unknown) {
  if (typeof token !== 'string' || token.length > 200) throw new Error('The adult-eligibility check has expired. Start that step again.')
  const separator = token.indexOf('.')
  const id = token.slice(0, separator)
  const secret = token.slice(separator + 1)
  if (separator < 1 || id.length > 80 || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    throw new Error('The adult-eligibility check has expired. Start that step again.')
  }
  return { id, secret }
}

export async function createEligibilityChallenge(
  db: D1Database,
  input: { birthYear: unknown; attested: unknown },
  now = new Date(),
) {
  const result = validateAdultAccountEligibility(input.birthYear, input.attested, now)
  const secretBytes = crypto.getRandomValues(new Uint8Array(32))
  const secret = base64Url(secretBytes)
  const id = crypto.randomUUID()
  await db.prepare(`INSERT INTO ordinary_account_eligibility_challenges
    (id, secret_hash, confirmed_at, attestation_version, expires_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(
      id,
      await sha256(secret),
      result.confirmedAt,
      result.attestationVersion,
      new Date(now.valueOf() + CHALLENGE_LIFETIME_MILLISECONDS).toISOString(),
    )
    .run()
  return { token: `${id}.${secret}`, expiresAt: new Date(now.valueOf() + CHALLENGE_LIFETIME_MILLISECONDS).toISOString() }
}

export async function reserveEligibilityChallenge(
  db: D1Database,
  token: unknown,
  requestId: string,
  now = new Date(),
) {
  const { id, secret } = tokenParts(token)
  const result = await db.prepare(`UPDATE ordinary_account_eligibility_challenges
    SET reserved_at = ?, reserved_request_id = ?
    WHERE id = ? AND secret_hash = ? AND expires_at > ?
      AND reserved_at IS NULL AND consumed_at IS NULL`)
    .bind(now.toISOString(), requestId, id, await sha256(secret), now.toISOString())
    .run()
  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('The adult-eligibility check has expired or was already used. Start that step again.')
  }
  return { id, requestId }
}

export async function releaseEligibilityReservation(db: D1Database, requestId: string) {
  await db.prepare(`UPDATE ordinary_account_eligibility_challenges
    SET reserved_at = NULL, reserved_request_id = NULL
    WHERE reserved_request_id = ? AND consumed_at IS NULL`)
    .bind(requestId)
    .run()
}

export async function invalidateEligibilityReservation(db: D1Database, requestId: string) {
  await db.prepare(`DELETE FROM ordinary_account_eligibility_challenges
    WHERE reserved_request_id = ? AND consumed_at IS NULL`)
    .bind(requestId)
    .run()
}
