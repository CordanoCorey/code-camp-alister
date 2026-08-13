import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEligibilityChallenge, reserveEligibilityChallenge } from './account-eligibility'
import {
  activateOrdinaryProfile,
  createPendingOrdinaryProfile,
  getOrdinaryProfile,
  updateOrdinaryProfile,
} from './account-profile-repository'
import { createMigratedD1 } from './test-sqlite-d1'

describe('ordinary account profile repository', () => {
  let migrated: ReturnType<typeof createMigratedD1>
  beforeEach(() => { migrated = createMigratedD1() })
  afterEach(() => migrated.close())

  async function pendingProfile() {
    const now = new Date('2026-08-13T12:00:00.000Z')
    const challenge = await createEligibilityChallenge(migrated.db, { birthYear: '2000', attested: true }, now)
    const reservation = await reserveEligibilityChallenge(migrated.db, challenge.token, 'request-1', now)
    migrated.sqlite.prepare(`INSERT INTO "user"
      (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
      VALUES (?, ?, ?, 0, NULL, ?, ?)`)
      .run('auth-user-1', 'Alex', 'alex@example.test', now.toISOString(), now.toISOString())
    await createPendingOrdinaryProfile(migrated.db, {
      authUserId: 'auth-user-1',
      eligibilityChallengeId: reservation.id,
      reservationRequestId: reservation.requestId,
      now: now.toISOString(),
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
    })
    return now
  }

  it('retains only the eligibility result after verified-email activation', async () => {
    const now = await pendingProfile()
    await activateOrdinaryProfile(migrated.db, 'auth-user-1', now.toISOString())
    expect(await getOrdinaryProfile(migrated.db, 'auth-user-1')).toBeNull()

    migrated.sqlite.prepare('UPDATE "user" SET "emailVerified" = 1 WHERE id = ?').run('auth-user-1')
    await activateOrdinaryProfile(migrated.db, 'auth-user-1', now.toISOString())
    const profile = await getOrdinaryProfile(migrated.db, 'auth-user-1')
    expect(profile).toMatchObject({
      displayName: 'Alex',
      email: 'alex@example.test',
      emailVerified: true,
      claimedPosition: 'Adult Leader',
      outpostClaim: 'Outpost 12 at Example Church',
      adultEligibility: { confirmed: true, attestationVersion: 'ordinary-adult-v1' },
      version: 2,
    })
    expect(migrated.sqlite.prepare(`SELECT COUNT(*) count FROM pragma_table_info('ordinary_adult_eligibility')
      WHERE lower(name) LIKE '%birth%'`).get()).toEqual({ count: 0 })
  })

  it('uses optimistic concurrency and never creates authorization records', async () => {
    const now = await pendingProfile()
    migrated.sqlite.prepare('UPDATE "user" SET "emailVerified" = 1 WHERE id = ?').run('auth-user-1')
    await activateOrdinaryProfile(migrated.db, 'auth-user-1', now.toISOString())

    const changed = await updateOrdinaryProfile(migrated.db, 'auth-user-1', {
      displayName: 'Alexis',
      onboardingPath: 'international',
      claimedPosition: 'Other',
      claimedPositionOther: 'National ministry volunteer',
      currentOutpostId: null,
      outpostClaim: 'Unlisted association 7',
      usaJurisdictionId: null,
      countryCode: 'CA',
      internationalSubdivision: 'Ontario',
    }, 2, '2026-08-13T13:00:00.000Z')
    expect(changed).toMatchObject({ displayName: 'Alexis', onboardingPath: 'international', version: 3 })
    await expect(updateOrdinaryProfile(migrated.db, 'auth-user-1', changed, 2, '2026-08-13T14:00:00.000Z'))
      .rejects.toThrow('changed')
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM sqlite_schema WHERE type = 'table' AND name LIKE '%permission%'").get())
      .toEqual({ count: 0 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM operator_tenures').get()).toEqual({ count: 0 })
  })
})
