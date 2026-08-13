import {
  validateOrdinaryProfileInput,
  type OrdinaryAccountProfile,
  type ValidatedOrdinaryProfile,
} from '../shared/account'
import { ensureOrdinaryAccountLifecycle } from './ordinary-account-lifecycle-repository'

type ProfileRow = {
  auth_user_id: string
  activation_state: string
  display_name: string
  onboarding_path: 'usa' | 'international'
  claimed_position: ValidatedOrdinaryProfile['claimedPosition']
  claimed_position_other: string | null
  current_outpost_id: string | null
  outpost_claim: string | null
  usa_jurisdiction_id: string | null
  country_code: string | null
  international_subdivision: string | null
  created_at: string
  updated_at: string
  version: number
  email: string
  email_verified: number
  eligibility_confirmed: number | null
  eligibility_confirmed_at: string | null
  attestation_version: string | null
  outpost_title: string | null
  external_number: string | null
  city: string | null
  jurisdiction: string | null
  fcf_activity_status: string | null
}

export type OutpostMatch = {
  id: string
  title: string
  church: string
  externalNumber: string | null
  city: string
  jurisdiction: string
}

export async function createPendingOrdinaryProfile(
  db: D1Database,
  input: {
    authUserId: string
    eligibilityChallengeId: string
    reservationRequestId: string
    profile: ValidatedOrdinaryProfile
    now: string
  },
) {
  const profile = input.profile
  await db.batch([
    db.prepare(`UPDATE ordinary_account_eligibility_challenges
      SET consumed_at = ?, consumed_auth_user_id = ?
      WHERE id = ? AND reserved_request_id = ? AND consumed_at IS NULL AND expires_at > ?`)
      .bind(input.now, input.authUserId, input.eligibilityChallengeId, input.reservationRequestId, input.now),
    db.prepare(`INSERT INTO ordinary_account_profiles
      (auth_user_id, activation_state, eligibility_challenge_id, display_name, onboarding_path,
       claimed_position, claimed_position_other, current_outpost_id, outpost_claim,
       usa_jurisdiction_id, country_code, international_subdivision, created_at, updated_at, version)
      SELECT ?, 'pending-verification', id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
      FROM ordinary_account_eligibility_challenges
      WHERE id = ? AND reserved_request_id = ? AND consumed_auth_user_id = ?`)
      .bind(
        input.authUserId,
        profile.displayName,
        profile.onboardingPath,
        profile.claimedPosition,
        profile.claimedPositionOther,
        profile.currentOutpostId,
        profile.outpostClaim,
        profile.usaJurisdictionId,
        profile.countryCode,
        profile.internationalSubdivision,
        input.now,
        input.now,
        input.eligibilityChallengeId,
        input.reservationRequestId,
        input.authUserId,
      ),
  ])
  const created = await db.prepare('SELECT auth_user_id FROM ordinary_account_profiles WHERE auth_user_id = ?')
    .bind(input.authUserId).first<{ auth_user_id: string }>()
  if (!created) throw new Error('The private account profile could not be created.')
}

export async function activateOrdinaryProfile(
  db: D1Database,
  authUserId: string,
  now: string,
  enforceLifecycle = true,
) {
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO ordinary_adult_eligibility
      (auth_user_id, confirmed, confirmed_at, attestation_version)
      SELECT profile.auth_user_id, 1, challenge.confirmed_at, challenge.attestation_version
      FROM ordinary_account_profiles profile
      JOIN ordinary_account_eligibility_challenges challenge ON challenge.id = profile.eligibility_challenge_id
      JOIN "user" auth_user ON auth_user.id = profile.auth_user_id
      WHERE profile.auth_user_id = ? AND challenge.consumed_auth_user_id = profile.auth_user_id
        AND auth_user."emailVerified" = 1`)
      .bind(authUserId),
    db.prepare(`UPDATE ordinary_account_profiles
      SET activation_state = 'active', activated_at = ?, updated_at = ?, version = version + 1
      WHERE auth_user_id = ? AND activation_state = 'pending-verification'
        AND EXISTS (SELECT 1 FROM ordinary_adult_eligibility eligibility
          WHERE eligibility.auth_user_id = ordinary_account_profiles.auth_user_id)`)
      .bind(now, now, authUserId),
  ])
  if (enforceLifecycle) await ensureOrdinaryAccountLifecycle(db, authUserId, now)
}

async function affiliations(db: D1Database, outpostId: string) {
  const { results } = await db.prepare(`SELECT affiliation.affiliation_type, unit.name
    FROM outpost_affiliations affiliation
    JOIN organization_units unit ON unit.id = affiliation.organization_id
    WHERE affiliation.outpost_id = ?`)
    .bind(outpostId).all<{ affiliation_type: string; name: string }>()
  return new Map(results.map((row) => [row.affiliation_type, row.name]))
}

export async function getOrdinaryProfile(db: D1Database, authUserId: string): Promise<OrdinaryAccountProfile | null> {
  const row = await db.prepare(`SELECT
      profile.*, auth_user.email, auth_user."emailVerified" email_verified,
      eligibility.confirmed eligibility_confirmed, eligibility.confirmed_at eligibility_confirmed_at,
      eligibility.attestation_version,
      content.title outpost_title, outpost.external_number, outpost.city,
      geography.name jurisdiction, outpost.fcf_activity_status
    FROM ordinary_account_profiles profile
    JOIN "user" auth_user ON auth_user.id = profile.auth_user_id
    LEFT JOIN ordinary_adult_eligibility eligibility ON eligibility.auth_user_id = profile.auth_user_id
    LEFT JOIN outposts outpost ON outpost.content_id = profile.current_outpost_id
    LEFT JOIN content_records content ON content.id = outpost.content_id
    LEFT JOIN civil_geographies geography ON geography.id = outpost.civil_geography_id
    WHERE profile.auth_user_id = ? AND profile.activation_state = 'active'`)
    .bind(authUserId).first<ProfileRow>()
  if (!row || row.email_verified !== 1 || row.eligibility_confirmed !== 1
    || !row.eligibility_confirmed_at || !row.attestation_version) return null
  const outpostAffiliations = row.current_outpost_id ? await affiliations(db, row.current_outpost_id) : new Map<string, string>()
  return {
    displayName: row.display_name,
    onboardingPath: row.onboarding_path,
    claimedPosition: row.claimed_position,
    claimedPositionOther: row.claimed_position_other,
    currentOutpostId: row.current_outpost_id,
    outpostClaim: row.outpost_claim,
    usaJurisdictionId: row.usa_jurisdiction_id,
    countryCode: row.country_code,
    internationalSubdivision: row.international_subdivision,
    email: row.email,
    emailVerified: true,
    currentOutpost: row.current_outpost_id && row.outpost_title && row.city && row.jurisdiction
      ? {
        id: row.current_outpost_id,
        title: row.outpost_title,
        externalNumber: row.external_number,
        city: row.city,
        jurisdiction: row.jurisdiction,
        district: outpostAffiliations.get('geographic-district') ?? null,
        region: outpostAffiliations.get('geographic-region') ?? null,
        languageOverlay: outpostAffiliations.get('language-overlay') ?? null,
        fcfTerritory: outpostAffiliations.get('fcf-territory') ?? null,
        fcfActivityStatus: row.fcf_activity_status ?? 'not-verified',
      }
      : null,
    adultEligibility: {
      confirmed: true,
      confirmedAt: row.eligibility_confirmed_at,
      attestationVersion: row.attestation_version,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

export async function updateOrdinaryProfile(
  db: D1Database,
  authUserId: string,
  value: unknown,
  expectedVersion: unknown,
  now: string,
) {
  const profile = validateOrdinaryProfileInput(value)
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new Error('Reload the Account page before saving.')
  const result = await db.prepare(`UPDATE ordinary_account_profiles SET
      display_name = ?, onboarding_path = ?, claimed_position = ?, claimed_position_other = ?,
      current_outpost_id = ?, outpost_claim = ?, usa_jurisdiction_id = ?, country_code = ?,
      international_subdivision = ?, updated_at = ?, version = version + 1
    WHERE auth_user_id = ? AND activation_state = 'active' AND version = ?`)
    .bind(
      profile.displayName,
      profile.onboardingPath,
      profile.claimedPosition,
      profile.claimedPositionOther,
      profile.currentOutpostId,
      profile.outpostClaim,
      profile.usaJurisdictionId,
      profile.countryCode,
      profile.internationalSubdivision,
      now,
      authUserId,
      expectedVersion,
    ).run()
  if ((result.meta.changes ?? 0) !== 1) throw new Error('This private profile changed after you opened it. Reload it before saving.')
  return getOrdinaryProfile(db, authUserId)
}

export async function listOrdinaryOutpostMatches(
  db: D1Database,
  input: { onboardingPath: unknown; scope: unknown; query: unknown },
): Promise<OutpostMatch[]> {
  const onboardingPath = input.onboardingPath
  const scope = typeof input.scope === 'string' ? input.scope.trim() : ''
  const query = typeof input.query === 'string' ? input.query.trim().slice(0, 80) : ''
  if ((onboardingPath !== 'usa' && onboardingPath !== 'international') || !scope || !query) return []
  const countryScope = onboardingPath === 'international' ? scope.toUpperCase() : scope
  if (onboardingPath === 'international' && !/^[A-Z]{2}$/.test(countryScope)) return []
  const pattern = `%${query.toLowerCase()}%`
  const { results } = await db.prepare(`SELECT eligible.content_id id, content.title, outpost.church,
      outpost.external_number, outpost.city, geography.name jurisdiction
    FROM public_eligible_outposts eligible
    JOIN outposts outpost ON outpost.content_id = eligible.content_id
    JOIN content_records content ON content.id = eligible.content_id
    JOIN civil_geographies geography ON geography.id = outpost.civil_geography_id
    WHERE ${onboardingPath === 'usa' ? 'geography.id = ?' : 'geography.country_code = ?'}
      AND (lower(COALESCE(outpost.external_number, '')) LIKE ?
        OR lower(outpost.church) LIKE ? OR lower(content.title) LIKE ? OR lower(outpost.city) LIKE ?)
    ORDER BY CASE WHEN lower(COALESCE(outpost.external_number, '')) = lower(?) THEN 0 ELSE 1 END,
      content.title COLLATE NOCASE, eligible.content_id
    LIMIT 10`)
    .bind(countryScope, pattern, pattern, pattern, pattern, query).all<{
      id: string; title: string; church: string; external_number: string | null; city: string; jurisdiction: string
    }>()
  return results.map((row) => ({
    id: row.id,
    title: row.title,
    church: row.church,
    externalNumber: row.external_number,
    city: row.city,
    jurisdiction: row.jurisdiction,
  }))
}
