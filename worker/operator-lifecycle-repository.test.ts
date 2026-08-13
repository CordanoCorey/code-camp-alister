import { afterEach, describe, expect, it } from 'vitest'
import { addCalendarYears, hashAcceptanceToken } from '../shared/operator-lifecycle'
import {
  acceptOperatorTransfer,
  authorizeOperatorIdentity,
  cancelOperatorTransfer,
  claimOperatorAccount,
  expireOperatorTransfer,
  renewOperatorAccount,
  stageOperatorTransfer,
  updateOperatorSettings,
} from './operator-lifecycle-repository'
import { createMigratedD1 } from './test-sqlite-d1'

const opened: Array<ReturnType<typeof createMigratedD1>> = []
const database = () => {
  const state = createMigratedD1()
  opened.push(state)
  return state
}

afterEach(() => {
  while (opened.length) opened.pop()?.close()
})

const claim = (db: D1Database, email = 'founder@example.org') => claimOperatorAccount(db, {
  displayName: 'Founder',
  email,
  currentOutpostId: null,
  confirmedAt: '2026-08-13T12:00:00.000Z',
  renewalDueAt: '2030-08-13T12:00:00.000Z',
  attestationVersion: 'operator-adult-v1',
  requestId: crypto.randomUUID(),
})

describe('fixed Operator Account transitions', () => {
  it('allows exactly one atomic first claim', async () => {
    const { db } = database()
    await claim(db)
    await expect(claim(db, 'other@example.org')).rejects.toThrow()

    expect(await authorizeOperatorIdentity(db, 'founder@example.org', '2026-08-13T12:01:00.000Z'))
      .toMatchObject({ role: 'active', principal: { tenureNumber: 1, label: 'Operator tenure 1' } })
    expect(await authorizeOperatorIdentity(db, 'other@example.org', '2026-08-13T12:01:00.000Z'))
      .toEqual({ role: 'none' })
  })

  it('rolls back a failed claim without stranding the singleton', async () => {
    const { db } = database()
    await expect(claimOperatorAccount(db, {
      displayName: 'Founder', email: 'founder@example.org', currentOutpostId: 'missing-outpost',
      confirmedAt: '2026-08-13T12:00:00.000Z', renewalDueAt: '2030-08-13T12:00:00.000Z',
      attestationVersion: 'operator-adult-v1', requestId: crypto.randomUUID(),
    })).rejects.toThrow()

    expect(await authorizeOperatorIdentity(db, 'founder@example.org', '2026-08-13T12:01:00.000Z'))
      .toEqual({ role: 'unclaimed' })
    await expect(claim(db)).resolves.toBeUndefined()
  })

  it('renews early from the current due date and writes one new due date', async () => {
    const { db, sqlite } = database()
    await claim(db)
    const principal = { tenureNumber: 1, label: 'Operator tenure 1' }
    const newDueAt = addCalendarYears('2030-08-13T12:00:00.000Z', 4)
    await renewOperatorAccount(db, {
      principal, priorDueAt: '2030-08-13T12:00:00.000Z', newDueAt,
      confirmedAt: '2030-06-13T12:00:00.000Z', requestId: crypto.randomUUID(),
    })

    expect(await authorizeOperatorIdentity(db, 'founder@example.org', '2030-06-13T12:00:01.000Z'))
      .toMatchObject({ role: 'active', account: { renewalDueAt: '2034-08-13T12:00:00.000Z', lifecycleState: 'active' } })
    await expect(renewOperatorAccount(db, {
      principal, priorDueAt: '2030-08-13T12:00:00.000Z', newDueAt,
      confirmedAt: '2030-06-13T12:00:01.000Z', requestId: 'stale-renewal',
    })).rejects.toThrow()
    expect(sqlite.prepare('SELECT COUNT(*) count FROM operator_renewal_events').get()).toEqual({ count: 1 })
    expect(sqlite.prepare(`SELECT COUNT(*) count FROM privileged_access_events
      WHERE request_id = 'stale-renewal'`).get()).toEqual({ count: 0 })
  })

  it('rejects a stale concurrent settings write without a false audit event', async () => {
    const { db, sqlite } = database()
    await claim(db)
    const principal = { tenureNumber: 1, label: 'Operator tenure 1' }
    await updateOperatorSettings(db, {
      principal, displayName: 'First winner', currentOutpostId: null, expectedVersion: 1,
      updatedAt: '2026-08-13T12:10:00.000Z', requestId: 'settings-winner',
    })
    await expect(updateOperatorSettings(db, {
      principal, displayName: 'Stale loser', currentOutpostId: null, expectedVersion: 1,
      updatedAt: '2026-08-13T12:10:01.000Z', requestId: 'settings-loser',
    })).rejects.toThrow()
    expect(sqlite.prepare('SELECT display_name, version FROM operator_account').get())
      .toEqual({ display_name: 'First winner', version: 2 })
    expect(sqlite.prepare(`SELECT COUNT(*) count FROM privileged_access_events
      WHERE request_id = 'settings-loser'`).get()).toEqual({ count: 0 })
  })
})

describe('fail-safe Operator transfer', () => {
  it('keeps the predecessor active across mismatch and cancellation', async () => {
    const { db } = database()
    await claim(db)
    const tokenHash = await hashAcceptanceToken('A'.repeat(43))
    const transferId = crypto.randomUUID()
    const predecessor = { tenureNumber: 1, label: 'Operator tenure 1' }
    await stageOperatorTransfer(db, {
      transferId, predecessor, successorDisplayName: 'Successor', successorEmail: 'successor@example.org',
      successorCurrentOutpostId: null, tokenHash, createdAt: '2026-08-13T12:05:00.000Z',
      expiresAt: '2026-08-20T12:05:00.000Z', requestId: crypto.randomUUID(), initiationKind: 'operator',
    })

    expect(await authorizeOperatorIdentity(db, 'successor@example.org', '2026-08-13T12:06:00.000Z'))
      .toMatchObject({ role: 'pending-successor', transferId })
    await expect(acceptOperatorTransfer(db, {
      transferId, successorEmail: 'wrong@example.org', tokenHash, acceptedAt: '2026-08-13T12:06:00.000Z',
      renewalDueAt: '2030-08-13T12:06:00.000Z', attestationVersion: 'operator-adult-v1', requestId: crypto.randomUUID(),
    })).rejects.toThrow()
    expect(await authorizeOperatorIdentity(db, 'founder@example.org', '2026-08-13T12:07:00.000Z'))
      .toMatchObject({ role: 'active' })

    await cancelOperatorTransfer(db, { transferId, principal: predecessor, cancelledAt: '2026-08-13T12:08:00.000Z', requestId: crypto.randomUUID() })
    expect(await authorizeOperatorIdentity(db, 'founder@example.org', '2026-08-13T12:09:00.000Z'))
      .toMatchObject({ role: 'active' })
    expect(await authorizeOperatorIdentity(db, 'successor@example.org', '2026-08-13T12:09:00.000Z'))
      .toEqual({ role: 'none' })
  })

  it('expires a seven-day transfer, scrubs successor data, and keeps the predecessor active', async () => {
    const { db, sqlite } = database()
    await claim(db)
    const transferId = crypto.randomUUID()
    await stageOperatorTransfer(db, {
      transferId, predecessor: { tenureNumber: 1, label: 'Operator tenure 1' },
      successorDisplayName: 'Successor', successorEmail: 'successor@example.org', successorCurrentOutpostId: null,
      tokenHash: await hashAcceptanceToken('E'.repeat(43)), createdAt: '2026-08-13T12:05:00.000Z',
      expiresAt: '2026-08-20T12:05:00.000Z', requestId: crypto.randomUUID(), initiationKind: 'operator',
    })
    await expireOperatorTransfer(db, {
      transferId, predecessorTenureNumber: 1, expiredAt: '2026-08-20T12:05:00.000Z', requestId: 'expire-request',
    })

    expect(await authorizeOperatorIdentity(db, 'founder@example.org', '2026-08-20T12:06:00.000Z'))
      .toMatchObject({ role: 'active', principal: { tenureNumber: 1 } })
    expect(await authorizeOperatorIdentity(db, 'successor@example.org', '2026-08-20T12:06:00.000Z'))
      .toEqual({ role: 'none' })
    expect(sqlite.prepare(`SELECT state, successor_display_name, successor_email,
      acceptance_token_hash FROM operator_transfers WHERE id = ?`).get(transferId)).toEqual({
      state: 'expired', successor_display_name: null, successor_email: null, acceptance_token_hash: null,
    })
    expect(sqlite.prepare(`SELECT action, actor_tenure_number FROM privileged_access_events
      WHERE request_id = 'expire-request'`).get()).toEqual({ action: 'transfer-expired', actor_tenure_number: 1 })
  })

  it('atomically replaces identity, opens tenure 2, and prevents token replay', async () => {
    const { db } = database()
    await claim(db)
    const tokenHash = await hashAcceptanceToken('B'.repeat(43))
    const transferId = crypto.randomUUID()
    await stageOperatorTransfer(db, {
      transferId, predecessor: { tenureNumber: 1, label: 'Operator tenure 1' },
      successorDisplayName: 'Successor', successorEmail: 'successor@example.org', successorCurrentOutpostId: null,
      tokenHash, createdAt: '2026-08-13T12:05:00.000Z', expiresAt: '2026-08-20T12:05:00.000Z',
      requestId: crypto.randomUUID(), initiationKind: 'operator',
    })
    await acceptOperatorTransfer(db, {
      transferId, successorEmail: 'successor@example.org', tokenHash, acceptedAt: '2026-08-13T12:06:00.000Z',
      renewalDueAt: '2030-08-13T12:06:00.000Z', attestationVersion: 'operator-adult-v1', requestId: crypto.randomUUID(),
    })

    expect(await authorizeOperatorIdentity(db, 'founder@example.org', '2026-08-13T12:06:01.000Z'))
      .toEqual({ role: 'none' })
    expect(await authorizeOperatorIdentity(db, 'successor@example.org', '2026-08-13T12:06:01.000Z'))
      .toMatchObject({ role: 'active', principal: { tenureNumber: 2, label: 'Operator tenure 2' }, account: { accessCleanupRequired: true } })
    await expect(acceptOperatorTransfer(db, {
      transferId, successorEmail: 'successor@example.org', tokenHash, acceptedAt: '2026-08-13T12:07:00.000Z',
      renewalDueAt: '2030-08-13T12:07:00.000Z', attestationVersion: 'operator-adult-v1', requestId: crypto.randomUUID(),
    })).rejects.toThrow()
  })

  it('rejects direct active-email edits outside the accepted transfer transition', async () => {
    const { db, sqlite } = database()
    await claim(db)
    expect(() => sqlite.prepare(`UPDATE operator_account SET verified_email = 'bypass@example.org',
      version = version + 1 WHERE singleton_key = 1`).run()).toThrow('accepted transfer')
    expect(sqlite.prepare('SELECT verified_email, active_tenure_number FROM operator_account').get())
      .toEqual({ verified_email: 'founder@example.org', active_tenure_number: 1 })
  })

  it('rejects direct closure of the sole active tenure', async () => {
    const { db, sqlite } = database()
    await claim(db)
    expect(() => sqlite.prepare(`UPDATE operator_tenures SET ended_at = ?,
      ending_event = 'accepted-transfer' WHERE tenure_number = 1`)
      .run('2026-08-13T13:00:00.000Z')).toThrow()
    expect(sqlite.prepare('SELECT ended_at, ending_event FROM operator_tenures WHERE tenure_number = 1').get())
      .toEqual({ ended_at: null, ending_event: null })
  })
})
