import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEligibilityChallenge, releaseEligibilityReservation, reserveEligibilityChallenge } from './account-eligibility'
import { createMigratedD1 } from './test-sqlite-d1'

describe('one-time adult eligibility challenges', () => {
  let migrated: ReturnType<typeof createMigratedD1>
  beforeEach(() => { migrated = createMigratedD1() })
  afterEach(() => migrated.close())

  it('never stores Birth Year and refuses concurrent/replayed reservation', async () => {
    const now = new Date('2026-08-13T12:00:00.000Z')
    const challenge = await createEligibilityChallenge(migrated.db, { birthYear: '2000', attested: true }, now)
    expect(JSON.stringify(migrated.sqlite.prepare('SELECT * FROM ordinary_account_eligibility_challenges').get()))
      .not.toContain('2000')
    await reserveEligibilityChallenge(migrated.db, challenge.token, 'request-1', now)
    await expect(reserveEligibilityChallenge(migrated.db, challenge.token, 'request-2', now)).rejects.toThrow('already used')
    await releaseEligibilityReservation(migrated.db, 'request-1')
    await reserveEligibilityChallenge(migrated.db, challenge.token, 'request-3', now)
  })

  it('rejects expired and forged challenges', async () => {
    const created = new Date('2026-08-13T12:00:00.000Z')
    const challenge = await createEligibilityChallenge(migrated.db, { birthYear: '2000', attested: true }, created)
    await expect(reserveEligibilityChallenge(migrated.db, `${challenge.token}x`, 'forged', created)).rejects.toThrow()
    await expect(reserveEligibilityChallenge(
      migrated.db,
      challenge.token,
      'expired',
      new Date('2026-08-13T12:21:00.000Z'),
    )).rejects.toThrow('expired')
  })
})
